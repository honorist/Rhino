/** @file Repositório de `epi_entregas` — ficha de entrega de EPIs por colaborador
 *  (item 9). Tabela-filha por recurso_id. CRUD genérico basta: a regra (precisa
 *  troca? status? resumo?) vive em lib/epi.js e é aplicada no handler. */
const { createRepo } = require('./_factory');

module.exports = createRepo('epi_entregas', { orderBy: 'created_at DESC' });
