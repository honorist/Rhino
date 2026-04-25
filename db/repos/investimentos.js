const { createRepo } = require('./_factory');
module.exports = createRepo('investimentos', { orderBy: 'date DESC NULLS LAST, created_at DESC' });
