const { createRepo } = require('./_factory');

module.exports = createRepo('solicitacoes_compra', { orderBy: 'created_at DESC' });
