'use strict';
/**
 * Handler CRUD do Caixa (handlers/caixa.js) — sem cobertura de camada HTTP
 * antes desta mudança. `repos` dublado — nada toca o Postgres.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/caixa');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { caixa: repos.caixa };
let entries;

beforeEach(() => {
  entries = [];
  repos.caixa = {
    findAll: async () => entries,
    findPageKeyset: async ({ limit }) => entries.slice(0, limit),
    create: async (e) => { entries.push(e); return e; },
    updateById: async (id, patch) => {
      const e = entries.find((x) => x.id === id);
      if (!e) return null;
      Object.assign(e, patch);
      return e;
    },
    removeById: async (id) => { entries = entries.filter((e) => e.id !== id); return true; },
  };
});

function restore() { Object.assign(repos, orig); }

test('GET — sem query devolve o envelope { entries } completo', async () => {
  entries.push({ id: 'c1' });
  const res = fakeRes();
  await h.handleGetCaixa(res, {});
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 1);
  restore();
});

test('GET — com ?page=1 usa a paginação keyset', async () => {
  entries.push({ id: 'c1' }, { id: 'c2' });
  const res = fakeRes();
  await h.handleGetCaixa(res, { page: '1', limit: '1' });
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 1);
  restore();
});

test('POST — cria lançamento com defaults (type=entrada, category=geral)', async () => {
  const res = fakeRes();
  await h.handlePostCaixa({ description: 'Venda', value: 500 }, res);
  assert.equal(res.status, 200);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, 'entrada');
  assert.equal(entries[0].category, 'geral');
  assert.equal(entries[0].value, 500);
  restore();
});

test('PUT — lançamento inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutCaixa('naoexiste', { value: 100 }, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT — atualiza só os campos presentes', async () => {
  entries.push({ id: 'c1', type: 'entrada', description: 'Original', value: 100 });
  const res = fakeRes();
  await h.handlePutCaixa('c1', { description: 'Atualizado' }, res);
  assert.equal(res.status, 200);
  assert.equal(entries[0].description, 'Atualizado');
  assert.equal(entries[0].value, 100);
  restore();
});

test('DELETE — remove o lançamento', async () => {
  entries.push({ id: 'c1' });
  const res = fakeRes();
  await h.handleDeleteCaixa('c1', res);
  assert.equal(res.status, 200);
  assert.equal(entries.length, 0);
  restore();
});
