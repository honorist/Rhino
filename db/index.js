/**
 * @file Camada de acesso ao PostgreSQL.
 *
 * - Pool de conexões via `pg` (parametrizável por env).
 * - Helpers `query`, `getOne`, `getMany` que retornam rows em camelCase (auto-
 *   convertidos a partir do snake_case do DB).
 * - `insert`/`update`/`remove` que aceitam objetos camelCase e cuidam de
 *   placeholders/RETURNING.
 * - `withTransaction(fn)` para operações multi-step atômicas.
 *
 * Tipos especiais:
 * - DATE (OID 1082) → string `YYYY-MM-DD` (sem conversão para Date JS, que
 *   adicionaria fuso e quebraria comparações).
 * - NUMERIC (OID 1700) → Number (parseFloat). Atenção P0-3 da DB review:
 *   precisão pode ser perdida em somas acumuladas — para totalizações
 *   financeiras críticas, considerar somar como string ou usar BigInt.
 */

const { Pool, types } = require('pg');

// DATE como string "YYYY-MM-DD" — preserva o "encoding humano" da data.
types.setTypeParser(1082, (val) => val);

// NUMERIC/DECIMAL como Number — valores monetários do app cabem; ver caveat acima.
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

/**
 * Converte `snake_case` → `camelCase`. Usado em nomes de colunas → propriedades JS.
 * @param {string} s
 * @returns {string}
 */
function snakeToCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Converte `camelCase` → `snake_case`. Inverso de `snakeToCamel`.
 * @param {string} s
 * @returns {string}
 */
function camelToSnake(s) {
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

/**
 * Converte chaves de um row do PG (snake) para camelCase.
 * @param {Record<string, unknown> | null} row
 * @returns {Record<string, unknown> | null}
 */
function rowToCamel(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out;
}

/**
 * Aplica `rowToCamel` em um array de rows.
 * @param {Record<string, unknown>[]} rows
 * @returns {Record<string, unknown>[]}
 */
function rowsToCamel(rows) {
  return rows.map(rowToCamel);
}

// ============ Helpers de query ============

/**
 * Executa uma query no pool. Loga em `[pg]` se `PG_LOG=1` está no env.
 *
 * @param {string} text  SQL parametrizado.
 * @param {unknown[]} [params]
 * @returns {Promise<import('pg').QueryResult>}
 */
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

/**
 * Retorna a primeira linha ou `null`, com chaves em camelCase.
 *
 * @template T
 * @param {string} text
 * @param {unknown[]} [params]
 * @returns {Promise<T | null>}
 */
async function getOne(text, params) {
  const { rows } = await query(text, params);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

/**
 * Retorna todas as linhas com chaves em camelCase.
 *
 * @template T
 * @param {string} text
 * @param {unknown[]} [params]
 * @returns {Promise<T[]>}
 */
async function getMany(text, params) {
  const { rows } = await query(text, params);
  return rowsToCamel(rows);
}

/**
 * INSERT genérico — aceita objeto camelCase, converte chaves para snake_case,
 * usa placeholders parametrizados, retorna a row inserida.
 *
 * @param {string} table
 * @param {Record<string, unknown>} obj
 * @returns {Promise<object>}
 */
async function insert(table, obj) {
  const keys = Object.keys(obj);
  if (keys.length === 0) throw new Error(`insert ${table}: objeto vazio`);
  const cols = keys.map(k => `"${camelToSnake(k)}"`);
  const placeholders = keys.map((_, i) => `$${i + 1}`);
  const values = keys.map((k) => obj[k]);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  return getOne(sql, values);
}

/**
 * UPDATE genérico pelo id (PK = "id"). Ignora a chave `id` no SET.
 *
 * @param {string} table
 * @param {string|number} id
 * @param {Record<string, unknown>} obj
 * @returns {Promise<object | null>}
 */
async function update(table, id, obj) {
  const keys = Object.keys(obj).filter((k) => k !== 'id');
  if (keys.length === 0) return getOne(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  const sets = keys.map((k, i) => `"${camelToSnake(k)}" = $${i + 1}`);
  const values = keys.map((k) => obj[k]);
  values.push(id);
  const sql = `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`;
  return getOne(sql, values);
}

/**
 * DELETE pelo id. Retorna `true` se uma linha foi deletada.
 *
 * @param {string} table
 * @param {string|number} id
 * @returns {Promise<boolean>}
 */
async function remove(table, id) {
  const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  return rowCount > 0;
}

/**
 * Executa uma função dentro de uma transação. Faz BEGIN, executa `fn(client)`,
 * COMMIT em sucesso ou ROLLBACK em exceção. Cliente sempre é liberado.
 *
 * IMPORTANTE: dentro de `fn`, use `client.query(...)` direto para operações
 * que precisam ser atômicas. Chamar repos (que usam pool) NÃO compartilha a
 * transação — pode ser usado intencionalmente quando se quer apenas
 * serialização via lock advisory, mas writes via repos vão commitar imediatamente.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
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

/**
 * Healthcheck — `SELECT 1`. Útil em `/api/health`.
 * @returns {Promise<boolean>}
 */
async function ping() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

/**
 * Encerra o pool. Chamar no shutdown gracioso (SIGTERM).
 */
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
