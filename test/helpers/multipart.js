'use strict';
/**
 * @file Helpers pra testar handlers de upload multipart (lib/multipart.js)
 * sem abrir socket real: monta um Buffer multipart/form-data válido e um
 * `req` fake (EventEmitter com headers) que emite 'data'/'end' como o
 * `http.IncomingMessage` real faria.
 *
 * Reusável por qualquer handler no padrão `req.on('data'...)/req.on('end'...)`
 * (rdo-fotos, manutencao-fotos, proposta-anexos, rdo-assinaturas,
 * recurso-documentos).
 */
const { EventEmitter } = require('events');

const BOUNDARY = 'RhinoTestBoundary123';

/**
 * @param {Array<{name:string, filename?:string, contentType?:string, data:Buffer|string}>} parts
 * @returns {Buffer}
 */
function buildMultipartBody(parts) {
  const chunks = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${BOUNDARY}\r\n`));
    let header = `Content-Disposition: form-data; name="${p.name}"`;
    if (p.filename) header += `; filename="${p.filename}"`;
    header += '\r\n';
    if (p.contentType) header += `Content-Type: ${p.contentType}\r\n`;
    header += '\r\n';
    chunks.push(Buffer.from(header));
    chunks.push(Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

/**
 * Fake `req`: EventEmitter com `.headers` e `.destroy()`, que emite
 * 'data'+'end' no próximo tick (imita o fluxo assíncrono real do stream).
 * @param {Array<{name:string, filename?:string, contentType?:string, data:Buffer|string}>} parts
 * @returns {EventEmitter & {headers: object, destroy: Function}}
 */
function fakeMultipartReq(parts) {
  const body = buildMultipartBody(parts);
  const req = new EventEmitter();
  req.headers = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };
  req.destroyed = false;
  req.destroy = () => { req.destroyed = true; };
  setImmediate(() => {
    req.emit('data', body);
    if (!req.destroyed) req.emit('end');
  });
  return req;
}

// Magic-bytes mínimos válidos (>=12 bytes, ver lib/multipart.js isAllowedImageMagic).
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(8)]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(10)]);
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(8)]);
const INVALID_IMAGE_BYTES = Buffer.alloc(20, 0x00); // não bate com nenhum magic-number

module.exports = { fakeMultipartReq, buildMultipartBody, PNG_BYTES, JPEG_BYTES, PDF_BYTES, INVALID_IMAGE_BYTES, BOUNDARY };
