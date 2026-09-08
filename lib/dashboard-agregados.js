'use strict';
/**
 * @file Agregações puras (sem I/O) do dashboard financeiro consolidado —
 * "Custo por categoria" e "Receita por cliente", somando TODOS os contratos.
 * Mesmo agrupamento por `category` já usado por contrato em
 * js/views/contrato/charts.js#renderPizza, aqui só consolidado. Extraído em
 * lib/ pra ser testável sem I/O (handlers/dashboards.js só chama e serializa).
 */

/**
 * Soma o valor das saídas de caixa por categoria, olhando todos os
 * contratos. Saída sem `category` cai em 'outros' (mesmo fallback usado na
 * escrita, handlers/caixa.js).
 * @param {Array<{type:string, category?:string, value:number}>} [caixaEntries]
 * @returns {Record<string, number>}
 */
function custoPorCategoria(caixaEntries) {
  const out = {};
  for (const e of caixaEntries || []) {
    if (e.type !== 'saida') continue;
    const cat = e.category || 'outros';
    out[cat] = (out[cat] || 0) + (e.value || 0);
  }
  return out;
}

/**
 * Soma o valor das entradas de caixa por cliente (via contractId → contrato
 * → client), ordenado do maior pro menor total. Entrada sem `contractId` ou
 * de um contrato que não existe mais entra em 'Sem contrato'.
 * @param {Array<{type:string, contractId?:string|null, value:number}>} [caixaEntries]
 * @param {Array<{id:string, client?:string, name?:string}>} [contracts]
 * @returns {Array<{cliente:string, total:number}>}
 */
function receitaPorCliente(caixaEntries, contracts) {
  const clientePorContrato = new Map(
    (contracts || []).map((c) => [c.id, c.client || c.name || c.id])
  );
  const totals = new Map();
  for (const e of caixaEntries || []) {
    if (e.type !== 'entrada') continue;
    const cliente =
      e.contractId && clientePorContrato.has(e.contractId)
        ? clientePorContrato.get(e.contractId)
        : 'Sem contrato';
    totals.set(cliente, (totals.get(cliente) || 0) + (e.value || 0));
  }
  return [...totals.entries()]
    .map(([cliente, total]) => ({ cliente, total }))
    .sort((a, b) => b.total - a.total);
}

module.exports = { custoPorCategoria, receitaPorCliente };
