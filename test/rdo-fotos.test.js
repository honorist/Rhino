'use strict';
/**
 * Handler de fotos de RDO (handlers/rdo-fotos.js), com `db`/`repos` dublados
 * — nada toca o Postgres, upload simulado via test/helpers/multipart.js.
 *  - POST é tudo-ou-nada numa transação (db.withTransaction): fotos inválidas
 *    são silenciosamente puladas (`continue`), mas se NENHUMA sobrar válida,
 *    ou a cota (60/RDO) estourar, a transação inteira dá rollback;
 *  - cota por RDO (FIX L7) conta fotos já existentes + as novas do lote;
 *  - DELETE tenta remover o binário mas não falha a operação se der erro
 *    (loga e segue removendo do JSONB — evita órfão no outro sentido).
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const h = require('../handlers/rdo-fotos');
const { fakeMultipartReq, PNG_BYTES, INVALID_IMAGE_BYTES } = require('./helpers/multipart');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { withTransaction: db.withTransaction, query: db.query, rdos: repos.rdos, contracts: repos.contracts };
let clientQueries;
let rdoFotos;

beforeEach(() => {
  clientQueries = [];
  rdoFotos = [];
  db.withTransaction = async (fn) => {
    const client = { query: async (sql, params) => { clientQueries.push({ sql, params }); return { rows: [] }; } };
    return fn(client);
  };
  db.query = async (sql, params) => { clientQueries.push({ sql, params }); return { rows: [] }; };
  repos.rdos = {
    findById: async (id) => (id === 'rdo1' ? { id: 'rdo1', fotos: rdoFotos } : null),
    updateById: async (id, patch) => ({ id, ...patch }),
  };
  repos.contracts = { getEnvelope: async () => ({ contracts: [] }) };
});

function restore() {
  Object.assign(db, { withTransaction: orig.withTransaction, query: orig.query });
  Object.assign(repos, { rdos: orig.rdos, contracts: orig.contracts });
}

function waitEnd(req) {
  return new Promise((resolve) => req.once('end', () => setImmediate(resolve)));
}

test('POST — sem Content-Type multipart devolve 400 sincronamente', async () => {
  const res = fakeRes();
  h.handlePostRdoFoto('C1', 'rdo1', { headers: {} }, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST — RDO inexistente devolve 404', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'foto', filename: 'x.png', contentType: 'image/png', data: PNG_BYTES }]);
  h.handlePostRdoFoto('C1', 'rdoX', req, res);
  await waitEnd(req);
  assert.equal(res.status, 404);
  restore();
});

test('POST — sem arquivos enviados devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'legenda', data: 'sem foto' }]);
  h.handlePostRdoFoto('C1', 'rdo1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Nenhum arquivo/);
  restore();
});

test('POST — todas as fotos com magic-bytes inválidos: nenhuma sobra válida, 400 e rollback', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'foto', filename: 'x.png', contentType: 'image/png', data: INVALID_IMAGE_BYTES },
  ]);
  h.handlePostRdoFoto('C1', 'rdo1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Nenhuma imagem válida/);
  assert.equal(clientQueries.filter((q) => /INSERT/.test(q.sql)).length, 0);
  restore();
});

test('POST — sucesso: insere BYTEA e atualiza o JSONB fotos do RDO na mesma transação', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'legenda', data: 'Fundação' },
    { name: 'foto', filename: 'x.png', contentType: 'image/png', data: PNG_BYTES },
  ]);
  h.handlePostRdoFoto('C1', 'rdo1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 200);
  assert.equal(res.body.fotos.length, 1);
  assert.equal(res.body.fotos[0].legenda, 'Fundação');
  assert.match(res.body.fotos[0].url, /^\/data\/rdo-fotos\/rdo1\//);
  const inserts = clientQueries.filter((q) => /INSERT INTO rdo_fotos/.test(q.sql));
  const updates = clientQueries.filter((q) => /UPDATE rdos SET fotos/.test(q.sql));
  assert.equal(inserts.length, 1);
  assert.equal(updates.length, 1);
  restore();
});

test('POST — cota de 60 fotos por RDO: excede e dá rollback (400, sem gravar)', async () => {
  rdoFotos = Array.from({ length: 60 }, (_, i) => ({ id: `f${i}` }));
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'foto', filename: 'x.png', contentType: 'image/png', data: PNG_BYTES }]);
  h.handlePostRdoFoto('C1', 'rdo1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Limite de 60 fotos/);
  const updates = clientQueries.filter((q) => /UPDATE rdos SET fotos/.test(q.sql));
  assert.equal(updates.length, 0, 'a atualização do JSONB não deve acontecer quando a cota estoura');
  restore();
});

test('DELETE — RDO inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteRdoFoto('C1', 'rdoX', 'f1', res);
  assert.equal(res.status, 404);
  restore();
});

test('DELETE — remove do JSONB mesmo se o DELETE do binário falhar (não propaga o erro)', async () => {
  rdoFotos = [{ id: 'f1', filename: 'f1.png' }];
  db.query = async () => { throw new Error('falha de rede simulada'); };
  const res = fakeRes();
  let updatedPatch = null;
  repos.rdos.updateById = async (id, patch) => { updatedPatch = patch; return { id, ...patch }; };
  await h.handleDeleteRdoFoto('C1', 'rdo1', 'f1', res);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(updatedPatch.fotos), []);
  restore();
});
