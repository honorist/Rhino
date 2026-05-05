const { createRepo } = require('./_factory');

module.exports = createRepo('veiculo_planos', { orderBy: 'descricao ASC' });
