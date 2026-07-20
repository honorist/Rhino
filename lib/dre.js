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
 */
const money = require('./money');

/** Categoria (caixa) de entrada que conta como receita da obra. */
const CAT_RECEITA = 'nota_fiscal';

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

module.exports = { computeDreRealizado, COST_BUCKETS, CAT_RECEITA, normCategoria, bucketDeCategoria };
