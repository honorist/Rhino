const { createRepo } = require('./_factory');

const base = createRepo('saidas', { orderBy: 'date DESC, created_at DESC' });

module.exports = { ...base };
