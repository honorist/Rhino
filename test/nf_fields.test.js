// ATENÇÃO: este arquivo testava o servidor baseado em JSON (arquitetura antiga).
// O servidor agora usa PostgreSQL. Estes testes foram migrados para test/e2e/api.spec.js.
// Mantido apenas como referência histórica — NÃO é executado pelo CI (está fora de test/e2e/).

// Integration tests for Nota Fiscal PUT endpoint — fields created/modified in this session:
//   • dataEmissaoReal (new editable field for emitted NFs)
//   • prazoRecebimento sync to caixa entry
//   • valor sync to caixa entry
//   • dataLimite update on non-emitted NF
'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const fs     = require('node:fs');
const path   = require('node:path');
const os     = require('node:os');

// ─── Test data helpers ────────────────────────────────────────────────────────

let testDataDir;
let server;
let baseUrl;

function writeTestFile(filename, data) {
  fs.writeFileSync(path.join(testDataDir, filename), JSON.stringify(data, null, 2));
}

function readTestFile(filename) {
  return JSON.parse(fs.readFileSync(path.join(testDataDir, filename), 'utf8'));
}

function seedNF(overrides = {}) {
  const nf = {
    id: 'nf_test001',
    numero: 'NF-001',
    contractId: 'ctr_test001',
    dataLimite: '2026-05-01',
    valor: 10000,
    prazoRecebimento: 30,
    observacoes: '',
    emitida: false,
    dataEmissaoReal: null,
    caixaEntryId: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
  writeTestFile('notas_fiscais.json', { notas_fiscais: [nf] });
  return nf;
}

function seedEmittedNF(overrides = {}) {
  const caixaEntryId = 'cxa_test001';
  const nf = seedNF({
    emitida: true,
    dataEmissaoReal: '2026-04-10',
    caixaEntryId,
    prazoRecebimento: 30,
    valor: 10000,
    ...overrides,
  });
  writeTestFile('caixa.json', {
    entries: [{
      id: caixaEntryId,
      type: 'entrada',
      description: 'Recebimento NF NF-001',
      value: 10000,
      date: '2026-05-10', // 2026-04-10 + 30 days
      category: 'nota_fiscal',
      nfId: 'nf_test001',
    }],
  });
  return nf;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const put = (urlPath, body) => request('PUT', urlPath, body);

// ─── Lifecycle ────────────────────────────────────────────────────────────────

before(async () => {
  // Isolated temp directory — never touches real data
  testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhino-test-'));
  fs.mkdirSync(path.join(testDataDir, 'backups'), { recursive: true });

  // Seed minimal files the server expects at startup
  writeTestFile('notas_fiscais.json', { notas_fiscais: [] });
  writeTestFile('caixa.json', { entries: [] });
  writeTestFile('contracts.json', { contracts: [], saidas: [] });
  writeTestFile('base.json', { items: [] });
  writeTestFile('socios.json', { socios: [] });
  writeTestFile('investimentos.json', { investimentos: [] });
  writeTestFile('tipos_base.json', { tipos: [] });
  writeTestFile('clientes.json', { clientes: [] });
  writeTestFile('fornecedores.json', { fornecedores: [] });
  writeTestFile('contas_pagar.json', { contas: [] });
  writeTestFile('recursos.json', { recursos: [] });
  writeTestFile('niveis_acesso.json', { niveis: [] });
  writeTestFile('doc_templates.json', { templates: [] });

  // Start server with isolated data dir on a free port
  process.env.DATA_DIR = testDataDir;
  process.env.PORT = '0'; // OS picks a free port
  const app = require('../server.js');
  server = app.__server;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Reset to clean state before each test
  writeTestFile('notas_fiscais.json', { notas_fiscais: [] });
  writeTestFile('caixa.json', { entries: [] });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

test('PUT /api/notas-fiscais/:id — 404 for unknown id', async () => {
  const res = await put('/api/notas-fiscais/nf_doesnotexist', { numero: 'X' });
  assert.equal(res.status, 404);
  assert.ok(res.body.error);
});

test('PUT /api/notas-fiscais/:id — updates dataLimite on non-emitted NF', async () => {
  seedNF();
  const res = await put('/api/notas-fiscais/nf_test001', {
    numero: 'NF-001',
    contractId: 'ctr_test001',
    dataLimite: '2026-06-15',
    valor: 10000,
    prazoRecebimento: 30,
    observacoes: '',
  });
  assert.equal(res.status, 200);
  const saved = readTestFile('notas_fiscais.json');
  const nf = saved.notas_fiscais.find(n => n.id === 'nf_test001');
  assert.equal(nf.dataLimite, '2026-06-15');
});

test('PUT /api/notas-fiscais/:id — does not touch caixa entry for non-emitted NF', async () => {
  seedNF();
  writeTestFile('caixa.json', { entries: [{ id: 'cxa_other', value: 999 }] });
  await put('/api/notas-fiscais/nf_test001', {
    numero: 'NF-001', contractId: 'ctr_test001',
    dataLimite: '2026-06-01', valor: 10000, prazoRecebimento: 30, observacoes: '',
  });
  const caixa = readTestFile('caixa.json');
  // Unrelated entry must be untouched
  assert.equal(caixa.entries.length, 1);
  assert.equal(caixa.entries[0].value, 999);
});

test('PUT /api/notas-fiscais/:id — updates prazoRecebimento and syncs caixa entry date', async () => {
  // Emitted NF: emissao=2026-04-10, prazo=30 → recebimento=2026-05-10
  seedEmittedNF();

  const res = await put('/api/notas-fiscais/nf_test001', {
    numero: 'NF-001', contractId: 'ctr_test001',
    dataLimite: '2026-05-01', valor: 10000,
    prazoRecebimento: 60, // changed from 30 → 60
    observacoes: '',
  });
  assert.equal(res.status, 200);

  // NF prazo updated
  const nfs = readTestFile('notas_fiscais.json');
  const nf = nfs.notas_fiscais.find(n => n.id === 'nf_test001');
  assert.equal(nf.prazoRecebimento, 60);

  // Caixa entry date recalculated: 2026-04-10 + 60 days = 2026-06-09
  const caixa = readTestFile('caixa.json');
  const entry = caixa.entries.find(e => e.id === 'cxa_test001');
  assert.equal(entry.date, '2026-06-09');
});

test('PUT /api/notas-fiscais/:id — dataEmissaoReal field updates caixa entry date', async () => {
  // Emitted NF: emissao=2026-04-10, prazo=30 → recebimento=2026-05-10
  seedEmittedNF();

  const res = await put('/api/notas-fiscais/nf_test001', {
    numero: 'NF-001', contractId: 'ctr_test001',
    dataLimite: '2026-05-01', valor: 10000,
    prazoRecebimento: 30,
    dataEmissaoReal: '2026-04-20', // changed from 2026-04-10 → 2026-04-20
    observacoes: '',
  });
  assert.equal(res.status, 200);

  // NF dataEmissaoReal updated
  const nfs = readTestFile('notas_fiscais.json');
  const nf = nfs.notas_fiscais.find(n => n.id === 'nf_test001');
  assert.equal(nf.dataEmissaoReal, '2026-04-20');

  // Caixa entry date recalculated: 2026-04-20 + 30 days = 2026-05-20
  const caixa = readTestFile('caixa.json');
  const entry = caixa.entries.find(e => e.id === 'cxa_test001');
  assert.equal(entry.date, '2026-05-20');
});

test('PUT /api/notas-fiscais/:id — valor change syncs caixa entry value', async () => {
  seedEmittedNF({ valor: 10000 });

  await put('/api/notas-fiscais/nf_test001', {
    numero: 'NF-001', contractId: 'ctr_test001',
    dataLimite: '2026-05-01', valor: 25000, // changed
    prazoRecebimento: 30, observacoes: '',
  });

  const caixa = readTestFile('caixa.json');
  const entry = caixa.entries.find(e => e.id === 'cxa_test001');
  assert.equal(entry.value, 25000);
});

test('PUT /api/notas-fiscais/:id — caixa entry date is ISO date string (YYYY-MM-DD)', async () => {
  seedEmittedNF({ dataEmissaoReal: '2026-12-31', prazoRecebimento: 1 });

  await put('/api/notas-fiscais/nf_test001', {
    numero: 'NF-001', contractId: 'ctr_test001',
    dataLimite: '2026-05-01', valor: 10000, prazoRecebimento: 1, observacoes: '',
  });

  const caixa = readTestFile('caixa.json');
  const entry = caixa.entries.find(e => e.id === 'cxa_test001');
  // 2026-12-31 + 1 day = 2027-01-01 (year rollover)
  assert.equal(entry.date, '2027-01-01');
});

test('PUT /api/notas-fiscais/:id — does not add dataEmissaoReal to non-emitted NF', async () => {
  seedNF({ emitida: false, dataEmissaoReal: null });

  const res = await put('/api/notas-fiscais/nf_test001', {
    numero: 'NF-001', contractId: 'ctr_test001',
    dataLimite: '2026-06-01', valor: 10000, prazoRecebimento: 30,
    dataEmissaoReal: '2026-05-01', // should be ignored — NF not emitted
    observacoes: '',
  });
  assert.equal(res.status, 200);

  // The field is written to the NF record (allowed), but no caixa sync happens
  const nfs = readTestFile('notas_fiscais.json');
  const nf = nfs.notas_fiscais.find(n => n.id === 'nf_test001');
  assert.equal(nf.emitida, false);
  // Caixa must remain empty (no caixaEntryId on non-emitted NF)
  const caixa = readTestFile('caixa.json');
  assert.equal(caixa.entries.length, 0);
});

test('PUT /api/notas-fiscais/:id — updatedAt is refreshed on every update', async () => {
  seedNF({ updatedAt: '2026-01-01T00:00:00.000Z' });

  await put('/api/notas-fiscais/nf_test001', {
    numero: 'NF-001', contractId: 'ctr_test001',
    dataLimite: '2026-06-01', valor: 10000, prazoRecebimento: 30, observacoes: '',
  });

  const nfs = readTestFile('notas_fiscais.json');
  const nf = nfs.notas_fiscais.find(n => n.id === 'nf_test001');
  assert.notEqual(nf.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.ok(new Date(nf.updatedAt) > new Date('2026-01-01'));
});
