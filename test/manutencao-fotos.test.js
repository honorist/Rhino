'use strict';
/**
 * Handler de fotos de Manutenção (handlers/manutencao-fotos.js) — espelha
 * handlers/rdo-fotos.js (mesmo padrão, ver test/rdo-fotos.test.js). `db`/
 * `repos` dublados; upload simulado via test/helpers/multipart.js.
 *  - POST tudo-ou-nada numa transação; fotos inválidas são puladas; se
 *    nenhuma sobrar válida, dá rollback (sem cota aqui — sem FIX L7 nesta
 *    versão, ao contrário de rdo-fotos.js);
 *  - DELETE não falha se o DELETE do binário der erro.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const h = require('../handlers/manutencao-fotos');
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

const orig = { withTransaction: db.withTransaction, query: db.query, manutencoes: repos.manutencoes };
let clientQueries;
let manFotos;

beforeEach(() => {
  clientQueries = [];
  manFotos = [];
  db.withTransaction = async (fn) => {
    const client = { query: async (sql, params) => { clientQueries.push({ sql, params }); return { rows: [] }; } };
    return fn(client);
  };
  db.query = async (sql, params) => { clientQueries.push({ sql, params }); return { rows: [] }; };
  repos.manutencoes = {
    findById: async (id) => (id === 'man1' ? { id: 'man1', fotos: manFotos } : null),
    updateById: async (id, patch) => ({ id, ...patch }),
  };
});

function restore() {
  Object.assign(db, { withTransaction: orig.withTransaction, query: orig.query });
  Object.assign(repos, { manutencoes: orig.manutencoes });
}

function waitEnd(req) {
  return new Promise((resolve) => req.once('end', () => setImmediate(resolve)));
}

test('POST — sem Content-Type multipart devolve 400 sincronamente', async () => {
  const res = fakeRes();
  h.handlePostManutencaoFoto('man1', { headers: {} }, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST — manutenção inexistente devolve 404', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'foto', filename: 'x.png', contentType: 'image/png', data: PNG_BYTES }]);
  h.handlePostManutencaoFoto('manX', req, res);
  await waitEnd(req);
  assert.equal(res.status, 404);
  restore();
});

test('POST — sem arquivos enviados devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'legenda', data: 'sem foto' }]);
  h.handlePostManutencaoFoto('man1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Nenhum arquivo/);
  restore();
});

test('POST — magic-bytes inválidos: nenhuma foto sobra válida, 400 e rollback', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'foto', filename: 'x.png', contentType: 'image/png', data: INVALID_IMAGE_BYTES }]);
  h.handlePostManutencaoFoto('man1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Nenhuma imagem válida/);
  assert.equal(clientQueries.filter((q) => /INSERT/.test(q.sql)).length, 0);
  restore();
});

test('POST — sucesso: insere BYTEA e atualiza o JSONB fotos da manutenção', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([
    { name: 'legenda', data: 'Peça trocada' },
    { name: 'foto', filename: 'x.png', contentType: 'image/png', data: PNG_BYTES },
  ]);
  h.handlePostManutencaoFoto('man1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 200);
  assert.equal(res.body.fotos.length, 1);
  assert.equal(res.body.fotos[0].legenda, 'Peça trocada');
  assert.match(res.body.fotos[0].url, /^\/data\/manutencao-fotos\/man1\//);
  assert.ok(clientQueries.some((q) => /INSERT INTO manutencao_fotos/.test(q.sql)));
  assert.ok(clientQueries.some((q) => /UPDATE manutencoes SET fotos/.test(q.sql)));
  restore();
});

test('DELETE — manutenção inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteManutencaoFoto('manX', 'f1', res);
  assert.equal(res.status, 404);
  restore();
});

test('DELETE — remove do JSONB mesmo se o DELETE do binário falhar (não propaga o erro)', async () => {
  manFotos = [{ id: 'f1', filename: 'f1.png' }];
  db.query = async () => { throw new Error('falha de rede simulada'); };
  let updatedPatch = null;
  repos.manutencoes.updateById = async (id, patch) => { updatedPatch = patch; return { id, ...patch }; };
  const res = fakeRes();
  await h.handleDeleteManutencaoFoto('man1', 'f1', res);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(updatedPatch.fotos), []);
  restore();
});
