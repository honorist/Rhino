'use strict';
/**
 * Handler de telemetria de uso (handlers/telemetria.js), com `repos`/`perms`
 * dublados — nada toca o Postgres. Achado 6.3 da varredura 2026-09-08.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const perms = require('../lib/permissions');
const h = require('../handlers/telemetria');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { telaVisitas: repos.telaVisitas, isSuperAdmin: perms.isSuperAdmin };
let incrementos, resumoFake, isSuperAdminValue;

beforeEach(() => {
  incrementos = [];
  resumoFake = [{ tela: '#/ssma', total: 10, ultimaVisita: '2026-09-08' }];
  isSuperAdminValue = true;
  repos.telaVisitas = {
    incrementar: async (tela, data) => { incrementos.push({ tela, data }); },
    resumoPorTela: async (dias) => resumoFake.map((r) => ({ ...r, dias })),
  };
  perms.isSuperAdmin = () => isSuperAdminValue;
});

function restore() {
  Object.assign(repos, { telaVisitas: orig.telaVisitas });
  Object.assign(perms, { isSuperAdmin: orig.isSuperAdmin });
}

// ---------------- registrarVisita ----------------

test('registrarVisita — sem usuário autenticado devolve 401, sem incrementar', async () => {
  const res = fakeRes();
  await h.handleRegistrarVisita({ user: null }, { tela: '#/ssma' }, res);
  assert.equal(res.status, 401);
  assert.equal(incrementos.length, 0);
  restore();
});

test('registrarVisita — sem tela no body devolve 400', async () => {
  const res = fakeRes();
  await h.handleRegistrarVisita({ user: { id: 'u1' } }, {}, res);
  assert.equal(res.status, 400);
  restore();
});

test('registrarVisita — sucesso incrementa a tela normalizada na data de hoje', async () => {
  const res = fakeRes();
  await h.handleRegistrarVisita({ user: { id: 'u1' } }, { tela: '#/ssma?x=1' }, res);
  assert.equal(res.status, 200);
  assert.equal(incrementos.length, 1);
  assert.equal(incrementos[0].tela, '#/ssma'); // querystring descartada — não é uma tela diferente
  assert.match(incrementos[0].data, /^\d{4}-\d{2}-\d{2}$/);
  restore();
});

test('registrarVisita — tela fora do formato esperado (não começa com #/) devolve 400', async () => {
  const res = fakeRes();
  await h.handleRegistrarVisita({ user: { id: 'u1' } }, { tela: 'javascript:alert(1)' }, res);
  assert.equal(res.status, 400);
  assert.equal(incrementos.length, 0);
  restore();
});

test('registrarVisita — falha ao gravar não derruba a resposta (telemetria nunca quebra a navegação)', async () => {
  repos.telaVisitas.incrementar = async () => { throw new Error('boom'); };
  const res = fakeRes();
  await h.handleRegistrarVisita({ user: { id: 'u1' } }, { tela: '#/ssma' }, res);
  assert.equal(res.status, 200);
  restore();
});

// ---------------- resumoVisitas ----------------

test('resumoVisitas — sem usuário autenticado devolve 401', async () => {
  const res = fakeRes();
  await h.handleResumoVisitas({ user: null, query: {} }, res);
  assert.equal(res.status, 401);
  restore();
});

test('resumoVisitas — não-admin devolve 403', async () => {
  isSuperAdminValue = false;
  const res = fakeRes();
  await h.handleResumoVisitas({ user: { id: 'u1' }, query: {} }, res);
  assert.equal(res.status, 403);
  restore();
});

test('resumoVisitas — admin recebe o resumo, default de 30 dias', async () => {
  const res = fakeRes();
  await h.handleResumoVisitas({ user: { id: 'admin1' }, query: {} }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.resumo[0].dias, 30);
  restore();
});

test('resumoVisitas — aceita ?dias= customizado', async () => {
  const res = fakeRes();
  await h.handleResumoVisitas({ user: { id: 'admin1' }, query: { dias: '7' } }, res);
  assert.equal(res.body.resumo[0].dias, 7);
  restore();
});
