'use strict';
/**
 * Orquestração HTTP de preferências de notificação (handlers/notificacoes.js)
 * e do filtro por preferência em listarNotificacoes (handlers/recrutamento.js),
 * com `db`/`repos` dublados — nada toca o Postgres. Regra pura (catálogo,
 * deveNotificar) já coberta em test/notificacoes.test.js.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const h = require('../handlers/notificacoes');
const recrut = require('../handlers/recrutamento');
const { TIPOS_CATALOGO } = require('../lib/notificacoes');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { users: repos.users, getMany: db.getMany };
let usersStore;
let capturedSql, capturedParams;

beforeEach(() => {
  usersStore = { u1: { id: 'u1', notifTiposDesativados: [] } };
  repos.users = {
    findById: async (id) => usersStore[id] || null,
    updateById: async (id, patch) => {
      const u = usersStore[id];
      Object.assign(u, patch);
      if (typeof patch.notifTiposDesativados === 'string') u.notifTiposDesativados = JSON.parse(patch.notifTiposDesativados);
      return u;
    },
  };
  db.getMany = async (sql, params) => { capturedSql = sql; capturedParams = params; return []; };
});

function restore() {
  Object.assign(repos, { users: orig.users });
  Object.assign(db, { getMany: orig.getMany });
}

// ---------------- GET preferências ----------------

test('GET — sem usuário autenticado devolve 401', async () => {
  const res = fakeRes();
  await h.handleGetPreferenciasNotificacao({ user: null }, res);
  assert.equal(res.status, 401);
  restore();
});

test('GET — devolve o catálogo completo + tiposDesativados do usuário', async () => {
  usersStore.u1.notifTiposDesativados = ['sugestao.nova'];
  const res = fakeRes();
  await h.handleGetPreferenciasNotificacao({ user: { id: 'u1' } }, res);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.catalogo, TIPOS_CATALOGO);
  assert.deepEqual(res.body.tiposDesativados, ['sugestao.nova']);
  restore();
});

test('GET — usuário sem preferências salvas devolve lista vazia (default: recebe tudo)', async () => {
  const res = fakeRes();
  await h.handleGetPreferenciasNotificacao({ user: { id: 'u1' } }, res);
  assert.deepEqual(res.body.tiposDesativados, []);
  restore();
});

// ---------------- PUT preferências ----------------

test('PUT — sem usuário autenticado devolve 401', async () => {
  const res = fakeRes();
  await h.handlePutPreferenciasNotificacao({ user: null }, { tiposDesativados: [] }, res);
  assert.equal(res.status, 401);
  restore();
});

test('PUT — grava os tipos desativados válidos', async () => {
  const res = fakeRes();
  await h.handlePutPreferenciasNotificacao({ user: { id: 'u1' } }, { tiposDesativados: ['sugestao.nova', 'punch.atribuido'] }, res);
  assert.equal(res.status, 200);
  assert.deepEqual(usersStore.u1.notifTiposDesativados, ['sugestao.nova', 'punch.atribuido']);
  restore();
});

test('PUT — ignora tipo desconhecido em vez de rejeitar a requisição inteira', async () => {
  const res = fakeRes();
  await h.handlePutPreferenciasNotificacao({ user: { id: 'u1' } }, { tiposDesativados: ['sugestao.nova', 'tipo-que-nao-existe'] }, res);
  assert.equal(res.status, 200);
  assert.deepEqual(usersStore.u1.notifTiposDesativados, ['sugestao.nova']);
  restore();
});

test('PUT — deduplica tipos repetidos', async () => {
  const res = fakeRes();
  await h.handlePutPreferenciasNotificacao({ user: { id: 'u1' } }, { tiposDesativados: ['sugestao.nova', 'sugestao.nova'] }, res);
  assert.deepEqual(usersStore.u1.notifTiposDesativados, ['sugestao.nova']);
  restore();
});

test('PUT — tiposDesativados ausente/não-array grava lista vazia sem erro', async () => {
  const res = fakeRes();
  await h.handlePutPreferenciasNotificacao({ user: { id: 'u1' } }, {}, res);
  assert.equal(res.status, 200);
  assert.deepEqual(usersStore.u1.notifTiposDesativados, []);
  restore();
});

// ---------------- listarNotificacoes respeita preferências ----------------

test('listarNotificacoes — sem usuário autenticado devolve 401', async () => {
  const res = fakeRes();
  await recrut.listarNotificacoes({ user: null }, res);
  assert.equal(res.status, 401);
  restore();
});

test('listarNotificacoes — passa os tipos desativados do usuário como exclusão na query', async () => {
  usersStore.u1.notifTiposDesativados = ['sugestao.nova', 'punch.atribuido'];
  const res = fakeRes();
  await recrut.listarNotificacoes({ user: { id: 'u1' } }, res);
  assert.equal(res.status, 200);
  assert.match(capturedSql, /NOT \(tipo = ANY\(\$2::text\[\]\)\)/);
  assert.deepEqual(capturedParams, ['u1', ['sugestao.nova', 'punch.atribuido']]);
  restore();
});

test('listarNotificacoes — usuário sem preferências passa array vazio (não exclui nada)', async () => {
  const res = fakeRes();
  await recrut.listarNotificacoes({ user: { id: 'u1' } }, res);
  assert.deepEqual(capturedParams, ['u1', []]);
  restore();
});
