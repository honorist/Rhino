const db = require('../index');

// Cria um repositório CRUD genérico para uma tabela.
// Repositórios específicos podem importar e estender.
function createRepo(table, opts = {}) {
  const orderBy = opts.orderBy || 'created_at DESC';

  async function findAll(filters = {}) {
    const keys = Object.keys(filters);
    if (keys.length === 0) {
      return db.getMany(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
    }
    const where = keys.map((k, i) => `"${db.camelToSnake(k)}" = $${i + 1}`).join(' AND ');
    const values = keys.map((k) => filters[k]);
    return db.getMany(`SELECT * FROM ${table} WHERE ${where} ORDER BY ${orderBy}`, values);
  }

  async function findById(id) {
    return db.getOne(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  }

  async function create(data) {
    return db.insert(table, data);
  }

  async function updateById(id, data) {
    return db.update(table, id, data);
  }

  async function removeById(id) {
    return db.remove(table, id);
  }

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
