'use strict';
/**
 * @file DRE realizado por obra (base caixa). Regra pura — sem I/O, testável com
 * node:test (test/dre.test.js). Consolida o que efetivamente entrou/saiu do
 * caixa de um contrato numa demonstração de resultado: receita recebida −
 * custos por categoria = margem realizada.
 *
 * Por que "realizado / caixa": a tabela `caixa` é a fonte consolidada de
 * dinheiro que de fato andou por obra (todo lançamento tem contract_id +
 * category). `saidas` NÃO é custo — é Boletim de Medição (receita medida), daí o
 * `saldoAMedir` ser tratado à parte da margem.
 *
 * Regras (definidas com o usuário em 2026-07-20):
 *  - BR-DRE-001: receita realizada = Σ caixa(entrada) da categoria de nota
 *    fiscal. Aportes e outras entradas são FINANCIAMENTO, não resultado — vão em
 *    `aportes`, fora da margem.
 *  - BR-DRE-002: custos = Σ caixa(saída) agrupados em buckets canônicos;
 *    categoria de saída desconhecida cai em "Outros" (nunca é descartada).
 *  - BR-DRE-003: a categoria do caixa é livre e inconsistente no casing
 *    ("Estoque" vs "mao_de_obra") — a normalização é case-insensitive.
 *  - BR-DRE-004: margem realizada = receita recebida − custo total; o percentual
 *    é sobre a receita recebida (0 quando a receita é 0, sem divisão por zero).
 *  - BR-DRE-005: saldoAMedir = valor do contrato − total medido (Σ saidas). É
 *    DISTINTO da margem — corrige o "margin" enganoso que o dashboard exibia.
 *  - BR-DRE-006: a avaliação da margem contra a meta distingue "ainda não se
 *    moveu" de "está abaixo da meta" — ver `avaliarMargem`.
 */
const money = require('./money');

/** Categoria (caixa) de entrada que conta como receita da obra. */
const CAT_RECEITA = 'nota_fiscal';

/**
 * Meta de margem realizada (%) da empresa. Era um literal 20 escrito dentro de
 * uma template string da view (js/views/ContratoDetail.js) — aqui vira regra
 * nomeada, testada e reusável.
 */
const META_MARGEM_PCT = 20;

/**
 * Buckets de custo canônicos, em ordem de exibição. `match` é o conjunto de
 * categorias cruas (já normalizadas) que caem no bucket. Tudo que não casar vai
 * para "Outros" (BR-DRE-002).
 */
const COST_BUCKETS = [
  { key: 'mao_de_obra', label: 'Mão de obra', match: ['mao_de_obra'] },
  { key: 'material', label: 'Material / Serviços', match: ['estoque', 'fornecedor'] },
  { key: 'base', label: 'BASE / rateio', match: ['base'] },
  { key: 'frota', label: 'Frota / combustível', match: ['abastecimento'] },
  { key: 'passagem', label: 'Passagens', match: ['passagem'] },
  { key: 'outros', label: 'Outros', match: [] },
];

/** Normaliza a categoria crua do caixa: minúscula + trim (BR-DRE-003). */
function normCategoria(c) {
  return String(c || '')
    .trim()
    .toLowerCase();
}

/** Resolve a categoria normalizada de uma SAÍDA para o key do bucket. */
function bucketDeCategoria(catNorm) {
  const b = COST_BUCKETS.find((x) => x.match.includes(catNorm));
  return b ? b.key : 'outros';
}

/**
 * Monta o DRE realizado de uma obra.
 *
 * @param {object} p
 * @param {number} p.contractValue   contracts.value (receita contratada).
 * @param {number} p.totalMedido     Σ saidas.value do contrato (receita medida/BM).
 * @param {Array<{type:string, category:string, total:number|string}>} p.caixaRows
 *        Resultado de `SELECT type, category, SUM(value) AS total FROM caixa
 *        WHERE contract_id=$1 GROUP BY type, category`.
 * @returns {{
 *   contractValue:number,
 *   receita:{ recebida:number, medida:number },
 *   aportes:number,
 *   custos:Array<{key:string,label:string,total:number}>,
 *   custoTotal:number,
 *   margem:{ valor:number, pct:number },
 *   saldoAMedir:{ valor:number, pct:number }
 * }}
 */
function computeDreRealizado({ contractValue, totalMedido, caixaRows } = {}) {
  const valorContrato = money.round2(money.parse(contractValue));
  const medida = money.round2(money.parse(totalMedido));
  const rows = Array.isArray(caixaRows) ? caixaRows : [];

  let recebida = 0;
  let aportes = 0;
  const porBucket = new Map(COST_BUCKETS.map((b) => [b.key, 0]));

  for (const r of rows) {
    const valor = money.parse(r && r.total);
    const cat = normCategoria(r && r.category);
    if (r && r.type === 'entrada') {
      // BR-DRE-001: só a nota fiscal é receita; o resto é financiamento.
      if (cat === CAT_RECEITA) recebida += valor;
      else aportes += valor;
    } else if (r && r.type === 'saida') {
      // BR-DRE-002/003: agrupa por bucket canônico; desconhecida → "Outros".
      const key = bucketDeCategoria(cat);
      porBucket.set(key, porBucket.get(key) + valor);
    }
  }

  recebida = money.round2(recebida);
  aportes = money.round2(aportes);

  const custos = COST_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    total: money.round2(porBucket.get(b.key)),
  }));
  const custoTotal = money.round2(money.sum(custos, (c) => c.total));

  // BR-DRE-004: margem realizada = recebida − custo total; pct sobre a recebida.
  const margemValor = money.round2(recebida - custoTotal);
  const margemPct = recebida > 0 ? money.round2((margemValor / recebida) * 100) : 0;

  // BR-DRE-005: saldo a medir é outra coisa — valor do contrato menos o medido.
  const saldoValor = money.round2(valorContrato - medida);
  const saldoPct = valorContrato > 0 ? money.round2((saldoValor / valorContrato) * 100) : 0;

  return {
    contractValue: valorContrato,
    receita: { recebida, medida },
    aportes,
    custos,
    custoTotal,
    margem: { valor: margemValor, pct: margemPct },
    saldoAMedir: { valor: saldoValor, pct: saldoPct },
  };
}

/**
 * Classifica a margem realizada contra a meta da empresa (BR-DRE-006).
 *
 * O estado que importa é `sem_movimento`: obra recém-criada tem receita 0 e
 * custo 0, logo margemPct 0 — e a view, comparando só o percentual, exibia
 * "⚠ faltam 20,0pp" no primeiro segundo de vida do contrato. Zero por falta de
 * movimento não é o mesmo que zero por desempenho ruim. Basta UM dos dois lados
 * ter andado (já gastou, mesmo sem faturar) para a obra passar a ser avaliada
 * de verdade.
 *
 * @param {object} p
 * @param {number} p.margemPct        Margem realizada (%) — `margem.pct` do DRE.
 * @param {number} p.receitaRecebida  Receita recebida (caixa) da obra.
 * @param {number} p.custoTotal       Custo total realizado da obra.
 * @param {number} [p.metaPct]        Meta de margem (%); default META_MARGEM_PCT.
 * @returns {{ status:'sem_movimento'|'prejuizo'|'abaixo_meta'|'ok',
 *             faltamPp:number|null, faltamValor:number|null, metaPct:number }}
 *          `faltamPp`/`faltamValor` são null quando não há distância a cobrar
 *          (sem movimento ou já na meta) — a tela não deve inventar uma cobrança.
 */
function avaliarMargem({ margemPct, receitaRecebida, custoTotal, metaPct = META_MARGEM_PCT } = {}) {
  const pct = Number(margemPct) || 0;
  const recebida = money.parse(receitaRecebida);
  const custo = money.parse(custoTotal);
  const meta = Number(metaPct) || 0;

  // BR-DRE-006: nada entrou e nada saiu → não há resultado a julgar.
  if (recebida === 0 && custo === 0) {
    return { status: 'sem_movimento', faltamPp: null, faltamValor: null, metaPct: meta };
  }

  if (pct >= meta) {
    return { status: 'ok', faltamPp: null, faltamValor: null, metaPct: meta };
  }

  const faltamPp = money.round2(meta - pct);
  // Quanto de margem falta em R$: a margem-alvo sobre a receita já recebida
  // menos a margem realizada. Sem receita recebida ainda não há base — o valor
  // fica null e só o gap em pontos percentuais é informado.
  const faltamValor =
    recebida > 0 ? money.round2((meta / 100) * recebida - (pct / 100) * recebida) : null;

  return {
    status: pct < 0 ? 'prejuizo' : 'abaixo_meta',
    faltamPp,
    faltamValor,
    metaPct: meta,
  };
}

module.exports = {
  computeDreRealizado,
  avaliarMargem,
  COST_BUCKETS,
  CAT_RECEITA,
  META_MARGEM_PCT,
  normCategoria,
  bucketDeCategoria,
};
