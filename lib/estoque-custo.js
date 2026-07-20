'use strict';
/**
 * @file Custo médio ponderado de estoque — regra pura extraída do handler de
 * recebimento de compra (handlers/compras.js › handleReceberSolicitacao) para
 * ficar testável (steering §: regra de negócio em lib/, com teste).
 *
 * Média móvel ponderada clássica: ao dar entrada de `qtdEntrada` a
 * `precoUnitEntrada`, o novo custo médio é a média do saldo anterior (à sua
 * média antiga) com a entrada (ao seu preço), ponderada pelas quantidades.
 */

/**
 * @param {object} p
 * @param {number} p.saldoTotal            Saldo TOTAL do item já COM a entrada somada.
 * @param {number} p.qtdEntrada            Quantidade que acabou de entrar.
 * @param {number} p.custoMedioAnterior    Custo médio antes desta entrada.
 * @param {number} p.precoUnitEntrada      Preço unitário desta entrada.
 * @returns {number} Novo custo médio ponderado. Se o saldo total for 0 (ou
 *   negativo), cai no preço da própria entrada — não há base anterior a ponderar.
 */
function custoMedioPonderado({ saldoTotal, qtdEntrada, custoMedioAnterior, precoUnitEntrada }) {
  const st = parseFloat(saldoTotal) || 0;
  const qe = parseFloat(qtdEntrada) || 0;
  const cma = parseFloat(custoMedioAnterior) || 0;
  const pu = parseFloat(precoUnitEntrada) || 0;
  const saldoAnterior = st - qe;
  if (st > 0) {
    return (saldoAnterior * cma + qe * pu) / st;
  }
  return pu;
}

module.exports = { custoMedioPonderado };
