'use strict';
/**
 * @file Fotos de RDO — upload multipart + exclusão. Extraído do server.js.
 * As fotos vivem em disco (RDO_FOTOS_DIR = data/rdo-fotos/<rdoId>/) e seus
 * metadados no JSONB `fotos` do RDO. Validação de imagem (MIME allowlist +
 * magic-bytes + extensão derivada do MIME) via lib/multipart (A-05/A-06).
 *
 * O upload (handlePostRdoFoto) é chamado direto no createServer (caminho
 * multipart, antes do parser JSON); o delete passa pelo roteador normal.
 */
const path = require('path');
const fs = require('fs');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { parseMultipart, isAllowedImageMagic, IMAGE_MIMES, IMAGE_EXT_FROM_MIME } = require('../lib/multipart');

const RDO_FOTOS_DIR = path.join(__dirname, '..', 'data', 'rdo-fotos');
const FOTO_MAX_BYTES = 8 * 1024 * 1024;

function handlePostRdoFoto(contractId, rdoId, req, res) {
  const contentType = req.headers['content-type'] || '';
  const mBoundary = contentType.match(/boundary=(.+)$/);
  if (!mBoundary) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Content-Type multipart esperado' }));
    return;
  }
  const boundary = mBoundary[1].replace(/^"|"$/g, '');

  const chunks = [];
  let totalSize = 0;
  const MAX_TOTAL = 25 * 1024 * 1024;

  req.on('data', c => {
    totalSize += c.length;
    if (totalSize > MAX_TOTAL) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upload muito grande' }));
      req.destroy();
      return;
    }
    chunks.push(c);
  });

  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks);
      const parts = parseMultipart(body, boundary);

      const rdo = await repos.rdos.findById(rdoId);
      if (!rdo) return sendError(res, 404, 'RDO não encontrado');

      const legendaPart = parts.find(p => p.name === 'legenda');
      const legenda = legendaPart ? legendaPart.data.toString('utf8') : '';

      const arquivos = parts.filter(p => p.filename && p.data && p.data.length > 0);
      if (arquivos.length === 0) return sendError(res, 400, 'Nenhum arquivo enviado');

      const pastaRdo = path.join(RDO_FOTOS_DIR, rdoId);
      if (!fs.existsSync(pastaRdo)) fs.mkdirSync(pastaRdo, { recursive: true });

      const adicionadas = [];
      for (const arq of arquivos) {
        // FIX A-05: rejeita upload sem Content-Type ou com tipo não permitido.
        // O `arq.contentType &&` original permitia bypass simplesmente omitindo o header.
        if (!arq.contentType || !IMAGE_MIMES.includes(arq.contentType)) continue;
        if (arq.data.length > FOTO_MAX_BYTES) continue;
        // Defesa em profundidade: magic-bytes batem com o Content-Type declarado.
        if (!isAllowedImageMagic(arq.data)) continue;
        // FIX A-06: extensão vem do MIME validado, nunca do filename do cliente
        // (que pode ser `foto.jpg.svg` → XSS persistente quando servido depois).
        const ext = IMAGE_EXT_FROM_MIME[arq.contentType] || '.jpg';
        const fotoId = generateId('foto');
        const filename = fotoId + ext;
        // FIX P1-2: writeFile assíncrono não bloqueia o event loop durante uploads grandes.
        await fs.promises.writeFile(path.join(pastaRdo, filename), arq.data);
        adicionadas.push({
          id: fotoId, filename, legenda,
          url: `/data/rdo-fotos/${rdoId}/${filename}`,
          createdAt: new Date().toISOString(),
        });
      }

      const fotos = (rdo.fotos || []).concat(adicionadas);
      await repos.rdos.updateById(rdoId, {
        fotos: JSON.stringify(fotos),
        updatedAt: new Date().toISOString(),
      });
      const env = await repos.contracts.getEnvelope();
      sendJson(res, { contracts: env.contracts, fotos: adicionadas });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });
}

async function handleDeleteRdoFoto(contractId, rdoId, fotoId, res) {
  try {
    const rdo = await repos.rdos.findById(rdoId);
    if (!rdo) return sendError(res, 404, 'RDO não encontrado');
    const fotos = rdo.fotos || [];
    const foto = fotos.find(f => f.id === fotoId);
    if (foto) {
      const filepath = path.join(RDO_FOTOS_DIR, rdoId, foto.filename);
      try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
    }
    const novasFotos = fotos.filter(f => f.id !== fotoId);
    await repos.rdos.updateById(rdoId, {
      fotos: JSON.stringify(novasFotos),
      updatedAt: new Date().toISOString(),
    });
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = { handlePostRdoFoto, handleDeleteRdoFoto };
