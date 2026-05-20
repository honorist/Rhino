/**
 * @file Repositório de `folha_pagamento` — controle de pagamento mensal de
 * colaboradores. Uma linha por (colaborador, competência 'YYYY-MM').
 *
 * Estende o CRUD genérico com busca por competência.
 */
const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('folha_pagamento', { orderBy: 'created_at ASC' });

/**
 * Lista as linhas de folha de uma competência ('YYYY-MM').
 * @param {string} competencia
 * @returns {Promise<object[]>}
 */
async function findByCompetencia(competencia) {
  return db.getMany(
    `SELECT * FROM folha_pagamento WHERE competencia = $1 ORDER BY recurso_nome ASC`,
    [competencia]
  );
}

module.exports = { ...base, findByCompetencia };
