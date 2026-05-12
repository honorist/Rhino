/** @file Repositório de `contract_marcos` — marcos/milestones do cronograma
 *  contratual. Ordenado por `ordem` (sequência definida pelo usuário). */
const { createRepo } = require('./_factory');
const base = createRepo('contract_marcos', { orderBy: 'ordem ASC, prazo ASC NULLS LAST, created_at ASC' });
module.exports = { ...base };
