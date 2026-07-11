'use strict';
/**
 * @file Fotos de RDO — upload multipart + exclusão. Extraído do server.js.
 * As fotos são armazenadas como BYTEA na tabela `rdo_fotos` (duráveis e
 * incluídas no backup do banco); os metadados (id, filename, legenda, url)
 * ficam no JSONB `fotos` do RDO. São servidas via
 * /data/rdo-fotos/<rdoId>/<fotoId>.<ext> por um handler no server.js que lê
 * do banco. Validação de imagem (MIME allowlist + magic-bytes + extensão
 * derivada do MIME) via lib/multipart (A-05/A-06).
 *
 * Histórico: antes as fotos viviam em disco (data/rdo-fotos/), que no app do
 * Railway é efêmero — sumiam a cada redeploy e ficavam fora do backup.
 *
 * O upload (handlePostRdoFoto) é chamado direto no createServer (caminho
 * multipart, antes do parser JSON); o delete passa pelo roteador normal.
 */
const repos = require('../db/repos');
const db = require('../db');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const {
  parseMultipart,
  isAllowedImageMagic,
  IMAGE_MIMES,
  IMAGE_EXT_FROM_MIME,
} = require('../lib/multipart');

const FOTO_MAX_BYTES = 8 * 1024 * 1024;
const FOTO_MAX_POR_RDO = 60; // FIX L7: cota por RDO — evita exaustão de armazenamento

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

  req.on('data', (c) => {
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

      const legendaPart = parts.find((p) => p.name === 'legenda');
      const legenda = legendaPart ? legendaPart.data.toString('utf8') : '';

      const arquivos = parts.filter((p) => p.filename && p.data && p.data.length > 0);
      if (arquivos.length === 0) return sendError(res, 400, 'Nenhum arquivo enviado');

      // Tudo-ou-nada: insere os binários e atualiza o JSONB do RDO na MESMA
      // transação. Se qualquer foto falhar, nada é gravado (evita binário órfão
      // em rdo_fotos sem entrada no JSONB).
      const adicionadas = [];
      await db.withTransaction(async (client) => {
        for (const arq of arquivos) {
          // FIX A-05: rejeita upload sem Content-Type ou com tipo não permitido.
          if (!arq.contentType || !IMAGE_MIMES.includes(arq.contentType)) continue;
          if (arq.data.length > FOTO_MAX_BYTES) continue;
          // Defesa em profundidade: magic-bytes batem com o Content-Type declarado.
          if (!isAllowedImageMagic(arq.data)) continue;
          // FIX A-06: extensão vem do MIME validado, nunca do filename do cliente.
          const ext = IMAGE_EXT_FROM_MIME[arq.contentType] || '.jpg';
          const fotoId = generateId('foto');
          const filename = fotoId + ext;
          // Binário no banco (BYTEA) — durável e incluído no backup. O foto id é a
          // chave; o filename embute o id, então a URL resolve para a row certa.
          await client.query(
            `INSERT INTO rdo_fotos (id, rdo_id, mime, data) VALUES ($1, $2, $3, $4)`,
            [fotoId, rdoId, arq.contentType, arq.data]
          );
          adicionadas.push({
            id: fotoId,
            filename,
            legenda,
            mime: arq.contentType,
            url: `/data/rdo-fotos/${rdoId}/${filename}`,
            createdAt: new Date().toISOString(),
          });
        }
        if (adicionadas.length === 0) {
          const err = new Error('Nenhuma imagem válida enviada');
          err.status = 400;
          throw err;
        }
        // FIX L7: cota por RDO — o throw aborta a transação (rollback dos INSERTs).
        if ((rdo.fotos || []).length + adicionadas.length > FOTO_MAX_POR_RDO) {
          const err = new Error(`Limite de ${FOTO_MAX_POR_RDO} fotos por RDO atingido`);
          err.status = 400;
          throw err;
        }
        const fotos = (rdo.fotos || []).concat(adicionadas);
        await client.query(`UPDATE rdos SET fotos = $1, updated_at = $2 WHERE id = $3`, [
          JSON.stringify(fotos),
          new Date().toISOString(),
          rdoId,
        ]);
      });
      const env = await repos.contracts.getEnvelope();
      sendJson(res, { contracts: env.contracts, fotos: adicionadas });
    } catch (e) {
      sendError(res, e.status || 400, e.message);
    }
  });
}

async function handleDeleteRdoFoto(contractId, rdoId, fotoId, res) {
  try {
    const rdo = await repos.rdos.findById(rdoId);
    if (!rdo) return sendError(res, 404, 'RDO não encontrado');
    const fotos = rdo.fotos || [];
    // Remove o binário do banco. Loga (não silencia) falha real de banco —
    // senão o metadado some do JSONB e o binário fica órfão em rdo_fotos.
    try {
      await db.query(`DELETE FROM rdo_fotos WHERE id = $1 AND rdo_id = $2`, [fotoId, rdoId]);
    } catch (e) {
      console.error('[rdo-fotos] falha ao remover binário', fotoId, e.message);
    }
    const novasFotos = fotos.filter((f) => f.id !== fotoId);
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
