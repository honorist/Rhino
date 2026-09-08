'use strict';
/**
 * Handler CRUD de Ferramentas + sub-recurso de calibrações
 * (handlers/ferramentas.js) — sem cobertura de camada HTTP antes desta
 * mudança (já sinalizado como pendente em test/subcontratado.test.js:4-6,
 * mesmo padrão SSMA-like desta ferramentaria). `repos` dublado — nada toca
 * o Postgres.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/ferramentas');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { ferramentas: repos.ferramentas, ferramentaCalibracoes: repos.ferramentaCalibracoes };
let ferramentas, calibracoes;

beforeEach(() => {
  ferramentas = [];
  calibracoes = [];
  repos.ferramentas = {
    findAll: async () => ferramentas,
    findById: async (id) => ferramentas.find((f) => f.id === id) || null,
    create: async (f) => { ferramentas.push(f); return f; },
    updateById: async (id, patch) => {
      const f = ferramentas.find((x) => x.id === id);
      if (!f) return null;
      Object.assign(f, patch);
      return f;
    },
    removeById: async (id) => { ferramentas = ferramentas.filter((f) => f.id !== id); return true; },
  };
  repos.ferramentaCalibracoes = {
    findAll: async (filter) => {
      if (filter && filter.ferramentaId) return calibracoes.filter((c) => c.ferramentaId === filter.ferramentaId);
      return calibracoes;
    },
    findById: async (id) => calibracoes.find((c) => c.id === id) || null,
    create: async (c) => { calibracoes.push(c); return c; },
    removeById: async (id) => { calibracoes = calibracoes.filter((c) => c.id !== id); return true; },
  };
});

function restore() { Object.assign(repos, orig); }

// ---------------- Ferramentas (CRUD) ----------------

test('GET — lista vazia com resumo do parque', async () => {
  const res = fakeRes();
  await h.handleListFerramentas(res);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.ferramentas, []);
  assert.ok(res.body.resumo);
  restore();
});

test('POST — sem nome devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostFerramenta({}, res);
  assert.equal(res.status, 400);
  assert.equal(ferramentas.length, 0);
  restore();
});

test('POST — cria ferramenta com periodicidade default de 12 meses quando inválida', async () => {
  const res = fakeRes();
  await h.handlePostFerramenta({ nome: 'Trena a laser', requerCalibracao: true }, res);
  assert.equal(res.status, 200);
  assert.equal(ferramentas.length, 1);
  assert.equal(res.body.ferramenta.periodicidadeMeses, 12);
  assert.equal(res.body.ferramenta.calibracoes.length, 0);
  restore();
});

test('POST — periodicidade válida é respeitada', async () => {
  const res = fakeRes();
  await h.handlePostFerramenta({ nome: 'Paquímetro', periodicidadeMeses: 6 }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.ferramenta.periodicidadeMeses, 6);
  restore();
});

test('PUT — ferramenta inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutFerramenta('naoexiste', { nome: 'X' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT — nome vazio devolve 400, não apaga o nome existente', async () => {
  ferramentas.push({ id: 'f1', nome: 'Original', periodicidadeMeses: 12 });
  const res = fakeRes();
  await h.handlePutFerramenta('f1', { nome: '  ' }, res);
  assert.equal(res.status, 400);
  assert.equal(ferramentas[0].nome, 'Original');
  restore();
});

test('PUT — atualiza campos presentes normalmente', async () => {
  ferramentas.push({ id: 'f1', nome: 'Original', periodicidadeMeses: 12 });
  const res = fakeRes();
  await h.handlePutFerramenta('f1', { nome: 'Novo Nome', localizacao: 'Almoxarifado' }, res);
  assert.equal(res.status, 200);
  assert.equal(ferramentas[0].nome, 'Novo Nome');
  assert.equal(ferramentas[0].localizacao, 'Almoxarifado');
  restore();
});

test('DELETE — ferramenta inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteFerramenta('naoexiste', res);
  assert.equal(res.status, 404);
  restore();
});

test('DELETE — remove a ferramenta existente', async () => {
  ferramentas.push({ id: 'f1', nome: 'X' });
  const res = fakeRes();
  await h.handleDeleteFerramenta('f1', res);
  assert.equal(res.status, 200);
  assert.equal(ferramentas.length, 0);
  restore();
});

// ---------------- Calibrações (sub-recurso) ----------------

test('GET calibrações — ferramenta inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleListCalibracoes('naoexiste', res);
  assert.equal(res.status, 404);
  restore();
});

test('POST calibração — ferramenta inexistente devolve 404, nada é criado', async () => {
  const res = fakeRes();
  await h.handlePostCalibracao('naoexiste', { resultado: 'aprovado' }, res);
  assert.equal(res.status, 404);
  assert.equal(calibracoes.length, 0);
  restore();
});

test('POST calibração — cria e devolve envelope { ferramenta, calibracoes } enriquecido', async () => {
  ferramentas.push({ id: 'f1', nome: 'Trena', requerCalibracao: true, periodicidadeMeses: 12 });
  const res = fakeRes();
  await h.handlePostCalibracao('f1', { data: '2026-01-10', validade: '2027-01-10', resultado: 'aprovado' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.calibracoes.length, 1);
  assert.equal(res.body.ferramenta.ultimaCalibracao.validade, '2027-01-10');
  restore();
});

test('DELETE calibração — calibração de outra ferramenta devolve 404 (checagem de posse)', async () => {
  ferramentas.push({ id: 'f1', nome: 'A' }, { id: 'f2', nome: 'B' });
  calibracoes.push({ id: 'c1', ferramentaId: 'f2', data: '2026-01-10' });
  const res = fakeRes();
  await h.handleDeleteCalibracao('f1', 'c1', res);
  assert.equal(res.status, 404);
  assert.equal(calibracoes.length, 1);
  restore();
});

test('DELETE calibração — remove normalmente', async () => {
  ferramentas.push({ id: 'f1', nome: 'A' });
  calibracoes.push({ id: 'c1', ferramentaId: 'f1', data: '2026-01-10' });
  const res = fakeRes();
  await h.handleDeleteCalibracao('f1', 'c1', res);
  assert.equal(res.status, 200);
  assert.equal(calibracoes.length, 0);
  restore();
});
