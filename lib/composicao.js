'use strict';
/**
 * @file Composição de custos unitários — regra pura (catálogo GLOBAL, não por
 * obra), sem I/O, testável com node:test (test/composicao.test.js).
 *
 * Uma composição é a "receita" de um serviço: uma lista de insumos, cada um com
 * um tipo (mão de obra / material / equipamento), um coeficiente (quanto do
 * insumo entra em 1 unidade do serviço) e um valor unitário. O custo unitário do
 * serviço é a soma de coef × valorUnit de todos os insumos — o número que
 * alimenta o orçamento de uma proposta.
 *
 * Toda a aritmética monetária passa por lib/money para conter drift de float:
 * cada produto coef×valorUnit é arredondado a centavos antes de somar.
 *
 * Regras (definidas com o roadmap — Feature 4):
 *  - BR-COMP-001: custoUnitario(itens) = Σ (coef × valorUnit), somado em centavos.
 *  - BR-COMP-002: resumoPorTipo(itens) reparte esse custo em { mo, material,
 *    equipamento }; a soma das três partes reconstitui o custo unitário.
 */
const money = require('./money');

/** Tipos de insumo aceitos numa composição. */
const TIPOS = ['mo', 'material', 'equipamento'];
const _TIPO_SET = new Set(TIPOS);
/** Tipo assumido quando o informado é desconhecido/ausente. */
const TIPO_PADRAO = 'material';

/**
 * Coeficiente (quantidade) → número finito limpo; inválido vira 0. Não é
 * dinheiro (pode ter mais casas, ex.: produtividade 0,0125), então não passa por
 * money.parse — só é saneado.
 * @param {unknown} v
 * @returns {number}
 */
function _coef(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliza um array cru de insumos para a forma canônica
 * { tipo, descricao, coef, valorUnit }. Entrada não-array → []. Item não-objeto
 * vira um insumo zerado. Tipo desconhecido cai em TIPO_PADRAO — BR-COMP-002
 * depende de todo item ter um tipo válido para o resumo fechar com o total.
 * @param {unknown} arr
 * @returns {Array<{tipo:string, descricao:string, coef:number, valorUnit:number}>}
 */
function normalizaItens(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((it) => {
    const o = it && typeof it === 'object' ? it : {};
    return {
      tipo: _TIPO_SET.has(o.tipo) ? o.tipo : TIPO_PADRAO,
      descricao: o.descricao == null ? '' : String(o.descricao),
      coef: _coef(o.coef),
      valorUnit: money.parse(o.valorUnit),
    };
  });
}

/**
 * Custo unitário do serviço: Σ (coef × valorUnit) de cada insumo (BR-COMP-001).
 * Soma em centavos (via money) — sem drift de float.
 * @param {unknown} itens  array cru ou já normalizado.
 * @returns {number} custo em reais, 2 casas.
 */
function custoUnitario(itens) {
  const norm = normalizaItens(itens);
  return money.round2(money.sum(norm, (it) => it.coef * it.valorUnit));
}

/**
 * Reparte o custo unitário por tipo de insumo (BR-COMP-002). A soma de
 * mo + material + equipamento reconstitui custoUnitario(itens).
 * @param {unknown} itens
 * @returns {{ mo:number, material:number, equipamento:number }}
 */
function resumoPorTipo(itens) {
  const norm = normalizaItens(itens);
  const out = { mo: 0, material: 0, equipamento: 0 };
  for (const t of TIPOS) {
    out[t] = money.sum(
      norm.filter((it) => it.tipo === t),
      (it) => it.coef * it.valorUnit
    );
  }
  return out;
}

module.exports = { TIPOS, TIPO_PADRAO, normalizaItens, custoUnitario, resumoPorTipo };
