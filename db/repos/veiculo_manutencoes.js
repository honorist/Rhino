const { createRepo } = require('./_factory');

module.exports = createRepo('veiculo_manutencoes', { orderBy: 'data DESC, created_at DESC' });
