/**
 * @file Repositório de `caixa` — entradas e saídas financeiras.
 *
 * Estende CRUD básico com helpers de período e agregação. A tabela é a fonte
 * de verdade do saldo de caixa; entries são imutáveis após criação exceto via
 * `updateById` (que respeita ownership). Tabela cresce indefinidamente —
 * paginação é mandatória em listagens (TODO P1-3 da DB review).
 */
const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('caixa', { orderBy: 'date DESC, created_at DESC' });

/**
 * Retorna entradas/saídas dentro de um intervalo de datas (inclusive nas pontas).
 *
 * @param {string} startDate  ISO `YYYY-MM-DD`.
 * @param {string} endDate    ISO `YYYY-MM-DD`.
 * @returns {Promise<object[]>}
 */
async function findByPeriod(startDate, endDate) {
  return db.getMany(
    `SELECT * FROM caixa WHERE date BETWEEN $1 AND $2 ORDER BY date DESC, created_at DESC`,
    [startDate, endDate]
  );
}

/**
 * Soma de `value` filtrada por tipo (entrada/saida) e opcionalmente por
 * período + contractId. Conversão para Number aqui captura o caveat do
 * P0-3 (precisão de NUMERIC) — para somas críticas, considere agregação SQL.
 *
 * @param {'entrada'|'saida'} type
 * @param {{ startDate?: string, endDate?: string, contractId?: string }} [filters]
 * @returns {Promise<number>}
 */
async function totalByType(type, filters = {}) {
  const conds = ['type = $1'];
  const values = [type];
  if (filters.startDate) { values.push(filters.startDate); conds.push(`date >= $${values.length}`); }
  if (filters.endDate)   { values.push(filters.endDate);   conds.push(`date <= $${values.length}`); }
  if (filters.contractId){ values.push(filters.contractId);conds.push(`contract_id = $${values.length}`); }
  const sql = `SELECT COALESCE(SUM(value), 0)::numeric AS total FROM caixa WHERE ${conds.join(' AND ')}`;
  const row = await db.getOne(sql, values);
  return row ? Number(row.total) : 0;
}

module.exports = { ...base, findByPeriod, totalByType };
