'use strict';
/**
 * @file Helpers de dinheiro (BRL, 2 casas). Centraliza o tratamento monetário
 * para conter o acúmulo de erro de ponto flutuante (ex.: 0.1 + 0.2 = 0.30000…04).
 *
 * Padrão do projeto:
 *  - Ao GRAVAR um valor vindo de input:  money.parse(v)   (substitui parseFloat(v)||0)
 *  - Ao SOMAR/agregar muitos valores:     money.sum(arr, sel)  ou  money.round2(total)
 *  - Para aritmética exata, trabalhe em centavos: toCents / fromCents.
 *
 * Migração em andamento: nem todos os ~108 `parseFloat` do server.js foram
 * convertidos. Adote estes helpers em código novo e ao tocar nos antigos.
 */

/**
 * Arredonda para 2 casas (centavos), corrigindo drift de float. Inválido → 0.
 * @param {unknown} n
 * @returns {number}
 */
function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/**
 * Converte input (string/number) → número monetário limpo (2 casas). Lenient:
 * inválido vira 0 — mesmo contrato do antigo `parseFloat(v) || 0`, agora limpo.
 * @param {unknown} v
 * @returns {number}
 */
function parse(v) {
  return round2(parseFloat(v) || 0);
}

/**
 * Soma uma lista somando em centavos (inteiros) e voltando p/ reais — sem drift.
 * @param {Array<unknown>} arr
 * @param {(item: unknown) => unknown} [selector]
 * @returns {number}
 */
function sum(arr, selector = (x) => x) {
  if (!Array.isArray(arr)) return 0;
  const cents = arr.reduce((acc, item) => acc + Math.round((parseFloat(selector(item)) || 0) * 100), 0);
  return cents / 100;
}

/** Reais → centavos (inteiro). @param {unknown} v @returns {number} */
function toCents(v) { return Math.round((parseFloat(v) || 0) * 100); }
/** Centavos (inteiro) → reais (2 casas). @param {unknown} c @returns {number} */
function fromCents(c) { return round2((parseInt(c, 10) || 0) / 100); }

module.exports = { round2, parse, sum, toCents, fromCents };
