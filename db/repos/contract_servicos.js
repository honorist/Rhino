/** @file Repositório de `contract_servicos` — planilha de serviços do contrato
 *  (BM estruturado). Ordenado pela ordem definida na planilha. */
const { createRepo } = require('./_factory');

const base = createRepo('contract_servicos', { orderBy: 'ordem ASC, created_at ASC' });

module.exports = { ...base };
