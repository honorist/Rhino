/** @file Repositório de `cotacao_precos` — a matriz esparsa item×fornecedor: uma
 *  linha por célula de preço, filha por cotacao_id e item_id. Ordena por criação
 *  (ASC); a leitura vira uma matriz em lib/cotacao.mapa(). */
const { createRepo } = require('./_factory');

module.exports = createRepo('cotacao_precos', { orderBy: 'created_at ASC' });
