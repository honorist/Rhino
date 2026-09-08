'use strict';
/**
 * Handler de Investimentos/Aportes (handlers/investimentos.js) — sem
 * cobertura de camada HTTP antes desta mudança. `db`/`repos` dublados —
 * nada toca o Postgres.
 *
 * Cobre também a troca de `money.parse(body.value)` (aceitava e ZERAVA
 * silenciosamente um aporte com valor inválido/ausente/zero) por
 * `parsePositiveMoney` (lib/validate.js — exige > 0, rejeita com 400).
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const h = require('../handlers/investimentos');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = {
  withTransaction: db.withTransaction,
  investimentos: repos.investimentos, baseItems: repos.baseItems, caixa: repos.caixa,
};
let aportes, baseItems, caixaEntries;

beforeEach(() => {
  aportes = []; baseItems = []; caixaEntries = [];
  db.withTransaction = async (fn) => fn({ query: async () => ({ rows: [] }) });
  repos.investimentos = {
    findAll: async () => aportes,
    findById: async (id) => aportes.find((a) => a.id === id) || null,
    create: async (a) => { aportes.push(a); return a; },
    removeById: async (id) => { aportes = aportes.filter((a) => a.id !== id); return true; },
  };
  repos.baseItems = {
    findById: async (id) => baseItems.find((b) => b.id === id) || null,
    create: async (b) => { baseItems.push(b); return b; },
    removeById: async (id) => { baseItems = baseItems.filter((b) => b.id !== id); return true; },
  };
  repos.caixa = {
    create: async (e) => { caixaEntries.push(e); return e; },
    removeById: async (id) => { caixaEntries = caixaEntries.filter((e) => e.id !== id); return true; },
  };
});

function restore() {
  Object.assign(db, { withTransaction: orig.withTransaction });
  Object.assign(repos, { investimentos: orig.investimentos, baseItems: orig.baseItems, caixa: orig.caixa });
}

test('POST — aporte válido é criado', async () => {
  const res = fakeRes();
  await h.handlePostInvestimento({ value: 5000, destino: 'contrato', contractId: 'ctr1' }, res);
  assert.equal(res.status, 200);
  assert.equal(aportes.length, 1);
  assert.equal(aportes[0].value, 5000);
  restore();
});

test('POST — sem value devolve 400 (antes zerava em silêncio e criava aporte de R$0)', async () => {
  const res = fakeRes();
  await h.handlePostInvestimento({ destino: 'contrato' }, res);
  assert.equal(res.status, 400);
  assert.equal(aportes.length, 0, 'nenhum aporte deve ter sido criado');
  restore();
});

test('POST — value zero devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostInvestimento({ value: 0, destino: 'contrato' }, res);
  assert.equal(res.status, 400);
  assert.equal(aportes.length, 0);
  restore();
});

test('POST — value inválido (string não-numérica) devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostInvestimento({ value: 'muito dinheiro', destino: 'contrato' }, res);
  assert.equal(res.status, 400);
  assert.equal(aportes.length, 0);
  restore();
});

test('POST — destino "base" cria o base item vinculado com o mesmo valor', async () => {
  const res = fakeRes();
  await h.handlePostInvestimento({ value: 3000, destino: 'base', baseType: 'equipamento' }, res);
  assert.equal(res.status, 200);
  assert.equal(baseItems.length, 1);
  assert.equal(baseItems[0].value, 3000);
  assert.equal(aportes[0].baseItemId, baseItems[0].id);
  restore();
});

test('POST — origem "caixa_empresa" lança uma saída de caixa no mesmo valor', async () => {
  const res = fakeRes();
  await h.handlePostInvestimento({ value: 800, origem: 'caixa_empresa', destino: 'contrato', contractId: 'ctr1' }, res);
  assert.equal(res.status, 200);
  assert.equal(caixaEntries.length, 1);
  assert.equal(caixaEntries[0].value, 800);
  restore();
});

test('DELETE — remove o aporte, o caixa e o base item vinculados', async () => {
  aportes.push({ id: 'ap1', caixaEntryId: 'cxa1', baseItemId: 'bas1' });
  caixaEntries.push({ id: 'cxa1' });
  baseItems.push({ id: 'bas1', allocations: [] });
  const res = fakeRes();
  await h.handleDeleteInvestimento('ap1', res);
  assert.equal(res.status, 200);
  assert.equal(aportes.length, 0);
  assert.equal(caixaEntries.length, 0);
  assert.equal(baseItems.length, 0);
  restore();
});
