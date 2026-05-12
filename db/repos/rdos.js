/**
 * @file Repositório de `rdos` — Relatórios Diários de Obra.
 *
 * Estende CRUD com helpers para listagem cross-contract (JOIN com contracts)
 * e estatísticas de aderência (última data por contrato).
 */
const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('rdos', { orderBy: 'data DESC, created_at DESC' });

/**
 * Lista achatada de TODOS os RDOs com nome e cliente do contrato (JOIN).
 * Usado pela tela "RDOs" (global, sem filtro de contrato).
 *
 * @returns {Promise<object[]>}
 */
async function findAllFlat() {
  return db.getMany(`
    SELECT r.id, r.contract_id, r.numero, r.data, r.dia_semana, r.os_numero,
           r.created_at, r.updated_at,
           c.name AS contract_name, c.client AS contract_client
    FROM rdos r
    JOIN contracts c ON c.id = r.contract_id
    ORDER BY r.data DESC NULLS LAST, r.created_at DESC
  `);
}

/**
 * Mapa de última data de RDO por contrato. Usado em alertas de "obras sem
 * RDO há N dias" (aderência).
 *
 * @returns {Promise<Record<string, string>>}  `{ contractId: 'YYYY-MM-DD' }`.
 */
async function lastRdoDateByContract() {
  const rows = await db.getMany(`
    SELECT contract_id, MAX(data) AS last_data FROM rdos GROUP BY contract_id
  `);
  const out = {};
  for (const r of rows) out[r.contractId] = r.lastData;
  return out;
}

module.exports = { ...base, findAllFlat, lastRdoDateByContract };
