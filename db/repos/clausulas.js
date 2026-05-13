/** @file Repositório de `clausulas` — biblioteca reusável para propostas. */
const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('clausulas', { orderBy: 'categoria ASC, titulo ASC' });

/**
 * Busca cláusulas por categoria opcional + termo livre (em titulo/texto/tags).
 *
 * @param {{ categoria?: string, termo?: string, ativa?: boolean }} [filtros]
 * @returns {Promise<object[]>}
 */
async function buscar(filtros = {}) {
  const { categoria, termo, ativa } = filtros;
  const where = [];
  const params = [];
  if (categoria) { params.push(categoria); where.push(`categoria = $${params.length}`); }
  if (ativa !== undefined) { params.push(!!ativa); where.push(`ativa = $${params.length}`); }
  if (termo && termo.trim()) {
    params.push(`%${termo.trim()}%`);
    const idx = params.length;
    where.push(`(titulo ILIKE $${idx} OR texto ILIKE $${idx} OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE $${idx}))`);
  }
  const sql = `SELECT * FROM clausulas ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY categoria ASC, titulo ASC`;
  return db.getMany(sql, params);
}

/**
 * Incrementa contador de uso (analítico — qual cláusula mais aparece).
 */
async function incrementarUso(id) {
  await db.query(`UPDATE clausulas SET uso_count = uso_count + 1 WHERE id = $1`, [id]);
}

module.exports = {
  ...base,
  buscar,
  incrementarUso,
};
