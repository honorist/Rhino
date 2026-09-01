'use strict';
/**
 * Handler de assinaturas digitais de RDO (handlers/rdo-assinaturas.js), com
 * `db`/`repos` dublados — nada toca o Postgres, upload simulado via
 * test/helpers/multipart.js (sem abrir socket real).
 *  - POST valida Content-Type multipart, tipo/magic-bytes de imagem (A-05),
 *    tamanho máx (2MB), papel (allowlist) e nome obrigatórios ANTES de tocar
 *    o RDO/banco;
 *  - POST grava IP a partir de X-Forwarded-For quando presente (FIX L5 —
 *    atrás de proxy o socket remoto é o do proxy, não do cliente);
 *  - GET/LIST/DELETE são simples wrappers de query parametrizada.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const h = require('../handlers/rdo-assinaturas');
const { fakeMultipartReq, PNG_BYTES, INVALID_IMAGE_BYTES } = require('./helpers/multipart');

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

const orig = { query: db.query, getMany: db.getMany, getOne: db.getOne, rdos: repos.rdos };
let queries;

beforeEach(() => {
  queries = [];
  db.query = async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; };
  db.getMany = async () => [];
  db.getOne = async () => null;
  repos.rdos = { findById: async (id) => (id === 'rdo1' ? { id: 'rdo1' } : null) };
});

function restore() {
  Object.assign(db, { query: orig.query, getMany: orig.getMany, getOne: orig.getOne });
  Object.assign(repos, { rdos: orig.rdos });
}

function waitEnd(req) {
  return new Promise((resolve) => req.once('end', () => setImmediate(resolve)));
}

// ---------------- POST ----------------

test('POST — sem Content-Type multipart devolve 400 sincronamente', async () => {
  const res = fakeRes();
  const req = { headers: {} };
  h.handlePostRdoAssinatura('rdo1', req, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST — sem arquivo enviado devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'papel', data: 'encarregado' }, { name: 'nome', data: 'João' }]);
  h.handlePostRdoAssinatura('rdo1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  restore();
});

test('POST — Content-Type não permitido devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'file', filename: 'ass.gif', contentType: 'image/gif', data: PNG_BYTES },
    { name: 'papel', data: 'encarregado' }, { name: 'nome', data: 'João' },
  ]);
  h.handlePostRdoAssinatura('rdo1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Tipo não permitido/);
  restore();
});

test('POST — magic-bytes não batem com Content-Type declarado devolve 400 (A-05)', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'file', filename: 'ass.png', contentType: 'image/png', data: INVALID_IMAGE_BYTES },
    { name: 'papel', data: 'encarregado' }, { name: 'nome', data: 'João' },
  ]);
  h.handlePostRdoAssinatura('rdo1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /não é uma imagem válida/);
  assert.equal(queries.length, 0, 'não deve gravar nada quando a imagem falha a validação');
  restore();
});

test('POST — papel fora da allowlist devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'file', filename: 'ass.png', contentType: 'image/png', data: PNG_BYTES },
    { name: 'papel', data: 'gerente_geral' }, { name: 'nome', data: 'João' },
  ]);
  h.handlePostRdoAssinatura('rdo1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Papel inválido/);
  restore();
});

test('POST — nome vazio devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'file', filename: 'ass.png', contentType: 'image/png', data: PNG_BYTES },
    { name: 'papel', data: 'encarregado' }, { name: 'nome', data: '  ' },
  ]);
  h.handlePostRdoAssinatura('rdo1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Nome obrigatório/);
  restore();
});

test('POST — RDO inexistente devolve 404 mesmo com upload válido', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'file', filename: 'ass.png', contentType: 'image/png', data: PNG_BYTES },
    { name: 'papel', data: 'cliente' }, { name: 'nome', data: 'Maria' },
  ]);
  h.handlePostRdoAssinatura('rdoX', req, res);
  await waitEnd(req);
  assert.equal(res.status, 404);
  restore();
});

test('POST — sucesso grava no banco e devolve papel/nome/tamanho', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'file', filename: 'ass.png', contentType: 'image/png', data: PNG_BYTES },
    { name: 'papel', data: 'fiscal' }, { name: 'nome', data: 'Carlos Fiscal' },
  ]);
  h.handlePostRdoAssinatura('rdo1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 200);
  assert.equal(res.body.papel, 'fiscal');
  assert.equal(res.body.nome, 'Carlos Fiscal');
  assert.equal(res.body.sizeBytes, PNG_BYTES.length);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO rdo_assinaturas/);
  assert.equal(queries[0].params[1], 'rdo1');
  assert.equal(queries[0].params[2], 'fiscal');
  restore();
});

test('POST — IP gravado a partir do X-Forwarded-For quando presente (FIX L5)', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'file', filename: 'ass.png', contentType: 'image/png', data: PNG_BYTES },
    { name: 'papel', data: 'engenheiro' }, { name: 'nome', data: 'Eng X' },
  ]);
  req.headers['x-forwarded-for'] = '203.0.113.9, 10.0.0.1';
  req.socket = { remoteAddress: '10.0.0.1' }; // IP do proxy — não deve ser usado se XFF presente
  h.handlePostRdoAssinatura('rdo1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 200);
  const ipParamIdx = 6; // (id, rdo_id, papel, nome, imagem, mime_type, ip, user_agent)
  assert.equal(queries[0].params[ipParamIdx], '203.0.113.9');
  restore();
});

// ---------------- LIST / GET / DELETE ----------------

test('LIST — devolve assinaturas do RDO sem o binário (colunas explícitas)', async () => {
  db.getMany = async (sql, params) => {
    assert.match(sql, /SELECT id, rdo_id, papel, nome, mime_type, ip, created_at/);
    assert.deepEqual(params, ['rdo1']);
    return [{ id: 'a1', papel: 'cliente' }];
  };
  const res = fakeRes();
  await h.handleListRdoAssinaturas('rdo1', res);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.assinaturas, [{ id: 'a1', papel: 'cliente' }]);
  restore();
});

test('GET — assinatura inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleGetRdoAssinatura('rdo1', 'naoexiste', res);
  assert.equal(res.status, 404);
  restore();
});

test('GET — devolve o binário com Content-Type da imagem', async () => {
  db.getOne = async () => ({ mimeType: 'image/png', imagem: PNG_BYTES });
  const res = fakeRes();
  await h.handleGetRdoAssinatura('rdo1', 'a1', res);
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'image/png');
  assert.deepEqual(res.body, PNG_BYTES);
  restore();
});

test('DELETE — remove escopado por rdo_id (não deleta assinatura de outro RDO)', async () => {
  const res = fakeRes();
  await h.handleDeleteRdoAssinatura('rdo1', 'a1', res);
  assert.equal(res.status, 200);
  assert.match(queries[0].sql, /DELETE FROM rdo_assinaturas WHERE id = \$1 AND rdo_id = \$2/);
  assert.deepEqual(queries[0].params, ['a1', 'rdo1']);
  restore();
});
