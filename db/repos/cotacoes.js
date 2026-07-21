/** @file Repositório de `cotacoes` — cabeçalho de uma cotação (mapa de preços)
 *  de compras, opcionalmente ligada a uma obra. Ordena por data de criação (mais
 *  recente primeiro). A regra de comparação (mapa, vencedor, economia) vive em
 *  lib/cotacao.js. */
const { createRepo } = require('./_factory');

module.exports = createRepo('cotacoes', { orderBy: 'created_at DESC' });
