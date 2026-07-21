'use strict';
/**
 * @file Fotos de item de Punch list / Qualidade — upload multipart + exclusão.
 * Molde: handlers/rdo-fotos.js.
 *
 * As evidências são armazenadas como BYTEA na tabela `punch_fotos` (duráveis e
 * incluídas no backup do banco); os metadados leves ({ id, ext, mime,
 * uploadedAt }) ficam no JSONB `fotos` do item (tabela `punch_itens`).
 * Validação de imagem (MIME allowlist + magic-bytes + extensão derivada do MIME)
 * via lib/multipart (A-05/A-06).
 *
 * O binário e o JSONB são gravados na MESMA transação (tudo-ou-nada): se
 * qualquer foto falhar, nada é persistido — evita binário órfão em punch_fotos
 * sem entrada no JSONB, e vice-versa.
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
const FOTO_MAX_POR_ITEM = 20; // cota por item — evita exaustão de armazenamento

/**
 * Lê o JSONB `fotos` de um item como array. O driver pg normalmente já entrega
 * JSONB parseado (array); mas defende-se do caso de vir como string crua.
 * @param {object} item
 * @returns {Array<object>}
 */
function _lerFotos(item) {
  const f = item && item.fotos;
  if (Array.isArray(f)) return f;
  if (typeof f === 'string') {
    try {
      const parsed = JSON.parse(f);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** POST /api/contracts/:id/punch/:itemId/fotos — upload multipart de evidências. */
function handlePostPunchFoto(contractId, itemId, req, res) {
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

      const item = await repos.punchItens.findById(itemId);
      if (!item || item.contractId !== contractId) {
        return sendError(res, 404, 'Item de qualidade não encontrado neste contrato');
      }

      const arquivos = parts.filter((p) => p.filename && p.data && p.data.length > 0);
      if (arquivos.length === 0) return sendError(res, 400, 'Nenhum arquivo enviado');

      const fotosAtuais = _lerFotos(item);
      const adicionadas = [];
      let fotosFinal = fotosAtuais;
      await db.withTransaction(async (client) => {
        for (const arq of arquivos) {
          // A-05: rejeita upload sem Content-Type ou com tipo não permitido.
          if (!arq.contentType || !IMAGE_MIMES.includes(arq.contentType)) continue;
          if (arq.data.length > FOTO_MAX_BYTES) continue;
          // Defesa em profundidade: magic-bytes batem com o Content-Type declarado.
          if (!isAllowedImageMagic(arq.data)) continue;
          // A-06: extensão vem do MIME validado, nunca do filename do cliente.
          const ext = IMAGE_EXT_FROM_MIME[arq.contentType] || '.jpg';
          const fotoId = generateId('pfoto');
          await client.query(
            `INSERT INTO punch_fotos (id, punch_item_id, mime, data) VALUES ($1, $2, $3, $4)`,
            [fotoId, itemId, arq.contentType, arq.data]
          );
          adicionadas.push({
            id: fotoId,
            ext,
            mime: arq.contentType,
            uploadedAt: new Date().toISOString(),
          });
        }
        if (adicionadas.length === 0) {
          const err = new Error('Nenhuma imagem válida enviada');
          err.status = 400;
          throw err;
        }
        // Cota por item — o throw aborta a transação (rollback dos INSERTs).
        if (fotosAtuais.length + adicionadas.length > FOTO_MAX_POR_ITEM) {
          const err = new Error(`Limite de ${FOTO_MAX_POR_ITEM} fotos por item atingido`);
          err.status = 400;
          throw err;
        }
        fotosFinal = fotosAtuais.concat(adicionadas);
        await client.query(
          `UPDATE punch_itens SET fotos = $2, updated_at = NOW() WHERE id = $1`,
          [itemId, JSON.stringify(fotosFinal)]
        );
      });
      sendJson(res, { fotos: fotosFinal });
    } catch (e) {
      sendError(res, e.status || 400, e.message);
    }
  });
}

/** DELETE /api/contracts/:id/punch/:itemId/fotos/:fotoId — remove uma evidência. */
async function handleDeletePunchFoto(contractId, itemId, fotoId, res) {
  try {
    const item = await repos.punchItens.findById(itemId);
    if (!item || item.contractId !== contractId) {
      return sendError(res, 404, 'Item de qualidade não encontrado neste contrato');
    }
    // Remove o binário do banco. Loga (não silencia) falha real de banco — senão
    // o metadado some do JSONB e o binário fica órfão em punch_fotos.
    try {
      await db.query(`DELETE FROM punch_fotos WHERE id = $1 AND punch_item_id = $2`, [fotoId, itemId]);
    } catch (e) {
      console.error('[punch-fotos] falha ao remover binário', fotoId, e.message);
    }
    const fotos = _lerFotos(item).filter((f) => f.id !== fotoId);
    await repos.punchItens.updateById(itemId, {
      fotos: JSON.stringify(fotos),
      updatedAt: new Date().toISOString(),
    });
    sendJson(res, { fotos });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = { handlePostPunchFoto, handleDeletePunchFoto };
