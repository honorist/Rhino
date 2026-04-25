const { createRepo } = require('./_factory');

const base = createRepo('organograma_membros', { orderBy: 'created_at ASC' });

module.exports = { ...base };
