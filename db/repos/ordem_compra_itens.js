/** @file Repositório de `ordem_compra_itens` — os itens de um pedido de compra,
 *  tabela-filha por ordem_id. Ordena por criação (ASC) para preservar a ordem de
 *  emissão. Guarda descrição/quantidade/preço por valor (foto da cotação). */
const { createRepo } = require('./_factory');

module.exports = createRepo('ordem_compra_itens', { orderBy: 'created_at ASC' });
