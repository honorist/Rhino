/** @file Repositório de `contract_ocorrencias` — registro de eventos/notas
 *  do contrato (não-conformidades, suspensões, observações). Ordenado por data DESC. */
const { createRepo } = require('./_factory');
const base = createRepo('contract_ocorrencias', { orderBy: 'data DESC, created_at DESC' });
module.exports = { ...base };
