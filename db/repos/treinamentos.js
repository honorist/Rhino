/** @file Repositório de `treinamentos` — matriz de treinamentos NR por
 *  colaborador (feature 8), tabela-filha por recurso_id. Ordena por data de
 *  validade ascendente para o próximo a vencer aparecer primeiro. */
const { createRepo } = require('./_factory');

module.exports = createRepo('treinamentos', { orderBy: 'data_validade ASC' });
