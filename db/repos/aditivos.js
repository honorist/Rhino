const { createRepo } = require('./_factory');
const base = createRepo('contract_aditivos', { orderBy: 'data DESC, created_at DESC' });
module.exports = { ...base };
