'use strict';
/**
 * @file Cálculo da próxima data de uma conta a pagar recorrente.
 *
 * Regra extraída de server.js (`_calcProximaData`) para virar testável e ter
 * uma única fonte da verdade. Comportamento preservado byte a byte — inclusive
 * o transbordo de fim de mês do `Date.setMonth` (ex.: 31/01 → 03/03).
 */

/**
 * Próxima data de vencimento, dada a data atual e a periodicidade.
 *
 * @param {string} dateStr       Data ISO `YYYY-MM-DD`.
 * @param {string} periodicidade  semanal | quinzenal | mensal | trimestral | semestral | anual.
 *                                Qualquer valor não reconhecido cai em mensal.
 * @returns {string}             Próxima data ISO `YYYY-MM-DD`.
 */
function proximaData(dateStr, periodicidade) {
  const d = new Date(dateStr + 'T12:00:00');
  switch (periodicidade) {
    case 'semanal':    d.setDate(d.getDate() + 7); break;
    case 'quinzenal':  d.setDate(d.getDate() + 15); break;
    case 'trimestral': d.setMonth(d.getMonth() + 3); break;
    case 'semestral':  d.setMonth(d.getMonth() + 6); break;
    case 'anual':      d.setFullYear(d.getFullYear() + 1); break;
    default:           d.setMonth(d.getMonth() + 1); // mensal
  }
  return d.toISOString().split('T')[0];
}

module.exports = { proximaData };
