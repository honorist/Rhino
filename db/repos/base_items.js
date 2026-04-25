const { createRepo } = require('./_factory');
module.exports = createRepo('base_items', { orderBy: 'description ASC' });
