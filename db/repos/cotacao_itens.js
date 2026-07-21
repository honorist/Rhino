/** @file Repositório de `cotacao_itens` — as LINHAS da matriz de cotação (o que
 *  se quer comprar), tabela-filha por cotacao_id. Ordena por criação (ASC) para
 *  manter a ordem em que os itens foram lançados na planilha. */
const { createRepo } = require('./_factory');

module.exports = createRepo('cotacao_itens', { orderBy: 'created_at ASC' });
