/** @file Repositório de `veiculo_manutencoes` — histórico de manutenções
 *  realizadas (corretivas e preventivas). Ordenado por data DESC. */
const { createRepo } = require('./_factory');

module.exports = createRepo('veiculo_manutencoes', { orderBy: 'data DESC, created_at DESC' });
