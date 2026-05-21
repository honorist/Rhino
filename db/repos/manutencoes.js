/** @file Repositório de `manutencoes` — equipamentos enviados para reparo.
 *  Ciclo de status: em_manutencao → retornado (ou cancelada). */
const { createRepo } = require('./_factory');

module.exports = createRepo('manutencoes', { orderBy: 'created_at DESC' });
