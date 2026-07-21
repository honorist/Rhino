/** @file Repositório de `ordens_compra` — o pedido de compra (PO) emitido para um
 *  fornecedor a partir de uma cotação. Ordena por data de criação (mais recente
 *  primeiro). Os itens do pedido ficam em ordem_compra_itens. */
const { createRepo } = require('./_factory');

module.exports = createRepo('ordens_compra', { orderBy: 'created_at DESC' });
