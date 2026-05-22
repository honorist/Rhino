'use strict';
// node --test test/routes-parity.test.js  (sem servidor, sem DB)
//
// Rede de proteção da Fase 2 (desmembramento do server.js): garante que cada
// routes/*.js registra exatamente as rotas esperadas e despacha para o handler
// certo, com os argumentos certos. Cresce a cada domínio migrado.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRouter } = require('../lib/router');

const tick = () => new Promise((r) => setImmediate(r));

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

// ─── routes/portal.js ────────────────────────────────────────────────────────

test('routes/portal.js — registra exatamente as 6 rotas de /api/portal', () => {
  const router = createRouter();
  require('../routes/portal')(router, {});
  const rotas = router.list().map(r => `${r.method} ${r.pattern}`).sort();
  assert.deepEqual(rotas, [
    'GET /api/portal/dashboard',
    'GET /api/portal/propostas',
    'GET /api/portal/propostas/:id/docx',
    'GET /api/portal/propostas/:id/pdf',
    'POST /api/portal/login',
    'POST /api/portal/logout',
  ]);
});

test('routes/portal.js — login NÃO passa por applyPortalAuth', () => {
  let authChamado = false, loginArgs = null;
  const router = createRouter();
  require('../routes/portal')(router, {
    applyPortalAuth: async () => { authChamado = true; return false; },
    handlePortalLogin: (req, body, res) => { loginArgs = [req, body, res]; },
  });
  router.dispatch({ method: 'POST', pathname: '/api/portal/login', req: 'R', body: 'B', res: 'S' });
  assert.equal(authChamado, false);
  assert.deepEqual(loginArgs, ['R', 'B', 'S']);
});

test('routes/portal.js — rota protegida roda applyPortalAuth ANTES do handler', async () => {
  const ordem = [];
  const router = createRouter();
  require('../routes/portal')(router, {
    applyPortalAuth: async () => { ordem.push('auth'); return false; },
    handlePortalDashboard: () => { ordem.push('dashboard'); },
  });
  router.dispatch({ method: 'GET', pathname: '/api/portal/dashboard', req: 'R', res: 'S' });
  await tick();
  assert.deepEqual(ordem, ['auth', 'dashboard']);
});

test('routes/portal.js — se applyPortalAuth já respondeu, o handler NÃO roda', async () => {
  let handlerChamado = false;
  const router = createRouter();
  require('../routes/portal')(router, {
    applyPortalAuth: async () => true, // já respondeu (ex.: 401)
    handlePortalDashboard: () => { handlerChamado = true; },
  });
  router.dispatch({ method: 'GET', pathname: '/api/portal/dashboard', req: 'R', res: 'S' });
  await tick();
  assert.equal(handlerChamado, false);
});

test('routes/portal.js — pdf e docx recebem (req, id, res)', async () => {
  const args = {};
  const router = createRouter();
  require('../routes/portal')(router, {
    applyPortalAuth: async () => false,
    handlePortalPropostaPdf:  (req, id, res) => { args.pdf = [req, id, res]; },
    handlePortalPropostaDocx: (req, id, res) => { args.docx = [req, id, res]; },
  });
  router.dispatch({ method: 'GET', pathname: '/api/portal/propostas/P1/pdf', req: 'R', res: 'S' });
  router.dispatch({ method: 'GET', pathname: '/api/portal/propostas/P2/docx', req: 'R', res: 'S' });
  await tick();
  assert.deepEqual(args.pdf, ['R', 'P1', 'S']);
  assert.deepEqual(args.docx, ['R', 'P2', 'S']);
});
