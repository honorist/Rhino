'use strict';
/**
 * @file Arquivos de documentos de candidato (Recrutamento, Etapa 4.3 — US-08).
 *
 * Espelha handlers/recurso-documentos.js (sem a validação por IA): o upload
 * cifra o arquivo em repouso (LGPD, lib/crypto-pii), grava em
 * candidato_doc_arquivos keyed por (candidato_id, tipo) e referencia no JSONB
 * `candidatos.documentos[tipo]`. Re-upload do mesmo tipo substitui.
 *
 * O POST (handlePostCandidatoDocArquivo) é chamado direto no createServer
 * (caminho multipart, pula o body parser JSON); GET/DELETE passam pelo roteador.
 *
 * As regras (tipo válido, mime, tamanho, gate de antecedentes) vivem em
 * lib/recrutamento-docs.js (puras, testadas) — aqui é só o adaptador HTTP+SQL.
 */
const db = require('../db');
const repos = require('../db/repos');
const piiCrypto = require('../lib/crypto-pii');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { parseMultipart } = require('../lib/multipart');
const { validarUploadDoc, MAX_BYTES } = require('../lib/recrutamento-docs');

const MAX_TOTAL = MAX_BYTES + 64 * 1024; // arquivo + overhead do multipart

function _slugify(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Formato: AAAA_MM_DD_Tipo_Nome.ext (igual aos docs de recurso).
function _buildFilename({ nomeCandidato, tipo, filenameOriginal }) {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  const t = _slugify(tipo) || 'Doc';
  const pessoa = _slugify(nomeCandidato) || 'Candidato';
  const m = String(filenameOriginal || '').match(/\.[a-zA-Z0-9]+$/);
  const ext = m ? m[0].toLowerCase() : '.bin';
  return `${ano}_${mes}_${dia}_${t}_${pessoa}${ext}`;
}

/** Tipos de documento que JÁ têm arquivo armazenado para um candidato. */
async function tiposComArquivo(candidatoId) {
  const rows = await db.getMany(
    `SELECT DISTINCT tipo FROM candidato_doc_arquivos WHERE candidato_id = $1`,
    [candidatoId]
  );
  return rows.map((r) => r.tipo);
}

/** US-08: upload multipart do arquivo de um documento de candidato. */
function handlePostCandidatoDocArquivo(candidatoId, tipo, req, res) {
  const contentType = req.headers['content-type'] || '';
  const mBoundary = contentType.match(/boundary=(.+)$/);
  if (!mBoundary) return sendError(res, 400, 'Content-Type multipart esperado');
  const boundary = mBoundary[1].replace(/^"|"$/g, '');

  const chunks = [];
  let totalSize = 0;
  req.on('data', (c) => {
    totalSize += c.length;
    if (totalSize > MAX_TOTAL) {
      req.destroy();
      sendError(
        res,
        413,
        `Arquivo muito grande (máximo ${Math.floor(MAX_BYTES / 1024 / 1024)} MB)`
      );
    } else {
      chunks.push(c);
    }
  });

  req.on('end', async () => {
    try {
      const cand = await repos.candidatos.findById(candidatoId);
      if (!cand) return sendError(res, 404, 'Candidato não encontrado');

      const parts = parseMultipart(Buffer.concat(chunks), boundary);
      const arq = parts.find((p) => p.filename && p.data && p.data.length > 0);
      if (!arq) return sendError(res, 400, 'Nenhum arquivo enviado');

      // Regra de negócio (pura, testada): tipo + gate de antecedentes + mime + tamanho.
      // Sem '!arq.contentType' o check de mime era pulável (subir HTML/SVG com script).
      const veredito = validarUploadDoc({
        tipo,
        mimeType: arq.contentType || '',
        sizeBytes: arq.data.length,
        antecedentesStatus: cand.antecedentesStatus,
      });
      if (!veredito.ok) return sendError(res, 400, veredito.motivo);

      const filename = _buildFilename({
        nomeCandidato: cand.nome,
        tipo,
        filenameOriginal: arq.filename,
      });

      // Substitui o arquivo anterior do mesmo tipo (um arquivo por tipo).
      await db.query('DELETE FROM candidato_doc_arquivos WHERE candidato_id = $1 AND tipo = $2', [
        candidatoId,
        tipo,
      ]);
      const arqId = generateId('cda');
      await db.query(
        `INSERT INTO candidato_doc_arquivos
         (id, candidato_id, tipo, filename, filename_original, mime_type, size_bytes, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        // data cifrado em repouso (LGPD); size_bytes guarda o tamanho original.
        [
          arqId,
          candidatoId,
          tipo,
          filename,
          arq.filename || null,
          arq.contentType,
          arq.data.length,
          piiCrypto.encryptBuffer(arq.data),
        ]
      );

      // Atualiza a referência no JSONB documentos[tipo] (sem o binário).
      const docs = { ...(cand.documentos || {}) };
      docs[tipo] = {
        arquivoId: arqId,
        filename,
        filenameOriginal: arq.filename || null,
        mimeType: arq.contentType,
        sizeBytes: arq.data.length,
        uploadedAt: new Date().toISOString(),
      };
      await repos.candidatos.updateById(candidatoId, { documentos: docs });

      sendJson(res, { ok: true, documento: docs[tipo] });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });
}

/** Serve o arquivo decifrado (inline). */
async function handleGetCandidatoDocArquivo(candidatoId, tipo, res) {
  try {
    const row = await db.getOne(
      `SELECT filename, mime_type, data FROM candidato_doc_arquivos
       WHERE candidato_id = $1 AND tipo = $2 ORDER BY created_at DESC LIMIT 1`,
      [candidatoId, tipo]
    );
    if (!row) return sendError(res, 404, 'Arquivo não encontrado');
    const fileData = piiCrypto.decryptBuffer(row.data); // decifra em repouso (LGPD)
    res.writeHead(200, {
      'Content-Type': row.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.filename)}"`,
      'Content-Length': fileData.length,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(fileData);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/** Remove o arquivo + a referência no JSONB. */
async function handleDeleteCandidatoDocArquivo(candidatoId, tipo, res) {
  try {
    const cand = await repos.candidatos.findById(candidatoId);
    if (!cand) return sendError(res, 404, 'Candidato não encontrado');
    await db.query('DELETE FROM candidato_doc_arquivos WHERE candidato_id = $1 AND tipo = $2', [
      candidatoId,
      tipo,
    ]);
    const docs = { ...(cand.documentos || {}) };
    if (docs[tipo]) {
      delete docs[tipo];
      await repos.candidatos.updateById(candidatoId, { documentos: docs });
    }
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = {
  handlePostCandidatoDocArquivo,
  handleGetCandidatoDocArquivo,
  handleDeleteCandidatoDocArquivo,
  tiposComArquivo,
};
