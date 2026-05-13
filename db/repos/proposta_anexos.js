/**
 * @file Repositório de `proposta_anexos` — PDFs e imagens ilustrativas.
 *
 * Armazena binário (BYTEA) diretamente no PG — mesmo padrão de
 * `recurso_doc_arquivos`/`rdo_assinaturas` (sem dependência de disco).
 */
const db = require('../index');

/**
 * Lista metadados de anexos (sem `data` binário) de uma proposta.
 *
 * @param {string} propostaId
 * @returns {Promise<object[]>}
 */
async function listByProposta(propostaId) {
  return db.getMany(
    `SELECT id, proposta_id, tipo, nome, mime_type, size_bytes, legenda, secao, ordem, created_at
       FROM proposta_anexos
      WHERE proposta_id = $1
      ORDER BY secao, ordem ASC, created_at ASC`,
    [propostaId]
  );
}

/**
 * Recupera anexo COM data binário (uso: download/embed em DOCX).
 *
 * @param {string} id
 * @returns {Promise<object | null>}  Anexo com Buffer em `data`.
 */
async function findByIdWithData(id) {
  const { rows } = await db.query(`SELECT * FROM proposta_anexos WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  return db.rowToCamel(rows[0]);
}

/**
 * Cria anexo. `dataBuffer` deve ser Buffer; `mimeType` e `sizeBytes` calculados
 * pelo handler. Retorna metadados (sem o binário).
 *
 * @param {object} obj  { id, propostaId, tipo, nome, dataBuffer, mimeType, sizeBytes, legenda, secao, ordem }
 * @returns {Promise<object>}  Anexo (sem binário no retorno).
 */
async function create(obj) {
  const sql = `
    INSERT INTO proposta_anexos
      (id, proposta_id, tipo, nome, data, mime_type, size_bytes, legenda, secao, ordem)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, proposta_id, tipo, nome, mime_type, size_bytes, legenda, secao, ordem, created_at
  `;
  const { rows } = await db.query(sql, [
    obj.id,
    obj.propostaId,
    obj.tipo,
    obj.nome,
    obj.dataBuffer,
    obj.mimeType || null,
    obj.sizeBytes || null,
    obj.legenda || null,
    obj.secao || 'anexo_final',
    obj.ordem || 0,
  ]);
  return db.rowToCamel(rows[0]);
}

async function updateById(id, patch) {
  return db.update('proposta_anexos', id, patch);
}

async function removeById(id) {
  return db.remove('proposta_anexos', id);
}

module.exports = {
  table: 'proposta_anexos',
  listByProposta,
  findByIdWithData,
  create,
  updateById,
  removeById,
};
