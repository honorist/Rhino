'use strict';
/**
 * @file Assinaturas digitais de RDO — upload multipart + list/get/delete.
 * Extraído do server.js. A imagem da assinatura vive em BYTEA na tabela
 * rdo_assinaturas (não cifrada — não é PII sensível como CPF). Valida MIME +
 * magic-bytes (A-05) via lib/multipart. Registra IP e user-agent do signatário.
 *
 * O upload (handlePostRdoAssinatura) é chamado direto no createServer (caminho
 * multipart); list/get/delete passam pelo roteador normal (deps).
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { parseMultipart, isAllowedImageMagic: _isAllowedImageMagic } = require('../lib/multipart');

// ============ Assinaturas digitais do RDO ============
const ASSINATURA_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const ASSINATURA_MAX_BYTES = 2 * 1024 * 1024; // 2MB — assinatura é leve
const ASSINATURA_PAPEIS = new Set(['encarregado', 'cliente', 'fiscal', 'engenheiro', 'outro']);

function handlePostRdoAssinatura(rdoId, req, res) {
  const contentType = req.headers['content-type'] || '';
  const mBoundary = contentType.match(/boundary=(.+)$/);
  if (!mBoundary) return sendError(res, 400, 'Content-Type multipart esperado');
  const boundary = mBoundary[1].replace(/^"|"$/g, '');

  const chunks = [];
  let totalSize = 0;
  const MAX_TOTAL = ASSINATURA_MAX_BYTES + 32 * 1024;

  req.on('data', c => {
    totalSize += c.length;
    if (totalSize > MAX_TOTAL) {
      req.destroy();
      sendError(res, 413, 'Assinatura muito grande (máx 2 MB)');
    } else {
      chunks.push(c);
    }
  });

  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks);
      const parts = parseMultipart(body, boundary);

      const arq = parts.find(p => p.filename && p.data && p.data.length > 0);
      if (!arq) return sendError(res, 400, 'Nenhuma imagem enviada');
      // FIX A-05: Content-Type obrigatório (antes `arq.contentType &&` permitia bypass).
      if (!arq.contentType || !ASSINATURA_ALLOWED_TYPES.includes(arq.contentType)) {
        return sendError(res, 400, 'Tipo não permitido (use PNG, JPG ou WEBP)');
      }
      // Defesa em profundidade: magic-bytes batem com o MIME declarado.
      if (!_isAllowedImageMagic(arq.data)) {
        return sendError(res, 400, 'Arquivo não é uma imagem válida');
      }
      if (arq.data.length > ASSINATURA_MAX_BYTES) {
        return sendError(res, 413, 'Assinatura excede 2 MB');
      }

      const papelPart = parts.find(p => p.name === 'papel' && !p.filename);
      const nomePart  = parts.find(p => p.name === 'nome'  && !p.filename);
      const papel = papelPart ? papelPart.data.toString('utf8').trim() : '';
      const nome  = nomePart  ? nomePart.data.toString('utf8').trim()  : '';
      if (!papel || !ASSINATURA_PAPEIS.has(papel)) return sendError(res, 400, 'Papel inválido');
      if (!nome) return sendError(res, 400, 'Nome obrigatório');

      const rdo = await repos.rdos.findById(rdoId);
      if (!rdo) return sendError(res, 404, 'RDO não encontrado');

      const id = generateId('ass');
      const ip = req.socket?.remoteAddress || (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || null;
      const ua = (req.headers['user-agent'] || '').slice(0, 500);

      await db.query(
        `INSERT INTO rdo_assinaturas (id, rdo_id, papel, nome, imagem, mime_type, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, rdoId, papel, nome, arq.data, arq.contentType || 'image/png', ip, ua]
      );

      sendJson(res, { ok: true, id, papel, nome, sizeBytes: arq.data.length, createdAt: new Date().toISOString() });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });
}

async function handleListRdoAssinaturas(rdoId, res) {
  try {
    const rows = await db.getMany(
      `SELECT id, rdo_id, papel, nome, mime_type, ip, created_at
       FROM rdo_assinaturas WHERE rdo_id = $1 ORDER BY created_at ASC`,
      [rdoId]
    );
    sendJson(res, { assinaturas: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleGetRdoAssinatura(rdoId, assId, res) {
  try {
    const row = await db.getOne(
      `SELECT mime_type, imagem FROM rdo_assinaturas WHERE id = $1 AND rdo_id = $2`,
      [assId, rdoId]
    );
    if (!row) return sendError(res, 404, 'Assinatura não encontrada');
    res.writeHead(200, {
      'Content-Type': row.mimeType || 'image/png',
      'Content-Length': row.imagem.length,
      'Cache-Control': 'private, max-age=300',
    });
    res.end(row.imagem);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleDeleteRdoAssinatura(rdoId, assId, res) {
  try {
    await db.query('DELETE FROM rdo_assinaturas WHERE id = $1 AND rdo_id = $2', [assId, rdoId]);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = {
  handlePostRdoAssinatura, handleListRdoAssinaturas,
  handleGetRdoAssinatura, handleDeleteRdoAssinatura,
};
