const { createRepo } = require('./_factory');
module.exports = createRepo('clientes', { orderBy: 'nome ASC' });
