/**
 * @file Repositório de `folha_pagamento_itens` — descontos e proventos lançados
 * em uma linha de folha. Uma linha por lançamento (tipo: 'desconto' | 'provento').
 *
 * Estende o CRUD genérico com buscas por linha de folha.
 */
const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('folha_pagamento_itens', { orderBy: 'created_at ASC' });

/**
 * Lista os lançamentos de uma linha de folha.
 * @param {string} folhaId
 * @returns {Promise<object[]>}
 */
async function findByFolha(folhaId) {
  return db.getMany(
    `SELECT * FROM folha_pagamento_itens WHERE folha_pagamento_id = $1 ORDER BY created_at ASC`,
    [folhaId]
  );
}

/**
 * Busca em lote os lançamentos de várias linhas de folha (evita N+1).
 * @param {string[]} ids
 * @returns {Promise<object[]>}
 */
async function findByFolhaIds(ids) {
  if (!ids || ids.length === 0) return [];
  return db.getMany(
    `SELECT * FROM folha_pagamento_itens WHERE folha_pagamento_id = ANY($1::text[]) ORDER BY created_at ASC`,
    [ids]
  );
}

module.exports = { ...base, findByFolha, findByFolhaIds };
