'use strict';
/**
 * Handler CRUD de Subcontratados + sub-recurso de medições
 * (handlers/subcontratados.js) — sem cobertura de camada HTTP antes desta
 * mudança (já sinalizado como pendente em test/subcontratado.test.js:4-6).
 * `repos` dublado — nada toca o Postgres.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/subcontratados');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { subcontratados: repos.subcontratados, subcontratoMedicoes: repos.subcontratoMedicoes };
let subs, medicoes;

beforeEach(() => {
  subs = [];
  medicoes = [];
  repos.subcontratados = {
    findAll: async () => subs,
    findById: async (id) => subs.find((s) => s.id === id) || null,
    create: async (s) => { subs.push(s); return s; },
    updateById: async (id, patch) => {
      const s = subs.find((x) => x.id === id);
      if (!s) return null;
      Object.assign(s, patch);
      return s;
    },
    removeById: async (id) => { subs = subs.filter((s) => s.id !== id); return true; },
  };
  repos.subcontratoMedicoes = {
    findAll: async (filter) => {
      if (filter && filter.subcontratadoId) return medicoes.filter((m) => m.subcontratadoId === filter.subcontratadoId);
      return medicoes;
    },
    findById: async (id) => medicoes.find((m) => m.id === id) || null,
    create: async (m) => { medicoes.push(m); return m; },
    updateById: async (id, patch) => {
      const m = medicoes.find((x) => x.id === id);
      if (!m) return null;
      Object.assign(m, patch);
      return m;
    },
    removeById: async (id) => { medicoes = medicoes.filter((m) => m.id !== id); return true; },
  };
});

function restore() { Object.assign(repos, orig); }

// ---------------- Subcontratados (CRUD) ----------------

test('GET — lista vazia enriquecida com resumo zerado', async () => {
  const res = fakeRes();
  await h.handleListSubcontratados(res);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
  restore();
});

test('POST — sem nome devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostSubcontratado({}, res);
  assert.equal(res.status, 400);
  assert.equal(subs.length, 0);
  restore();
});

test('POST — cria subcontratado com resumo vazio', async () => {
  const res = fakeRes();
  await h.handlePostSubcontratado({ nome: 'Empreiteira X' }, res);
  assert.equal(res.status, 200);
  assert.equal(subs.length, 1);
  assert.equal(res.body.nome, 'Empreiteira X');
  assert.ok(res.body.resumo);
  restore();
});

test('PUT — subcontratado inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutSubcontratado('naoexiste', { nome: 'X' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT — nome vazio devolve 400, não apaga o nome existente', async () => {
  subs.push({ id: 's1', nome: 'Original' });
  const res = fakeRes();
  await h.handlePutSubcontratado('s1', { nome: '   ' }, res);
  assert.equal(res.status, 400);
  assert.equal(subs[0].nome, 'Original');
  restore();
});

test('PUT — atualiza campos presentes normalmente', async () => {
  subs.push({ id: 's1', nome: 'Original' });
  const res = fakeRes();
  await h.handlePutSubcontratado('s1', { nome: 'Novo Nome', especialidade: 'Elétrica' }, res);
  assert.equal(res.status, 200);
  assert.equal(subs[0].nome, 'Novo Nome');
  assert.equal(subs[0].especialidade, 'Elétrica');
  restore();
});

test('DELETE — subcontratado inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteSubcontratado('naoexiste', res);
  assert.equal(res.status, 404);
  restore();
});

test('DELETE — remove o subcontratado existente', async () => {
  subs.push({ id: 's1', nome: 'X' });
  const res = fakeRes();
  await h.handleDeleteSubcontratado('s1', res);
  assert.equal(res.status, 200);
  assert.equal(subs.length, 0);
  restore();
});

// ---------------- Medições (sub-recurso) ----------------

test('GET medições — subcontratado inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleListMedicoes('naoexiste', res);
  assert.equal(res.status, 404);
  restore();
});

test('POST medição — sem competência devolve 400', async () => {
  subs.push({ id: 's1', nome: 'X' });
  const res = fakeRes();
  await h.handlePostMedicao('s1', {}, res);
  assert.equal(res.status, 400);
  assert.equal(medicoes.length, 0);
  restore();
});

test('POST medição — cria e devolve envelope { medicoes, resumo }', async () => {
  subs.push({ id: 's1', nome: 'X' });
  const res = fakeRes();
  await h.handlePostMedicao('s1', { competencia: '2026-09', valor: 5000 }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.medicoes.length, 1);
  assert.equal(res.body.medicoes[0].valor, 5000);
  assert.ok(res.body.resumo);
  restore();
});

test('PUT medição — medição de outro subcontratado devolve 404 (checagem de posse)', async () => {
  subs.push({ id: 's1', nome: 'X' }, { id: 's2', nome: 'Y' });
  medicoes.push({ id: 'm1', subcontratadoId: 's2', competencia: '2026-08' });
  const res = fakeRes();
  await h.handlePutMedicao('s1', 'm1', { competencia: '2026-09' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT medição — atualiza campos presentes normalmente', async () => {
  subs.push({ id: 's1', nome: 'X' });
  medicoes.push({ id: 'm1', subcontratadoId: 's1', competencia: '2026-08', valor: 100 });
  const res = fakeRes();
  await h.handlePutMedicao('s1', 'm1', { valor: 200 }, res);
  assert.equal(res.status, 200);
  assert.equal(medicoes[0].valor, 200);
  restore();
});

test('DELETE medição — medição de outro subcontratado devolve 404', async () => {
  subs.push({ id: 's1', nome: 'X' }, { id: 's2', nome: 'Y' });
  medicoes.push({ id: 'm1', subcontratadoId: 's2', competencia: '2026-08' });
  const res = fakeRes();
  await h.handleDeleteMedicao('s1', 'm1', res);
  assert.equal(res.status, 404);
  assert.equal(medicoes.length, 1);
  restore();
});

test('DELETE medição — remove normalmente', async () => {
  subs.push({ id: 's1', nome: 'X' });
  medicoes.push({ id: 'm1', subcontratadoId: 's1', competencia: '2026-08' });
  const res = fakeRes();
  await h.handleDeleteMedicao('s1', 'm1', res);
  assert.equal(res.status, 200);
  assert.equal(medicoes.length, 0);
  restore();
});
