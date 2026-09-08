/**
 * @file Consulta agregada de `candidato_doc_arquivos` — usada pelo gate de
 * aprovação de candidato (`handlers/recrutamento.js`). Sem repo CRUD completo
 * porque a tabela é BYTEA-only (upload/download ficam em
 * `handlers/candidato-documentos.js`, SQL direto, mesmo padrão de
 * `recurso_doc_arquivos`) — só a leitura agregada mora aqui.
 *
 * Movido de `handlers/candidato-documentos.js` (achado 4.4 da varredura
 * 2026-09-08): um handler importava o outro direto pra usar essa função —
 * único caso do tipo no código, e exatamente o atalho que o steering (§2)
 * proíbe ("publique uma função em lib/ [ou repo] em vez de acoplar").
 */
const db = require('../index');

/**
 * Tipos de documento que JÁ têm arquivo armazenado para um candidato.
 * @param {string} candidatoId
 * @returns {Promise<string[]>}
 */
async function tiposComArquivo(candidatoId) {
  const rows = await db.getMany(
    `SELECT DISTINCT tipo FROM candidato_doc_arquivos WHERE candidato_id = $1`,
    [candidatoId]
  );
  return rows.map((r) => r.tipo);
}

module.exports = { tiposComArquivo };
