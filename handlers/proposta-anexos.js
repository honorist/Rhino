'use strict';
/**
 * @file Anexos de Proposta (PDFs + imagens) — upload multipart + get/put/delete.
 * Extraído do server.js. O binário vive em BYTEA (repos.propostaAnexos); valida
 * imagem (MIME + magic-bytes, A-05) e PDF (%PDF magic) via lib/multipart.
 * Upload despachado no createServer (multipart); demais via deps.
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { parseMultipart, isAllowedImageMagic: _isAllowedImageMagic } = require('../lib/multipart');

// ============ Anexos de Proposta (PDFs + Imagens) ============
const PROPOSTA_ANEXO_MAX_BYTES = 8 * 1024 * 1024; // 8 MB por arquivo
const PROPOSTA_IMG_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const PROPOSTA_PDF_MIME  = 'application/pdf';

function handleUploadPropostaAnexo(propostaId, req, res) {
  const contentType = req.headers['content-type'] || '';
  const mBoundary = contentType.match(/boundary=(.+)$/);
  if (!mBoundary) return sendError(res, 400, 'Content-Type multipart esperado');
  const boundary = mBoundary[1].replace(/^"|"$/g, '');

  const chunks = [];
  let totalSize = 0;
  const MAX_TOTAL = PROPOSTA_ANEXO_MAX_BYTES + 64 * 1024;

  req.on('data', c => {
    totalSize += c.length;
    if (totalSize > MAX_TOTAL) {
      sendError(res, 413, `Arquivo muito grande (limite ${PROPOSTA_ANEXO_MAX_BYTES/1024/1024} MB)`);
      req.destroy();
      return;
    }
    chunks.push(c);
  });

  req.on('end', async () => {
    try {
      const proposta = await repos.propostas.findById(propostaId);
      if (!proposta) return sendError(res, 404, 'Proposta não encontrada');

      const body = Buffer.concat(chunks);
      const parts = parseMultipart(body, boundary);

      const tipoPart  = parts.find(p => p.name === 'tipo');
      const secaoPart = parts.find(p => p.name === 'secao');
      const filePart  = parts.find(p => p.filename && p.data && p.data.length > 0);
      if (!filePart) return sendError(res, 400, 'Nenhum arquivo enviado');

      const tipo = (tipoPart && tipoPart.data.toString('utf8')) || (filePart.contentType?.startsWith('image/') ? 'imagem' : 'pdf');
      const secao = (secaoPart && secaoPart.data.toString('utf8')) || (tipo === 'imagem' ? 'escopo' : 'anexo_final');

      // Valida tipo
      if (tipo === 'imagem') {
        if (!filePart.contentType || !PROPOSTA_IMG_MIMES.includes(filePart.contentType))
          return sendError(res, 400, 'Imagem precisa ser JPEG, PNG ou WebP');
        if (!_isAllowedImageMagic(filePart.data))
          return sendError(res, 400, 'Conteúdo do arquivo não bate com o tipo declarado');
      } else if (tipo === 'pdf') {
        if (filePart.contentType !== PROPOSTA_PDF_MIME)
          return sendError(res, 400, 'Anexo precisa ser PDF');
        // PDF magic: %PDF-
        if (!(filePart.data[0] === 0x25 && filePart.data[1] === 0x50 && filePart.data[2] === 0x44 && filePart.data[3] === 0x46))
          return sendError(res, 400, 'Arquivo não é um PDF válido');
      } else {
        return sendError(res, 400, 'Tipo inválido (use "imagem" ou "pdf")');
      }

      const anexoId = generateId('anx');
      await repos.propostaAnexos.create({
        id: anexoId,
        propostaId,
        tipo,
        nome: filePart.filename,
        dataBuffer: filePart.data,
        mimeType: filePart.contentType,
        sizeBytes: filePart.data.length,
        secao,
        ordem: 0,
      });

      const propostaAtualizada = await repos.propostas.findByIdWithChildren(propostaId);
      sendJson(res, { proposta: propostaAtualizada, anexoId });
    } catch (e) {
      console.error('[propostas/anexos] erro upload:', e);
      sendError(res, 400, e.message);
    }
  });
}

async function handleGetPropostaAnexo(propostaId, anexoId, res) {
  try {
    const a = await repos.propostaAnexos.findByIdWithData(anexoId);
    if (!a || a.propostaId !== propostaId) return sendError(res, 404, 'Anexo não encontrado');
    res.writeHead(200, {
      'Content-Type': a.mimeType || 'application/octet-stream',
      'Content-Length': a.data.length,
      'Content-Disposition': `inline; filename="${a.nome.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(a.data);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePutPropostaAnexo(propostaId, anexoId, body, res) {
  try {
    const allowed = {};
    if (body.legenda !== undefined) allowed.legenda = body.legenda;
    if (body.ordem !== undefined)   allowed.ordem = parseInt(body.ordem, 10) || 0;
    if (body.secao !== undefined)   allowed.secao = body.secao;
    await repos.propostaAnexos.updateById(anexoId, allowed);
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeletePropostaAnexo(propostaId, anexoId, res) {
  try {
    await repos.propostaAnexos.removeById(anexoId);
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = {
  handleUploadPropostaAnexo, handleGetPropostaAnexo,
  handlePutPropostaAnexo, handleDeletePropostaAnexo,
};
