'use strict';
/**
 * Handler CRUD de Notas Fiscais + emitir/cancelar-emissão
 * (handlers/notas-fiscais.js) — sem cobertura de camada HTTP antes desta
 * mudança. `db`/`repos` dublados — nada toca o Postgres.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const h = require('../handlers/notas-fiscais');

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
  notasFiscais: repos.notasFiscais, caixa: repos.caixa, contracts: repos.contracts,
};
let nfs, caixaEntries;

beforeEach(() => {
  nfs = []; caixaEntries = [];
  db.withTransaction = async (fn) => fn({ query: async () => ({ rows: [] }) });
  repos.notasFiscais = {
    findAll: async () => nfs,
    findById: async (id) => nfs.find((n) => n.id === id) || null,
    create: async (n) => { nfs.push(n); return n; },
    updateById: async (id, patch) => {
      const n = nfs.find((x) => x.id === id);
      if (!n) return null;
      Object.assign(n, patch);
      return n;
    },
    removeById: async (id) => { nfs = nfs.filter((n) => n.id !== id); return true; },
  };
  repos.caixa = {
    findAll: async () => caixaEntries,
    create: async (e) => { caixaEntries.push(e); return e; },
    updateById: async (id, patch) => {
      const e = caixaEntries.find((x) => x.id === id);
      if (!e) return null;
      Object.assign(e, patch);
      return e;
    },
    removeById: async (id) => { caixaEntries = caixaEntries.filter((e) => e.id !== id); return true; },
  };
  repos.contracts = { findById: async () => null };
});

function restore() {
  Object.assign(db, { withTransaction: orig.withTransaction });
  Object.assign(repos, { notasFiscais: orig.notasFiscais, caixa: orig.caixa, contracts: orig.contracts });
}

test('POST — campos obrigatórios ausentes devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostNotaFiscal({}, res);
  assert.equal(res.status, 400);
  assert.equal(nfs.length, 0);
  restore();
});

test('POST — cria NF válida com prazoRecebimento default de 30 dias', async () => {
  const res = fakeRes();
  await h.handlePostNotaFiscal({ numero: 'NF-001', contractId: 'ctr1', dataLimite: '2026-10-01', valor: 1000 }, res);
  assert.equal(res.status, 200);
  assert.equal(nfs.length, 1);
  assert.equal(nfs[0].prazoRecebimento, 30);
  assert.equal(nfs[0].emitida, false);
  restore();
});

test('PUT — NF inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutNotaFiscal('naoexiste', { valor: 500 }, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT — valor inválido devolve 400', async () => {
  nfs.push({ id: 'nf1', numero: 'NF-001', valor: 1000, emitida: false });
  const res = fakeRes();
  await h.handlePutNotaFiscal('nf1', { valor: -100 }, res);
  assert.equal(res.status, 400);
  restore();
});

test('PUT — NF emitida com data alterada sincroniza a entrada de caixa vinculada', async () => {
  nfs.push({
    id: 'nf1', numero: 'NF-001', valor: 1000, prazoRecebimento: 30,
    emitida: true, dataEmissaoReal: '2026-09-01', caixaEntryId: 'cxa1',
  });
  caixaEntries.push({ id: 'cxa1', value: 1000, date: '2026-10-01' });
  const res = fakeRes();
  await h.handlePutNotaFiscal('nf1', { dataEmissaoReal: '2026-09-10' }, res);
  assert.equal(res.status, 200);
  assert.equal(caixaEntries[0].date, '2026-10-10');
  restore();
});

test('DELETE — remove a NF e a entrada de caixa vinculada', async () => {
  nfs.push({ id: 'nf1', caixaEntryId: 'cxa1' });
  caixaEntries.push({ id: 'cxa1' });
  const res = fakeRes();
  await h.handleDeleteNotaFiscal('nf1', res);
  assert.equal(res.status, 200);
  assert.equal(nfs.length, 0);
  assert.equal(caixaEntries.length, 0);
  restore();
});

test('emitir — NF inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleEmitirNotaFiscal('naoexiste', {}, res);
  assert.equal(res.status, 404);
  restore();
});

test('emitir — NF já emitida devolve 400', async () => {
  nfs.push({ id: 'nf1', numero: 'NF-001', valor: 1000, prazoRecebimento: 30, emitida: true });
  const res = fakeRes();
  await h.handleEmitirNotaFiscal('nf1', {}, res);
  assert.equal(res.status, 400);
  restore();
});

test('emitir — cria entrada de caixa e marca a NF como emitida', async () => {
  nfs.push({ id: 'nf1', numero: 'NF-001', contractId: null, valor: 1000, prazoRecebimento: 30, emitida: false });
  const res = fakeRes();
  await h.handleEmitirNotaFiscal('nf1', { dataEmissaoReal: '2026-09-08' }, res);
  assert.equal(res.status, 200);
  assert.equal(nfs[0].emitida, true);
  assert.equal(caixaEntries.length, 1);
  assert.equal(caixaEntries[0].value, 1000);
  assert.equal(nfs[0].caixaEntryId, caixaEntries[0].id);
  restore();
});

test('cancelar-emissão — NF inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleCancelarEmissao('naoexiste', res);
  assert.equal(res.status, 404);
  restore();
});

test('cancelar-emissão — remove a entrada de caixa e reverte o status da NF', async () => {
  nfs.push({ id: 'nf1', emitida: true, dataEmissaoReal: '2026-09-08', caixaEntryId: 'cxa1' });
  caixaEntries.push({ id: 'cxa1' });
  const res = fakeRes();
  await h.handleCancelarEmissao('nf1', res);
  assert.equal(res.status, 200);
  assert.equal(nfs[0].emitida, false);
  assert.equal(nfs[0].caixaEntryId, null);
  assert.equal(caixaEntries.length, 0);
  restore();
});
