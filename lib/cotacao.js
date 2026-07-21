'use strict';
/**
 * @file Cotações — mapa comparativo de preços e pedido de compra: regras puras,
 * sem I/O, testáveis com node:test (test/cotacao.test.js).
 *
 * Fluxo de compras: para um conjunto de ITENS (o que se quer comprar), coletam-se
 * PREÇOS de vários fornecedores — a matriz item×fornecedor do "mapa de cotações".
 * Compara-se e emite-se um pedido de compra (PO) do vencedor.
 *
 * `precos` é a matriz esparsa: cada célula é { itemId, fornecedorId, precoUnit }.
 * Só preços > 0 concorrem — uma célula 0 (ou ausente) significa "não cotou", não
 * "de graça". Essa regra vale em todo lugar: matriz, vencedor, totais e economia.
 *
 * Toda a aritmética monetária passa por lib/money (soma em centavos) para conter
 * drift de float. Quantidade não é dinheiro (pode ter mais casas), então só é
 * saneada.
 *
 * Regras (definidas com o roadmap — item 13):
 *  - BR-COT-001: mapa(itens, precos) monta a matriz — por item, a célula de cada
 *    fornecedor com precoUnit e subtotal (quantidade × precoUnit). Colunas =
 *    fornecedores com ao menos um preço válido, na ordem em que aparecem.
 *  - BR-COT-002: melhorPorItem(itens, precos) elege o vencedor de cada item: o
 *    menor precoUnit > 0 (empate → o primeiro). Item sem preço válido não tem
 *    vencedor (fornecedorId null).
 *  - BR-COT-003: totaisPorFornecedor(itens, precos) soma, por fornecedor, o
 *    subtotal dos itens que ele cotou (precoUnit > 0) e conta quantos itens
 *    cotou. Ordenado do menor total ao maior (o 1º é o candidato a vencedor).
 *  - BR-COT-004: economia(itens, precos) = (média − menor) dos preços válidos de
 *    cada item, vezes a quantidade; a soma dá a economia total. Item com 0 ou 1
 *    preço válido → economia 0 (média == menor).
 *  - BR-COT-005: totalOrdem(ordemItens) = Σ (quantidade × precoUnit) dos itens do
 *    pedido de compra.
 */
const money = require('./money');

/** Estados de uma cotação, do início ao fim do fluxo. */
const STATUS_COTACAO = ['aberta', 'em_analise', 'fechada', 'cancelada'];
/** Estados de um pedido de compra emitido. */
const STATUS_ORDEM = ['emitida', 'recebida', 'cancelada'];

const _ST_COT = new Set(STATUS_COTACAO);
const _ST_ORD = new Set(STATUS_ORDEM);

/** Normaliza um status de cotação desconhecido para 'aberta'. */
function normalizarStatusCotacao(s) {
  return _ST_COT.has(s) ? s : 'aberta';
}
/** Normaliza um status de pedido desconhecido para 'emitida'. */
function normalizarStatusOrdem(s) {
  return _ST_ORD.has(s) ? s : 'emitida';
}

/**
 * Quantidade → número finito não-negativo; inválido ou negativo vira 0. Não é
 * dinheiro, então não passa por money.parse (pode ter mais casas decimais).
 * @param {unknown} v
 * @returns {number}
 */
function _qtd(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Preço unitário → número monetário limpo (2 casas), nunca negativo. 0 = "não
 * cotou". @param {unknown} v @returns {number}
 */
function _preco(v) {
  const n = money.parse(v);
  return n > 0 ? n : 0;
}

/**
 * Índice { itemId -> [ { fornecedorId, precoUnit } ] } a partir da matriz esparsa
 * de preços. Células sem itemId são ignoradas; precoUnit já vem saneado.
 * @param {Array<object>} precos
 * @returns {Map<string, Array<{fornecedorId: string|null, precoUnit: number}>>}
 */
function _indicePrecos(precos) {
  const idx = new Map();
  for (const p of Array.isArray(precos) ? precos : []) {
    if (!p || p.itemId == null) continue;
    const key = String(p.itemId);
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push({
      fornecedorId: p.fornecedorId == null ? null : p.fornecedorId,
      precoUnit: _preco(p.precoUnit),
    });
  }
  return idx;
}

/**
 * BR-COT-001: matriz do mapa. Para cada item, a célula de cada fornecedor que o
 * cotou (precoUnit > 0), com precoUnit e subtotal (quantidade × precoUnit).
 * `fornecedorIds` são as colunas (fornecedores distintos com ao menos um preço
 * válido), na ordem de aparição — pronto para renderizar o cabeçalho da tabela.
 * @param {Array<object>} itens   { id, descricao, unidade, quantidade }
 * @param {Array<object>} precos  { itemId, fornecedorId, precoUnit }
 * @returns {{ fornecedorIds: string[], linhas: Array<{ itemId: (string|null), descricao: string, unidade: string, quantidade: number, celulas: Record<string, {precoUnit: number, subtotal: number}> }> }}
 */
function mapa(itens, precos) {
  const idx = _indicePrecos(precos);
  const fornecedorIds = [];
  const vistos = new Set();
  const linhas = (Array.isArray(itens) ? itens : []).map((it) => {
    const item = it && typeof it === 'object' ? it : {};
    const quantidade = _qtd(item.quantidade);
    const celulas = {};
    for (const c of idx.get(String(item.id)) || []) {
      if (c.precoUnit <= 0 || c.fornecedorId == null) continue;
      const fid = String(c.fornecedorId);
      celulas[fid] = { precoUnit: c.precoUnit, subtotal: money.round2(quantidade * c.precoUnit) };
      if (!vistos.has(fid)) { vistos.add(fid); fornecedorIds.push(fid); }
    }
    return {
      itemId: item.id == null ? null : item.id,
      descricao: item.descricao == null ? '' : String(item.descricao),
      unidade: item.unidade == null ? 'un' : String(item.unidade),
      quantidade,
      celulas,
    };
  });
  return { fornecedorIds, linhas };
}

/**
 * BR-COT-002: vencedor de cada item — o menor precoUnit > 0. Empate mantém o
 * primeiro na ordem dos preços. Item sem preço válido → fornecedorId null.
 * @param {Array<object>} itens
 * @param {Array<object>} precos
 * @returns {Array<{ itemId: (string|null), descricao: string, quantidade: number, fornecedorId: (string|null), precoUnit: number, subtotal: number }>}
 */
function melhorPorItem(itens, precos) {
  const idx = _indicePrecos(precos);
  return (Array.isArray(itens) ? itens : []).map((it) => {
    const item = it && typeof it === 'object' ? it : {};
    const quantidade = _qtd(item.quantidade);
    let melhor = null;
    for (const c of idx.get(String(item.id)) || []) {
      if (c.precoUnit <= 0 || c.fornecedorId == null) continue;
      if (melhor === null || c.precoUnit < melhor.precoUnit) melhor = c;
    }
    return {
      itemId: item.id == null ? null : item.id,
      descricao: item.descricao == null ? '' : String(item.descricao),
      quantidade,
      fornecedorId: melhor ? melhor.fornecedorId : null,
      precoUnit: melhor ? melhor.precoUnit : 0,
      subtotal: melhor ? money.round2(quantidade * melhor.precoUnit) : 0,
    };
  });
}

/**
 * BR-COT-003: por fornecedor, o total (Σ subtotal dos itens que ele cotou com
 * preço > 0) e quantos itens cotou. Ordena do menor total ao maior — o primeiro
 * é o candidato natural a vencedor global do pedido.
 * @param {Array<object>} itens
 * @param {Array<object>} precos
 * @returns {Array<{ fornecedorId: string, total: number, itensCotados: number }>}
 */
function totaisPorFornecedor(itens, precos) {
  const idx = _indicePrecos(precos);
  const acc = new Map(); // fornecedorId -> { cents, itensCotados }
  for (const it of Array.isArray(itens) ? itens : []) {
    const item = it && typeof it === 'object' ? it : {};
    const q = _qtd(item.quantidade);
    for (const c of idx.get(String(item.id)) || []) {
      if (c.precoUnit <= 0 || c.fornecedorId == null) continue;
      const fid = String(c.fornecedorId);
      if (!acc.has(fid)) acc.set(fid, { cents: 0, itensCotados: 0 });
      const a = acc.get(fid);
      a.cents += Math.round(q * c.precoUnit * 100);
      a.itensCotados += 1;
    }
  }
  return Array.from(acc.entries())
    .map(([fornecedorId, a]) => ({ fornecedorId, total: a.cents / 100, itensCotados: a.itensCotados }))
    .sort((x, y) => x.total - y.total);
}

/**
 * BR-COT-004: economia por item e total. Para cada item, entre os preços válidos
 * (> 0): média e menor; economiaUnit = média − menor; economiaTotal = economiaUnit
 * × quantidade. Item com 0 ou 1 preço válido → economia 0 (média == menor). A
 * economia total é a soma das economias de cada item.
 * @param {Array<object>} itens
 * @param {Array<object>} precos
 * @returns {{ itens: Array<{ itemId: (string|null), media: number, menor: number, economiaUnit: number, economiaTotal: number }>, total: number }}
 */
function economia(itens, precos) {
  const idx = _indicePrecos(precos);
  let totalCents = 0;
  const linhas = (Array.isArray(itens) ? itens : []).map((it) => {
    const item = it && typeof it === 'object' ? it : {};
    const q = _qtd(item.quantidade);
    const validos = (idx.get(String(item.id)) || [])
      .map((c) => c.precoUnit)
      .filter((p) => p > 0);
    let media = 0, menor = 0, economiaUnit = 0, economiaTotal = 0;
    if (validos.length > 0) {
      const somaCents = validos.reduce((a, p) => a + Math.round(p * 100), 0);
      media = money.round2(somaCents / 100 / validos.length);
      menor = Math.min(...validos);
      economiaUnit = money.round2(media - menor);
      economiaTotal = money.round2(economiaUnit * q);
    }
    totalCents += Math.round(economiaTotal * 100);
    return { itemId: item.id == null ? null : item.id, media, menor, economiaUnit, economiaTotal };
  });
  return { itens: linhas, total: totalCents / 100 };
}

/**
 * BR-COT-005: valor total de um pedido de compra = Σ (quantidade × precoUnit) de
 * seus itens, somado em centavos (sem drift). Entrada não-array → 0.
 * @param {Array<{ quantidade: number, precoUnit: number }>} ordemItens
 * @returns {number}
 */
function totalOrdem(ordemItens) {
  const lista = Array.isArray(ordemItens) ? ordemItens : [];
  return money.sum(lista, (it) => _qtd(it && it.quantidade) * _preco(it && it.precoUnit));
}

module.exports = {
  STATUS_COTACAO,
  STATUS_ORDEM,
  normalizarStatusCotacao,
  normalizarStatusOrdem,
  mapa,
  melhorPorItem,
  totaisPorFornecedor,
  economia,
  totalOrdem,
};
