/**
 * @file Factory de repositórios CRUD genéricos.
 *
 * Cada tabela com schema simples (PK = id, campos no padrão camelCase ↔
 * snake_case) pode reutilizar este factory em vez de duplicar boilerplate.
 * Repositórios específicos (`contracts`, `rdos`, `caixa`) podem importar e
 * estender adicionando métodos customizados (JOINs, agregações, etc.).
 *
 * FIX P1-3 da DB review: `findAll()` aplica um cap defensivo (DEFAULT_LIMIT)
 * para evitar OOM em tabelas que crescem indefinidamente (caixa, audit_log,
 * saidas). Callers podem passar `{ limit, offset }` para paginar, ou
 * `{ limit: null }` para opt-out (uso raro — só quando se sabe que a tabela
 * é pequena por natureza, ex.: niveis_acesso). Quando o cap é atingido,
 * emite warning no log para sinalizar que aquele caller precisa paginar.
 */

const db = require('../index');

/** Cap defensivo para findAll. Tabelas que crescem devem paginar via opts.limit. */
const DEFAULT_LIMIT = 5000;

/**
 * @typedef {object} FindOpts
 * @property {number|null} [limit]   Máximo de linhas (null = sem limite). Default: 5000.
 * @property {number} [offset]       Offset (para paginação).
 *
 * @typedef {object} Repo
 * @property {string} table
 * @property {(filters?: Record<string, unknown>, opts?: FindOpts) => Promise<object[]>} findAll
 * @property {(id: string|number) => Promise<object | null>} findById
 * @property {(data: Record<string, unknown>) => Promise<object>} create
 * @property {(id: string|number, data: Record<string, unknown>) => Promise<object | null>} updateById
 * @property {(id: string|number) => Promise<boolean>} removeById
 * @property {(filters?: Record<string, unknown>) => Promise<number>} count
 */

/**
 * Cria um repositório CRUD genérico para uma tabela.
 *
 * @param {string} table  Nome da tabela.
 * @param {{ orderBy?: string }} [opts]  Opções; default `orderBy: 'created_at DESC'`.
 * @returns {Repo}
 */
function createRepo(table, opts = {}) {
  // FIX C-03: defesa em profundidade — `table` e `orderBy` entram cru no SQL.
  // Hoje só vêm de literais; validar impede SQL injection caso algum dia um
  // valor derivado de input do usuário chegue aqui.
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new Error(`createRepo: nome de tabela inválido: ${JSON.stringify(table)}`);
  }
  const orderBy = opts.orderBy || 'created_at DESC';
  if (!/^[a-z0-9_, ]+$/i.test(orderBy)) {
    throw new Error(`createRepo: orderBy inválido: ${JSON.stringify(orderBy)}`);
  }

  /**
   * Retorna linhas filtradas (AND) com cap defensivo de DEFAULT_LIMIT.
   * Filtros são parametrizados; chaves em camelCase são convertidas.
   *
   * @param {Record<string, unknown>} [filters]
   * @param {FindOpts} [opts]
   * @returns {Promise<object[]>}
   */
  async function findAll(filters = {}, opts = {}) {
    // FIX C-03: limit/offset entram cru no SQL — coagir a inteiro.
    const rawLimit = opts.limit === null ? null : (opts.limit ?? DEFAULT_LIMIT);
    const limit = rawLimit === null ? null : (Number.isInteger(rawLimit) ? rawLimit : DEFAULT_LIMIT);
    const offset = Number.isInteger(opts.offset) ? opts.offset : 0;
    const keys = Object.keys(filters);
    const where = keys.length
      ? 'WHERE ' + keys.map((k, i) => `"${db.camelToSnake(k)}" = $${i + 1}`).join(' AND ')
      : '';
    const values = keys.map((k) => filters[k]);
    let sql = `SELECT * FROM ${table} ${where} ORDER BY ${orderBy}`;
    if (limit !== null) {
      sql += ` LIMIT ${limit} OFFSET ${offset}`;
    }
    const rows = await db.getMany(sql, values);
    // Sinaliza callers que precisam paginar (atingiram o cap default)
    if (limit !== null && opts.limit === undefined && rows.length >= DEFAULT_LIMIT) {
      console.warn(`[findAll] ${table}: ${rows.length} linhas (cap default ${DEFAULT_LIMIT} atingido) — adicione paginação ao caller`);
    }
    return rows;
  }

  /**
   * @param {string|number} id
   * @returns {Promise<object | null>}
   */
  async function findById(id) {
    return db.getOne(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  }

  /**
   * @param {Record<string, unknown>} data
   * @returns {Promise<object>}  Row inserida (com defaults).
   */
  async function create(data) {
    return db.insert(table, data);
  }

  /**
   * @param {string|number} id
   * @param {Record<string, unknown>} data
   * @returns {Promise<object | null>}
   */
  async function updateById(id, data) {
    return db.update(table, id, data);
  }

  /**
   * @param {string|number} id
   * @returns {Promise<boolean>}
   */
  async function removeById(id) {
    return db.remove(table, id);
  }

  /**
   * @param {Record<string, unknown>} [filters]
   * @returns {Promise<number>}
   */
  async function count(filters = {}) {
    const keys = Object.keys(filters);
    let sql = `SELECT COUNT(*)::int AS n FROM ${table}`;
    let values = [];
    if (keys.length) {
      const where = keys.map((k, i) => `"${db.camelToSnake(k)}" = $${i + 1}`).join(' AND ');
      values = keys.map((k) => filters[k]);
      sql += ` WHERE ${where}`;
    }
    const row = await db.getOne(sql, values);
    return row ? row.n : 0;
  }

  return { table, findAll, findById, create, updateById, removeById, count };
}

module.exports = { createRepo };
