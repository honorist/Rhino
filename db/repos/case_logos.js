/**
 * @file Repositório de `case_logos` — logos de clientes para a seção
 * "Cases de Sucesso" das propostas. Armazena binário em BYTEA (igual
 * proposta_anexos).
 */
const db = require('../index');

async function listMetadata({ ativo } = {}) {
  let sql = `SELECT id, nome, cliente_id, mime_type, size_bytes, ordem, ativo, created_at
               FROM case_logos`;
  const params = [];
  if (ativo !== undefined) { params.push(!!ativo); sql += ` WHERE ativo = $${params.length}`; }
  sql += ` ORDER BY ordem ASC, nome ASC`;
  return db.getMany(sql, params);
}

async function findByIdWithData(id) {
  const { rows } = await db.query(`SELECT * FROM case_logos WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  return db.rowToCamel(rows[0]);
}

async function create(obj) {
  const sql = `
    INSERT INTO case_logos (id, nome, cliente_id, data, mime_type, size_bytes, ordem, ativo)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, nome, cliente_id, mime_type, size_bytes, ordem, ativo, created_at
  `;
  const { rows } = await db.query(sql, [
    obj.id,
    obj.nome,
    obj.clienteId || null,
    obj.dataBuffer,
    obj.mimeType || null,
    obj.sizeBytes || null,
    obj.ordem || 0,
    obj.ativo !== false,
  ]);
  return db.rowToCamel(rows[0]);
}

async function updateById(id, patch) {
  return db.update('case_logos', id, patch);
}

async function removeById(id) {
  return db.remove('case_logos', id);
}

module.exports = {
  table: 'case_logos',
  listMetadata,
  findByIdWithData,
  create,
  updateById,
  removeById,
};
