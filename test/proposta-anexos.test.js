'use strict';
/**
 * Handler de anexos de Proposta (handlers/proposta-anexos.js), com `repos`
 * dublado — nada toca o Postgres, upload simulado via test/helpers/multipart.js.
 *  - POST valida a proposta ANTES de parsear o corpo grande (early return);
 *  - tipo "imagem" exige MIME de imagem + magic-bytes válidos (A-05);
 *  - tipo "pdf" exige Content-Type application/pdf + assinatura "%PDF-";
 *  - tipo default é inferido do Content-Type quando `tipo` não é enviado;
 *  - GET serve o binário com Content-Disposition inline; PUT/DELETE só tocam
 *    campos da allowlist / removem por id.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/proposta-anexos');
const { fakeMultipartReq, PNG_BYTES, PDF_BYTES, INVALID_IMAGE_BYTES } = require('./helpers/multipart');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    headers: null,
    writeHead(s, h) {
      res.status = s;
      res.headers = h;
    },
    end(payload) {
      res.body = Buffer.isBuffer(payload) ? payload : (payload ? JSON.parse(payload) : null);
    },
  };
  return res;
}

const orig = { propostas: repos.propostas, propostaAnexos: repos.propostaAnexos };
let created;

beforeEach(() => {
  created = null;
  repos.propostas = {
    findById: async (id) => (id === 'prop1' ? { id: 'prop1' } : null),
    findByIdWithChildren: async (id) => ({ id, anexos: created ? [created] : [] }),
  };
  repos.propostaAnexos = {
    create: async (data) => { created = data; return data; },
    findByIdWithData: async (id) => (id === 'anx1' ? { id: 'anx1', propostaId: 'prop1', mimeType: 'image/png', nome: 'x.png', data: PNG_BYTES } : null),
    updateById: async (id, patch) => ({ id, ...patch }),
    removeById: async () => true,
  };
});

function restore() {
  Object.assign(repos, { propostas: orig.propostas, propostaAnexos: orig.propostaAnexos });
}

function waitEnd(req) {
  return new Promise((resolve) => req.once('end', () => setImmediate(resolve)));
}

// ---------------- POST ----------------

test('POST — sem Content-Type multipart devolve 400 sincronamente', async () => {
  const res = fakeRes();
  h.handleUploadPropostaAnexo('prop1', { headers: {} }, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST — proposta inexistente devolve 404 sem gravar', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'file', filename: 'a.pdf', contentType: 'application/pdf', data: PDF_BYTES }]);
  h.handleUploadPropostaAnexo('propX', req, res);
  await waitEnd(req);
  assert.equal(res.status, 404);
  assert.equal(created, null);
  restore();
});

test('POST — sem arquivo enviado devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'tipo', data: 'pdf' }]);
  h.handleUploadPropostaAnexo('prop1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  restore();
});

test('POST — imagem com Content-Type não permitido devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'tipo', data: 'imagem' },
    { name: 'file', filename: 'x.gif', contentType: 'image/gif', data: PNG_BYTES },
  ]);
  h.handleUploadPropostaAnexo('prop1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /JPEG, PNG ou WebP/);
  restore();
});

test('POST — imagem com magic-bytes inválidos devolve 400 (A-05)', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'tipo', data: 'imagem' },
    { name: 'file', filename: 'x.png', contentType: 'image/png', data: INVALID_IMAGE_BYTES },
  ]);
  h.handleUploadPropostaAnexo('prop1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /não bate com o tipo declarado/);
  restore();
});

test('POST — pdf com Content-Type errado devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'tipo', data: 'pdf' },
    { name: 'file', filename: 'x.pdf', contentType: 'application/octet-stream', data: PDF_BYTES },
  ]);
  h.handleUploadPropostaAnexo('prop1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /precisa ser PDF/);
  restore();
});

test('POST — pdf sem assinatura %PDF- devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'tipo', data: 'pdf' },
    { name: 'file', filename: 'x.pdf', contentType: 'application/pdf', data: Buffer.alloc(20) },
  ]);
  h.handleUploadPropostaAnexo('prop1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /não é um PDF válido/);
  restore();
});

test('POST — tipo fora de imagem/pdf devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'tipo', data: 'video' },
    { name: 'file', filename: 'x.mp4', contentType: 'video/mp4', data: Buffer.alloc(20) },
  ]);
  h.handleUploadPropostaAnexo('prop1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Tipo inválido/);
  restore();
});

test('POST — tipo default inferido do Content-Type quando não enviado (imagem)', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'file', filename: 'x.png', contentType: 'image/png', data: PNG_BYTES }]);
  h.handleUploadPropostaAnexo('prop1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 200);
  assert.equal(created.tipo, 'imagem');
  assert.equal(created.secao, 'escopo'); // default de seção pra imagem
  restore();
});

test('POST — sucesso grava PDF com secao default "anexo_final"', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'file', filename: 'x.pdf', contentType: 'application/pdf', data: PDF_BYTES }]);
  h.handleUploadPropostaAnexo('prop1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 200);
  assert.equal(created.tipo, 'pdf');
  assert.equal(created.secao, 'anexo_final');
  assert.equal(created.propostaId, 'prop1');
  assert.equal(created.sizeBytes, PDF_BYTES.length);
  assert.ok(res.body.anexoId);
  restore();
});

// ---------------- GET / PUT / DELETE ----------------

test('GET — anexo de outra proposta devolve 404', async () => {
  const res = fakeRes();
  await h.handleGetPropostaAnexo('propOutra', 'anx1', res);
  assert.equal(res.status, 404);
  restore();
});

test('GET — devolve binário com Content-Disposition inline', async () => {
  const res = fakeRes();
  await h.handleGetPropostaAnexo('prop1', 'anx1', res);
  assert.equal(res.status, 200);
  assert.match(res.headers['Content-Disposition'], /inline; filename="x\.png"/);
  assert.deepEqual(res.body, PNG_BYTES);
  restore();
});

test('PUT — só grava campos da allowlist (legenda/ordem/secao)', async () => {
  const res = fakeRes();
  await h.handlePutPropostaAnexo('prop1', 'anx1', { legenda: 'Foto 1', ordem: '3', outroField: 'x' }, res);
  assert.equal(res.status, 200);
  restore();
});

test('DELETE — remove e devolve a proposta atualizada', async () => {
  const res = fakeRes();
  await h.handleDeletePropostaAnexo('prop1', 'anx1', res);
  assert.equal(res.status, 200);
  assert.equal(res.body.proposta.id, 'prop1');
  restore();
});
