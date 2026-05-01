const { createRepo } = require('./_factory');
const base = createRepo('contract_ocorrencias', { orderBy: 'data DESC, created_at DESC' });
module.exports = { ...base };
