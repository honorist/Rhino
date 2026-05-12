/**
 * @file Factory de repositórios CRUD genéricos.
 *
 * Cada tabela com schema simples (PK = id, campos no padrão camelCase ↔
 * snake_case) pode reutilizar este factory em vez de duplicar boilerplate.
 * Repositórios específicos (`contracts`, `rdos`, `caixa`) podem importar e
 * estender adicionando métodos customizados (JOINs, agregações, etc.).
 *
 * Atenção P1-3 da DB review: `findAll()` retorna todas as linhas sem LIMIT.
 * Para tabelas que crescem indefinidamente (caixa, audit_log, saidas), prefira
 * passar filtros ou criar um método paginado.
 */

const db = require('../index');

/**
 * @typedef {object} Repo
 * @property {string} table
 * @property {(filters?: Record<string, unknown>) => Promise<object[]>} findAll
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
  const orderBy = opts.orderBy || 'created_at DESC';

  /**
   * Retorna todas as linhas, opcionalmente filtradas por colunas (AND).
   * Filtros são parametrizados; chaves em camelCase são convertidas.
   *
   * @param {Record<string, unknown>} [filters]
   * @returns {Promise<object[]>}
   */
  async function findAll(filters = {}) {
    const keys = Object.keys(filters);
    if (keys.length === 0) {
      return db.getMany(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
    }
    const where = keys.map((k, i) => `"${db.camelToSnake(k)}" = $${i + 1}`).join(' AND ');
    const values = keys.map((k) => filters[k]);
    return db.getMany(`SELECT * FROM ${table} WHERE ${where} ORDER BY ${orderBy}`, values);
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
