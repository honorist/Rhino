/** @file Repositório de `veiculo_abastecimentos` — histórico de abastecimentos.
 *  Ordenado por data DESC. */
const { createRepo } = require('./_factory');

module.exports = createRepo('veiculo_abastecimentos', { orderBy: 'data DESC, created_at DESC' });
