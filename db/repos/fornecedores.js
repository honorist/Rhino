const { createRepo } = require('./_factory');
module.exports = createRepo('fornecedores', { orderBy: 'nome ASC' });
