'use strict';
// node --test test/routes-parity.test.js  (sem servidor, sem DB)
//
// Rede de proteção da Fase 2 (desmembramento do server.js): garante que cada
// routes/*.js registra exatamente as rotas esperadas e despacha para o handler
// certo, com os argumentos certos. Cresce a cada domínio migrado.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRouter } = require('../lib/router');

// ─── routes/auth.js ──────────────────────────────────────────────────────────

test('routes/auth.js — registra exatamente as 6 rotas de /api/auth', () => {
  const router = createRouter();
  require('../routes/auth')(router, {});
  const rotas = router.list().map(r => `${r.method} ${r.pattern}`).sort();
  assert.deepEqual(rotas, [
    'GET /api/auth/me',
    'POST /api/auth/accept-terms',
    'POST /api/auth/forgot-password',
    'POST /api/auth/login',
    'POST /api/auth/logout',
    'POST /api/auth/reset-password',
  ]);
});

test('routes/auth.js — cada rota despacha para o handler certo, com os args certos', () => {
  const chamadas = {};
  const spy = (nome) => (...args) => { chamadas[nome] = args; };
  const router = createRouter();
  require('../routes/auth')(router, {
    handleLogin:          spy('login'),
    handleLogout:         spy('logout'),
    handleMe:             spy('me'),
    handleForgotPassword: spy('forgot'),
    handleResetPassword:  spy('reset'),
    handleAcceptTerms:    spy('accept'),
  });
  const ctx = (method, pathname) => ({ method, pathname, req: 'REQ', body: 'BODY', res: 'RES' });

  assert.equal(router.dispatch(ctx('POST', '/api/auth/login')), true);
  assert.deepEqual(chamadas.login, ['REQ', 'BODY', 'RES']);

  router.dispatch(ctx('POST', '/api/auth/logout'));
  assert.deepEqual(chamadas.logout, ['REQ', 'RES']);

  router.dispatch(ctx('GET', '/api/auth/me'));
  assert.deepEqual(chamadas.me, ['REQ', 'RES']);

  router.dispatch(ctx('POST', '/api/auth/forgot-password'));
  assert.deepEqual(chamadas.forgot, ['REQ', 'BODY', 'RES']);

  router.dispatch(ctx('POST', '/api/auth/reset-password'));
  assert.deepEqual(chamadas.reset, ['REQ', 'BODY', 'RES']);

  router.dispatch(ctx('POST', '/api/auth/accept-terms'));
  assert.deepEqual(chamadas.accept, ['REQ', 'RES']);
});
