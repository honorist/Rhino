const { Pool, types } = require('pg');

// Mantém DATE como string "YYYY-MM-DD" (default do driver é Date JS).
// OID 1082 = DATE
types.setTypeParser(1082, (val) => val);

// NUMERIC/DECIMAL (OID 1700): default do driver é string para preservar precisão.
// Valores monetários do app cabem em Number sem perda — convertemos pra Number
// pra evitar bugs de concatenação ao somar (`sum + value`).
types.setTypeParser(1700, (val) => (val == null ? null : parseFloat(val)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.PG_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[pg] erro inesperado no client ocioso:', err);
});

// ============ Conversão snake_case <-> camelCase ============
function snakeToCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
function camelToSnake(s) {
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

function rowToCamel(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out;
}

function rowsToCamel(rows) {
  return rows.map(rowToCamel);
}

// ============ Helpers de query ============
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const dur = Date.now() - start;
    if (process.env.PG_LOG === '1') {
      console.log('[pg]', { text: text.slice(0, 80), dur: `${dur}ms`, rows: res.rowCount });
    }
    return res;
  } catch (e) {
    console.error('[pg] erro na query:', { text: text.slice(0, 200), err: e.message });
    throw e;
  }
}

async function getOne(text, params) {
  const { rows } = await query(text, params);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

async function getMany(text, params) {
  const { rows } = await query(text, params);
  return rowsToCamel(rows);
}

// Insere objeto camelCase numa tabela (converte chaves pra snake_case)
async function insert(table, obj) {
  const keys = Object.keys(obj);
  if (keys.length === 0) throw new Error(`insert ${table}: objeto vazio`);
  const cols = keys.map(camelToSnake);
  const placeholders = keys.map((_, i) => `$${i + 1}`);
  const values = keys.map((k) => obj[k]);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  return getOne(sql, values);
}

// Atualiza objeto camelCase pelo id (PK = "id")
async function update(table, id, obj) {
  const keys = Object.keys(obj).filter((k) => k !== 'id');
  if (keys.length === 0) return getOne(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  const sets = keys.map((k, i) => `${camelToSnake(k)} = $${i + 1}`);
  const values = keys.map((k) => obj[k]);
  values.push(id);
  const sql = `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`;
  return getOne(sql, values);
}

async function remove(table, id) {
  const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  return rowCount > 0;
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function ping() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

async function close() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  getOne,
  getMany,
  insert,
  update,
  remove,
  withTransaction,
  ping,
  close,
  rowToCamel,
  rowsToCamel,
  snakeToCamel,
  camelToSnake,
};
