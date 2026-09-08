'use strict';
/**
 * Handler de Fornecedores (handlers/fornecedores.js), com `repos` dublado —
 * nada toca o Postgres. Antes desta mudança o handler não validava nada
 * (nome vazio, CNPJ/email de qualquer formato eram aceitos); achado da
 * varredura de melhorias — cobre a validação nova via lib/validate.js.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/fornecedores');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { fornecedores: repos.fornecedores };
let created, updatedId, updatedPatch;

beforeEach(() => {
  created = null; updatedId = null; updatedPatch = null;
  repos.fornecedores = {
    findAll: async () => (created ? [created] : []),
    create: async (f) => { created = f; return f; },
    updateById: async (id, patch) => {
      if (id !== 'for1') return null;
      updatedId = id; updatedPatch = patch;
      return { id, ...patch };
    },
    removeById: async () => true,
  };
});

function restore() { Object.assign(repos, orig); }

// ---------------- POST ----------------

test('POST: sem nome devolve 400, não chega a criar', async () => {
  const res = fakeRes();
  await h.handlePostFornecedor({}, res);
  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('nome'));
  assert.equal(created, null);
  restore();
});

test('POST: CNPJ com formato inválido devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostFornecedor({ nome: 'Acme', cnpj: '123' }, res);
  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('cnpj') || res.body.error.includes('CNPJ'));
  restore();
});

test('POST: email com formato inválido devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostFornecedor({ nome: 'Acme', email: 'nao-e-email' }, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST: corpo válido cria o fornecedor com os campos normalizados', async () => {
  const res = fakeRes();
  await h.handlePostFornecedor({
    nome: '  Acme Materiais  ', cnpj: '12.345.678/0001-90', email: 'contato@acme.com',
    materiais: 'cimento, areia',
  }, res);
  assert.equal(res.status, 200);
  assert.ok(created);
  assert.equal(created.nome, 'Acme Materiais');
  assert.equal(created.cnpj, '12.345.678/0001-90');
  assert.equal(created.email, 'contato@acme.com');
  assert.deepEqual(JSON.parse(created.materiais), ['cimento', 'areia']);
  restore();
});

test('POST: materiais ausente cria array vazio (não lança)', async () => {
  const res = fakeRes();
  await h.handlePostFornecedor({ nome: 'Acme' }, res);
  assert.deepEqual(JSON.parse(created.materiais), []);
  restore();
});

// ---------------- PUT ----------------

test('PUT: nome vazio explícito devolve 400', async () => {
  const res = fakeRes();
  await h.handlePutFornecedor('for1', { nome: '' }, res);
  assert.equal(res.status, 400);
  assert.equal(updatedId, null);
  restore();
});

test('PUT: atualiza só os campos enviados', async () => {
  const res = fakeRes();
  await h.handlePutFornecedor('for1', { telefone: '(11) 90000-0000' }, res);
  assert.equal(updatedId, 'for1');
  assert.equal(updatedPatch.telefone, '(11) 90000-0000');
  assert.ok(!('nome' in updatedPatch));
  restore();
});

test('PUT: fornecedor inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutFornecedor('naoexiste', { nome: 'X' }, res);
  assert.equal(res.status, 404);
  restore();
});
