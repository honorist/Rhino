/** @file Repositório de `base_items` — itens do BASE (overhead/custos fixos
 *  rateáveis entre contratos via `allocations`). CRUD genérico. */
const { createRepo } = require('./_factory');
module.exports = createRepo('base_items', { orderBy: 'description ASC' });
