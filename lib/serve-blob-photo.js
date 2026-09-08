'use strict';
/**
 * @file Serve uma foto BYTEA do banco por URL antiga `/data/<rota>/<parentId>/<fotoId>.<ext>`.
 *
 * Fábrica genérica — `server.js` tinha 3 cópias quase idênticas
 * (`serveRdoFotoFromDb`/`serveManutencaoFotoFromDb`/`servePunchFotoFromDb`,
 * ~40 linhas cada) diferindo só em tabela, coluna FK e regex de id (achado
 * 4.1 da varredura 2026-09-08). Exige sessão válida (as fotos podem ser
 * sensíveis) e valida o formato dos IDs como defesa em profundidade contra
 * path traversal (`../../etc/passwd` etc. nunca casa `generateId()`).
 */
const db = require('../db');
const auth = require('./auth');

/** @param {string} name */
function _assertIdentifier(name) {
  if (typeof name !== 'string' || !/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`servirFotoBlob: identificador SQL inválido: ${JSON.stringify(name)}`);
  }
}

/**
 * @param {object} opts
 * @param {RegExp} opts.idPrefixRe    Regex do id do "pai" (ex.: `/^rdo_[0-9a-z]+$/i`).
 * @param {RegExp} opts.fotoPrefixRe  Regex do id da foto (ex.: `/^foto_[0-9a-z]+$/i`).
 * @param {string} opts.table         Tabela da foto (ex.: `'rdo_fotos'`).
 * @param {string} opts.fkColumn      Coluna FK pro pai (ex.: `'rdo_id'`).
 * @returns {(pathname: string, req: object, res: object) => Promise<void>}
 */
function servirFotoBlob({ idPrefixRe, fotoPrefixRe, table, fkColumn }) {
  _assertIdentifier(table);
  _assertIdentifier(fkColumn);

  return async function serveFotoFromDb(pathname, req, res) {
    try {
      const sid = auth.parseCookies(req)[auth.COOKIE_NAME];
      const sessionUser = await auth.getUserBySession(sid);
      if (!sessionUser) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Não autenticado');
        return;
      }
      const parts = pathname.split('/'); // ['', 'data', <rota>, parentId, filename]
      const parentId = parts[3];
      const filename = parts[4] || '';
      const fotoId = filename.replace(/\.[^.]+$/, '');
      // Defesa em profundidade: IDs têm formato fixo (generateId) — rejeita ".." etc.
      if (!idPrefixRe.test(parentId) || !fotoPrefixRe.test(fotoId)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      const row = await db.getOne(
        `SELECT mime, data FROM ${table} WHERE id = $1 AND ${fkColumn} = $2`,
        [fotoId, parentId]
      );
      if (!row || !row.data) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': row.mime || 'image/jpeg',
        'Content-Length': row.data.length,
        'Cache-Control': 'private, max-age=3600',
      });
      res.end(row.data);
    } catch (_e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Erro ao carregar foto');
    }
  };
}

module.exports = { servirFotoBlob };
