const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('caixa', { orderBy: 'date DESC, created_at DESC' });

async function findByPeriod(startDate, endDate) {
  return db.getMany(
    `SELECT * FROM caixa WHERE date BETWEEN $1 AND $2 ORDER BY date DESC, created_at DESC`,
    [startDate, endDate]
  );
}

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
