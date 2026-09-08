'use strict';
/**
 * Handler CRUD principal de Contratos (handlers/contracts.js) — sem
 * cobertura de camada HTTP antes desta mudança. `repos` dublado — nada toca
 * o Postgres.
 *
 * Cobre também a troca de `money.parse(body.value)` (zerava valor inválido
 * em silêncio) por `parseOptionalMoney` (lib/validate.js — rejeita com 400
 * em vez de zerar).
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/contracts');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { contracts: repos.contracts };
let contracts, created;

beforeEach(() => {
  contracts = [{ id: 'ctr1', name: 'Obra X', value: 1000 }];
  created = null;
  repos.contracts = {
    getEnvelope: async () => ({ contracts }),
    create: async (c) => { created = c; contracts.push(c); return c; },
    updateById: async (id, patch) => {
      const c = contracts.find((x) => x.id === id);
      if (!c) return null;
      Object.assign(c, patch);
      return c;
    },
  };
});

function restore() { Object.assign(repos, { contracts: orig.contracts }); }

test('POST — sem nome/cliente devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostContract({}, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST — sem value usa o default (0), não lança', async () => {
  const res = fakeRes();
  await h.handlePostContract({ name: 'Obra Y', client: 'Cliente Y' }, res);
  assert.equal(res.status, 200);
  assert.equal(created.value, 0);
  restore();
});

test('POST — value numérico válido é aceito e arredondado', async () => {
  const res = fakeRes();
  await h.handlePostContract({ name: 'Obra Y', client: 'Cliente Y', value: '150000.456' }, res);
  assert.equal(res.status, 200);
  assert.equal(created.value, 150000.46);
  restore();
});

test('POST — value inválido (string não-numérica) devolve 400 em vez de zerar em silêncio', async () => {
  const res = fakeRes();
  await h.handlePostContract({ name: 'Obra Y', client: 'Cliente Y', value: 'não é número' }, res);
  assert.equal(res.status, 400);
  assert.ok(res.body.error.includes('value'));
  assert.equal(created, null, 'não deve ter criado o contrato com valor errado');
  restore();
});

test('POST — value negativo devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostContract({ name: 'Obra Y', client: 'Cliente Y', value: -500 }, res);
  assert.equal(res.status, 400);
  restore();
});

test('PUT — contrato inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutContract('naoexiste', { value: 500 }, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT — value inválido devolve 400, não zera o valor existente', async () => {
  const res = fakeRes();
  await h.handlePutContract('ctr1', { value: 'abc' }, res);
  assert.equal(res.status, 400);
  assert.equal(contracts[0].value, 1000, 'valor original preservado — não foi zerado em silêncio');
  restore();
});

test('PUT — value válido atualiza normalmente', async () => {
  const res = fakeRes();
  await h.handlePutContract('ctr1', { value: 2500 }, res);
  assert.equal(res.status, 200);
  assert.equal(contracts[0].value, 2500);
  restore();
});
