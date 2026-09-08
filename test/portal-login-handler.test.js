'use strict';
/**
 * Handler de login do Portal do Cliente (handlers/portal.js#handlePortalLogin)
 * — sem cobertura de camada HTTP antes desta mudança. `db`/`pgRateLimit`
 * dublados — nada toca o Postgres.
 *
 * Cobre também a consolidação de `bcrypt`/`bcryptjs` (item de dívida técnica
 * — duas libs pro mesmo propósito, agora só `bcrypt` nativo, igual
 * lib/auth.js). O formato do hash ($2a$/$2b$) é o mesmo entre as duas libs,
 * então um hash antigo gerado por `bcryptjs` continua validando normalmente
 * com `bcrypt.compare` — sem migração de dado.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const pgRateLimit = require('../lib/pg-rate-limit');
const bcrypt = require('bcrypt');
const bcryptjs = require('bcryptjs');
const h = require('../handlers/portal');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    headers: {},
    setHeader(k, v) { res.headers[k] = v; },
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { getOne: db.getOne, query: db.query, check: pgRateLimit.check, refund: pgRateLimit.refund };
let cliente, sessoesCriadas;

beforeEach(() => {
  sessoesCriadas = [];
  db.getOne = async () => cliente;
  db.query = async (sql, params) => { sessoesCriadas.push({ sql, params }); return { rows: [] }; };
  pgRateLimit.check = async () => ({ ok: true });
  pgRateLimit.refund = async () => {};
});

function restore() {
  Object.assign(db, { getOne: orig.getOne, query: orig.query });
  Object.assign(pgRateLimit, { check: orig.check, refund: orig.refund });
}

test('sem email/senha devolve 400', async () => {
  const res = fakeRes();
  await h.handlePortalLogin({ headers: {} }, {}, res);
  assert.equal(res.status, 400);
  restore();
});

test('rate limit estourado devolve 429 com Retry-After', async () => {
  pgRateLimit.check = async () => ({ ok: false, retryAfterSec: 120 });
  const res = fakeRes();
  await h.handlePortalLogin({ headers: {} }, { email: 'cliente@x.com', senha: 'senha123' }, res);
  assert.equal(res.status, 429);
  assert.equal(res.headers['Retry-After'], '120');
  restore();
});

test('email sem cadastro de portal devolve 401', async () => {
  cliente = null;
  const res = fakeRes();
  await h.handlePortalLogin({ headers: {} }, { email: 'naoexiste@x.com', senha: 'senha123' }, res);
  assert.equal(res.status, 401);
  restore();
});

test('senha incorreta devolve 401', async () => {
  cliente = { id: 'cli1', nome: 'X', empresa: 'Y', portalPasswordHash: await bcrypt.hash('senhaCerta', 10) };
  const res = fakeRes();
  await h.handlePortalLogin({ headers: {} }, { email: 'cliente@x.com', senha: 'senhaErrada' }, res);
  assert.equal(res.status, 401);
  restore();
});

test('senha correta (hash gerado com bcrypt nativo) autentica e cria a sessão', async () => {
  cliente = { id: 'cli1', nome: 'Cliente X', empresa: 'Acme', portalPasswordHash: await bcrypt.hash('senha123', 10) };
  const res = fakeRes();
  await h.handlePortalLogin({ headers: {} }, { email: 'cliente@x.com', senha: 'senha123' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.cliente.id, 'cli1');
  assert.equal(sessoesCriadas.length, 1);
  assert.ok(res.headers['Set-Cookie'].includes('rhino_portal='));
  restore();
});

test('senha correta contra um hash LEGADO gerado por bcryptjs também autentica (compat de formato, sem migração de dado)', async () => {
  cliente = { id: 'cli1', nome: 'Cliente X', empresa: 'Acme', portalPasswordHash: await bcryptjs.hash('senhaAntiga', 10) };
  const res = fakeRes();
  await h.handlePortalLogin({ headers: {} }, { email: 'cliente@x.com', senha: 'senhaAntiga' }, res);
  assert.equal(res.status, 200);
  restore();
});
