'use strict';
/**
 * @file Case Logos (logos de clientes/cases para propostas) — list/get-image +
 * upload multipart + put/delete. Extraído do server.js. Binário em BYTEA
 * (repos.caseLogos); valida imagem (MIME + magic-bytes, A-05) via lib/multipart.
 * Upload despachado no createServer (multipart); demais via deps.
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { parseMultipart, isAllowedImageMagic: _isAllowedImageMagic } = require('../lib/multipart');

// ============ Case Logos ============
const CASE_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const CASE_LOGO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

async function handleGetCaseLogos(res) {
  try {
    const logos = await repos.caseLogos.listMetadata();
    sendJson(res, { logos });
  } catch (e) { sendError(res, 500, e.message); }
}

async function handleGetCaseLogoImage(id, res) {
  try {
    const lg = await repos.caseLogos.findByIdWithData(id);
    if (!lg) return sendError(res, 404, 'Logo não encontrada');
    res.writeHead(200, {
      'Content-Type': lg.mimeType || 'image/png',
      'Content-Length': lg.data.length,
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(lg.data);
  } catch (e) { sendError(res, 500, e.message); }
}

function handleUploadCaseLogo(req, res) {
  const contentType = req.headers['content-type'] || '';
  const mBoundary = contentType.match(/boundary=(.+)$/);
  if (!mBoundary) return sendError(res, 400, 'Content-Type multipart esperado');
  const boundary = mBoundary[1].replace(/^"|"$/g, '');
  const chunks = [];
  let total = 0;
  req.on('data', c => {
    total += c.length;
    if (total > CASE_LOGO_MAX_BYTES + 64 * 1024) {
      sendError(res, 413, `Logo muito grande (limite ${CASE_LOGO_MAX_BYTES / 1024 / 1024} MB)`);
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks);
      const parts = parseMultipart(body, boundary);
      const nomePart = parts.find(p => p.name === 'nome');
      const clienteIdPart = parts.find(p => p.name === 'clienteId');
      const ordemPart = parts.find(p => p.name === 'ordem');
      const filePart = parts.find(p => p.filename && p.data && p.data.length > 0);
      if (!filePart) return sendError(res, 400, 'Nenhuma imagem enviada');
      if (!filePart.contentType || !CASE_LOGO_MIMES.includes(filePart.contentType))
        return sendError(res, 400, 'Imagem precisa ser JPEG, PNG ou WebP');
      if (!_isAllowedImageMagic(filePart.data))
        return sendError(res, 400, 'Conteúdo do arquivo não bate com o tipo declarado');
      const nome = (nomePart ? nomePart.data.toString('utf8') : '') || filePart.filename.replace(/\.[^.]+$/, '');
      const clienteId = clienteIdPart ? clienteIdPart.data.toString('utf8').trim() || null : null;
      const ordem = ordemPart ? (parseInt(ordemPart.data.toString('utf8'), 10) || 0) : 0;
      await repos.caseLogos.create({
        id: generateId('clg'),
        nome,
        clienteId,
        dataBuffer: filePart.data,
        mimeType: filePart.contentType,
        sizeBytes: filePart.data.length,
        ordem,
        ativo: true,
      });
      const logos = await repos.caseLogos.listMetadata();
      sendJson(res, { logos });
    } catch (e) {
      console.error('[case-logos] upload erro:', e);
      sendError(res, 400, e.message);
    }
  });
}

async function handlePutCaseLogo(id, body, res) {
  try {
    const allowed = {};
    for (const f of ['nome', 'clienteId', 'ordem', 'ativo']) {
      if (body[f] !== undefined) allowed[f] = body[f];
    }
    await repos.caseLogos.updateById(id, allowed);
    sendJson(res, { logos: await repos.caseLogos.listMetadata() });
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteCaseLogo(id, res) {
  try {
    await repos.caseLogos.removeById(id);
    sendJson(res, { logos: await repos.caseLogos.listMetadata() });
  } catch (e) { sendError(res, 400, e.message); }
}

module.exports = {
  handleGetCaseLogos, handleGetCaseLogoImage, handleUploadCaseLogo,
  handlePutCaseLogo, handleDeleteCaseLogo,
};
