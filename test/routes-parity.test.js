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
  const rotas = router
    .list()
    .map((r) => `${r.method} ${r.pattern}`)
    .sort();
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
  const spy =
    (nome) =>
    (...args) => {
      chamadas[nome] = args;
    };
  const router = createRouter();
  require('../routes/auth')(router, {
    handleLogin: spy('login'),
    handleLogout: spy('logout'),
    handleMe: spy('me'),
    handleForgotPassword: spy('forgot'),
    handleResetPassword: spy('reset'),
    handleAcceptTerms: spy('accept'),
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

test('routes/portal.js — registra exatamente as 7 rotas de /api/portal', () => {
  const router = createRouter();
  require('../routes/portal')(router, {});
  const rotas = router
    .list()
    .map((r) => `${r.method} ${r.pattern}`)
    .sort();
  assert.deepEqual(rotas, [
    'GET /api/portal/dashboard',
    'GET /api/portal/propostas',
    'GET /api/portal/propostas/:id/docx',
    'GET /api/portal/propostas/:id/pdf',
    'GET /api/portal/rdos/:id/pdf', // PDF oficial do RDO no portal

    'POST /api/portal/login',
    'POST /api/portal/logout',
  ]);
});

test('routes/portal.js — login NÃO passa por applyPortalAuth', () => {
  let authChamado = false,
    loginArgs = null;
  const router = createRouter();
  require('../routes/portal')(router, {
    applyPortalAuth: async () => {
      authChamado = true;
      return false;
    },
    handlePortalLogin: (req, body, res) => {
      loginArgs = [req, body, res];
    },
  });
  router.dispatch({ method: 'POST', pathname: '/api/portal/login', req: 'R', body: 'B', res: 'S' });
  assert.equal(authChamado, false);
  assert.deepEqual(loginArgs, ['R', 'B', 'S']);
});

test('routes/portal.js — rota protegida roda applyPortalAuth ANTES do handler', async () => {
  const ordem = [];
  const router = createRouter();
  require('../routes/portal')(router, {
    applyPortalAuth: async () => {
      ordem.push('auth');
      return false;
    },
    handlePortalDashboard: () => {
      ordem.push('dashboard');
    },
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
    handlePortalDashboard: () => {
      handlerChamado = true;
    },
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
    handlePortalPropostaPdf: (req, id, res) => {
      args.pdf = [req, id, res];
    },
    handlePortalPropostaDocx: (req, id, res) => {
      args.docx = [req, id, res];
    },
  });
  router.dispatch({ method: 'GET', pathname: '/api/portal/propostas/P1/pdf', req: 'R', res: 'S' });
  router.dispatch({ method: 'GET', pathname: '/api/portal/propostas/P2/docx', req: 'R', res: 'S' });
  await tick();
  assert.deepEqual(args.pdf, ['R', 'P1', 'S']);
  assert.deepEqual(args.docx, ['R', 'P2', 'S']);
});

// ─── routes/platform.js ──────────────────────────────────────────────────────

test('routes/platform.js — registra exatamente as 29 rotas de plataforma', () => {
  const router = createRouter();
  require('../routes/platform')(router, {});
  const rotas = router
    .list()
    .map((r) => `${r.method} ${r.pattern}`)
    .sort();
  assert.deepEqual(
    rotas,
    [
      'DELETE /api/users/:id',
      'GET /api/admin/arquivos',
      'GET /api/ai-usage/stats',
      'GET /api/anomalias',
      'GET /api/audit',
      'GET /api/backup/download',
      'GET /api/changelog',
      'GET /api/dashboard',
      'GET /api/feature-flags',
      'GET /api/health',
      'GET /api/lgpd/export',
      'GET /api/metrics',
      'GET /api/niveis-acesso',
      'GET /api/online',
      'GET /api/push/vapid-public-key',
      'GET /api/search',
      'GET /api/stream',
      'GET /api/users',
      'POST /api/ai/chat',
      'POST /api/ai/classify-expense',
      'POST /api/backup',
      'POST /api/backup/email',
      'POST /api/lgpd/delete-account',
      'POST /api/push/subscribe',
      'POST /api/push/unsubscribe',
      'POST /api/users',
      'PUT /api/feature-flags/:id',
      'PUT /api/niveis-acesso/:id',
      'PUT /api/users/:id',
    ].sort()
  );
});

test('routes/platform.js — :param e ordens de argumentos não-triviais', () => {
  const c = {};
  const router = createRouter();
  require('../routes/platform')(router, {
    bus: { attach: () => {}, online: () => [] },
    sendJson: () => {},
    handlePutUser: (req, id, body, res) => {
      c.putUser = [req, id, body, res];
    },
    handleDeleteUser: (id, req, res) => {
      c.delUser = [id, req, res];
    },
    handleMetrics: (res, req) => {
      c.metrics = [res, req];
    },
    handleGetAudit: (req, query, res) => {
      c.audit = [req, query, res];
    },
    handlePutFeatureFlag: (id, body, res) => {
      c.ff = [id, body, res];
    },
    handlePutNivelAcesso: (id, body, res) => {
      c.nivel = [id, body, res];
    },
  });
  const base = { req: 'REQ', body: 'BODY', res: 'RES', parsedUrl: { query: 'QUERY' } };

  router.dispatch({ ...base, method: 'PUT', pathname: '/api/users/U7' });
  assert.deepEqual(c.putUser, ['REQ', 'U7', 'BODY', 'RES']);

  router.dispatch({ ...base, method: 'DELETE', pathname: '/api/users/U7' });
  assert.deepEqual(c.delUser, ['U7', 'REQ', 'RES']); // id vem primeiro

  router.dispatch({ ...base, method: 'GET', pathname: '/api/metrics' });
  assert.deepEqual(c.metrics, ['RES', 'REQ']); // res vem primeiro

  router.dispatch({ ...base, method: 'GET', pathname: '/api/audit' });
  assert.deepEqual(c.audit, ['REQ', 'QUERY', 'RES']); // req (p/ perms.can) + parsedUrl.query + res

  router.dispatch({ ...base, method: 'PUT', pathname: '/api/feature-flags/F1' });
  assert.deepEqual(c.ff, ['F1', 'BODY', 'RES']);

  router.dispatch({ ...base, method: 'PUT', pathname: '/api/niveis-acesso/N1' });
  assert.deepEqual(c.nivel, ['N1', 'BODY', 'RES']);
});

test('routes/platform.js — push/subscribe deriva o userId de req.user.id', () => {
  let args = null;
  const router = createRouter();
  require('../routes/platform')(router, {
    handlePushSubscribe: (body, userId, res) => {
      args = [body, userId, res];
    },
  });
  router.dispatch({
    method: 'POST',
    pathname: '/api/push/subscribe',
    body: 'BODY',
    res: 'RES',
    req: { user: { id: 'U9' } },
  });
  assert.deepEqual(args, ['BODY', 'U9', 'RES']);
});

test('routes/platform.js — rotas inline (stream/online) usam o bus', () => {
  const calls = [];
  let onlinePayload = null;
  const router = createRouter();
  require('../routes/platform')(router, {
    bus: {
      attach: (req, res, meta) => calls.push(['attach', req, res, meta]),
      online: () => ['user1'],
    },
    sendJson: (res, body) => {
      onlinePayload = body;
    },
  });
  router.dispatch({
    method: 'GET',
    pathname: '/api/stream',
    req: { user: { id: 'U1', email: 'e@x' } },
    res: 'RES',
  });
  assert.equal(calls[0][0], 'attach');
  assert.deepEqual(calls[0][3], { userId: 'U1', userEmail: 'e@x' });

  router.dispatch({ method: 'GET', pathname: '/api/online', res: 'RES' });
  assert.deepEqual(onlinePayload, { online: ['user1'] });
});

// ─── routes/financeiro.js (caixa, base, sócios, investimentos, contas a ──────
//     pagar, folha, notas fiscais, cobrança) ────────────────────────────────

test('routes/financeiro.js — registra exatamente as 45 rotas financeiras', () => {
  const router = createRouter();
  require('../routes/financeiro')(router, {});
  const rotas = router
    .list()
    .map((r) => `${r.method} ${r.pattern}`)
    .sort();
  const esperado = [
    // caixa / base / sócios / investimentos
    'DELETE /api/base/:id',
    'DELETE /api/caixa/:id',
    'DELETE /api/investimentos/:id',
    'DELETE /api/socios/:id',
    'GET /api/base',
    'GET /api/caixa',
    'GET /api/investimentos',
    'GET /api/socios',
    'POST /api/base',
    'POST /api/base/:id/allocate',
    'POST /api/caixa',
    'POST /api/investimentos',
    'POST /api/socios',
    'PUT /api/base/:id',
    'PUT /api/caixa/:id',
    'PUT /api/socios/:id',
    // tipos-base / contas-pagar / folha / notas-fiscais / cobrança / ofx
    'DELETE /api/contas-pagar/:id',
    'DELETE /api/folha-pagamento/:id/itens/:itemId',
    'DELETE /api/notas-fiscais/:id',
    'DELETE /api/tipos-base/:id',
    'GET /api/contas-pagar',
    'GET /api/cobranca-mensal/historico',
    'GET /api/cobranca-mensal/projecao-atual',
    'GET /api/folha-pagamento',
    'GET /api/notas-fiscais',
    'GET /api/tipos-base',
    'GET ' + /^\/api\/cobranca-mensal\/(\d{4})\/(\d{1,2})$/.toString(),
    'POST /api/caixa/importar-ofx',
    'POST /api/contas-pagar',
    'POST /api/contas-pagar/:id/estornar',
    'POST /api/contas-pagar/:id/pagar',
    'POST /api/contas-pagar/processar-recorrencias',
    'POST /api/folha-pagamento/:id/estornar',
    'POST /api/folha-pagamento/:id/itens',
    'POST /api/folha-pagamento/:id/pagar',
    'POST /api/folha-pagamento/gerar',
    'POST /api/folha-pagamento/limpar',
    'POST /api/notas-fiscais',
    'POST /api/notas-fiscais/:id/cancelar-emissao',
    'POST /api/notas-fiscais/:id/emitir',
    'POST /api/tipos-base',
    'PUT /api/contas-pagar/:id',
    'PUT /api/folha-pagamento/:id/itens/:itemId',
    'PUT /api/notas-fiscais/:id',
    'PUT /api/tipos-base/:id',
  ].sort();
  assert.deepEqual(rotas, esperado);
});

test('routes/financeiro.js — rotas com :param despacham com (id, ...) na ordem certa', () => {
  const c = {};
  const router = createRouter();
  require('../routes/financeiro')(router, {
    handleGetCaixa: (res) => {
      c.getCaixa = [res];
    },
    handlePutCaixa: (id, body, res) => {
      c.putCaixa = [id, body, res];
    },
    handleDeleteSocio: (id, res) => {
      c.delSocio = [id, res];
    },
    handleAllocateBase: (id, body, res) => {
      c.alloc = [id, body, res];
    },
    handleDeleteInvestimento: (id, res) => {
      c.delInv = [id, res];
    },
  });
  const base = { req: 'REQ', body: 'BODY', res: 'RES' };

  router.dispatch({ ...base, method: 'GET', pathname: '/api/caixa' });
  assert.deepEqual(c.getCaixa, ['RES']);

  router.dispatch({ ...base, method: 'PUT', pathname: '/api/caixa/C1' });
  assert.deepEqual(c.putCaixa, ['C1', 'BODY', 'RES']);

  router.dispatch({ ...base, method: 'DELETE', pathname: '/api/socios/S2' });
  assert.deepEqual(c.delSocio, ['S2', 'RES']);

  router.dispatch({ ...base, method: 'POST', pathname: '/api/base/B3/allocate' });
  assert.deepEqual(c.alloc, ['B3', 'BODY', 'RES']);

  router.dispatch({ ...base, method: 'DELETE', pathname: '/api/investimentos/I4' });
  assert.deepEqual(c.delInv, ['I4', 'RES']);
});

test('routes/financeiro.js — withIdempotency embrulha o POST de contas-pagar', () => {
  const calls = [];
  const router = createRouter();
  require('../routes/financeiro')(router, {
    withIdempotency: (req, res, pathname, body, fn) => {
      calls.push(['wrap', req, res, pathname, body]);
      return fn();
    },
    handlePostContaPagar: (body, res) => {
      calls.push(['handler', body, res]);
    },
  });
  router.dispatch({
    method: 'POST',
    pathname: '/api/contas-pagar',
    req: 'REQ',
    res: 'RES',
    body: 'BODY',
  });
  assert.deepEqual(calls[0], ['wrap', 'REQ', 'RES', '/api/contas-pagar', 'BODY']);
  assert.deepEqual(calls[1], ['handler', 'BODY', 'RES']);
});

test('routes/financeiro.js — cobrança-mensal/:ano/:mes só casa ano/mês e converte p/ inteiro', () => {
  let args = null;
  const router = createRouter();
  require('../routes/financeiro')(router, {
    handleCobrancaMensal: (req, ano, mes, res) => {
      args = [req, ano, mes, res];
    },
  });
  assert.equal(
    router.dispatch({
      method: 'GET',
      pathname: '/api/cobranca-mensal/2026/5',
      req: 'REQ',
      res: 'RES',
    }),
    true
  );
  assert.deepEqual(args, ['REQ', 2026, 5, 'RES']);
  // fora do formato \d{4}/\d{1,2} não casa
  assert.equal(
    router.dispatch({
      method: 'GET',
      pathname: '/api/cobranca-mensal/abc/xyz',
      req: 'R',
      res: 'S',
    }),
    false
  );
});

test('routes/financeiro.js — sub-recurso aninhado folha/:id/itens/:itemId', () => {
  let args = null;
  const router = createRouter();
  require('../routes/financeiro')(router, {
    handleRemoveFolhaItem: (id, itemId, res) => {
      args = [id, itemId, res];
    },
  });
  router.dispatch({ method: 'DELETE', pathname: '/api/folha-pagamento/F1/itens/I2', res: 'RES' });
  assert.deepEqual(args, ['F1', 'I2', 'RES']);
});

// ─── routes/comercial.js (clientes, fornecedores, cláusulas, propostas, ──────
//     apresentação, case-logos) ─────────────────────────────────────────────

test('routes/comercial.js — registra exatamente as 43 rotas comerciais', () => {
  const router = createRouter();
  require('../routes/comercial')(router, {});
  const rotas = router
    .list()
    .map((r) => `${r.method} ${r.pattern}`)
    .sort();
  assert.deepEqual(
    rotas,
    [
      'GET /api/composicoes',
      'POST /api/composicoes',
      'PUT /api/composicoes/:id',
      'DELETE /api/composicoes/:id',
      'DELETE /api/case-logos/:id',
      'DELETE /api/clausulas/:id',
      'DELETE /api/clientes/:id',
      'DELETE /api/fornecedores/:id',
      'DELETE /api/propostas/:id',
      'DELETE /api/propostas/:id/anexos/:anexoId',
      'DELETE /api/propostas/:id/custos/:custoId',
      'GET /api/app-settings/proposta_apresentacao',
      'GET /api/case-logos',
      'GET /api/case-logos/:id/image',
      'GET /api/clausulas',
      'GET /api/clientes',
      'GET /api/fornecedores',
      'GET /api/propostas',
      'GET /api/propostas/:id',
      'GET /api/propostas/:id/anexos/:anexoId',
      'GET /api/propostas/:id/docx',
      'GET /api/propostas/:id/pdf',
      'GET /api/propostas/:id/preview',
      'PATCH /api/propostas/:id',
      'POST /api/clausulas',
      'POST /api/clientes',
      'POST /api/clientes/:id/portal-impersonate', // "Ver portal como cliente" (super admin)
      'POST /api/fornecedores',
      'POST /api/propostas',
      'POST /api/propostas/:id/aceitar',
      'POST /api/propostas/:id/anexos',
      'POST /api/propostas/:id/custos',
      'POST /api/propostas/:id/duplicar',
      'POST /api/propostas/:id/enviar',
      'POST /api/propostas/:id/rejeitar',
      'PUT /api/app-settings/proposta_apresentacao',
      'PUT /api/case-logos/:id',
      'PUT /api/clausulas/:id',
      'PUT /api/clientes/:id',
      'PUT /api/fornecedores/:id',
      'PUT /api/propostas/:id',
      'PUT /api/propostas/:id/anexos/:anexoId',
      'PUT /api/propostas/:id/custos/:custoId',
    ].sort()
  );
});

test('routes/comercial.js — cláusulas GET recebe (res, query); rotas :param ok', () => {
  const c = {};
  const router = createRouter();
  require('../routes/comercial')(router, {
    handleGetClausulas: (res, query) => {
      c.getClaus = [res, query];
    },
    handlePutCliente: (id, body, res) => {
      c.putCli = [id, body, res];
    },
    handleDeleteFornecedor: (id, res) => {
      c.delForn = [id, res];
    },
  });
  router.dispatch({
    method: 'GET',
    pathname: '/api/clausulas',
    res: 'RES',
    parsedUrl: { query: 'Q' },
  });
  assert.deepEqual(c.getClaus, ['RES', 'Q']); // res antes de query

  router.dispatch({ method: 'PUT', pathname: '/api/clientes/CL1', body: 'BODY', res: 'RES' });
  assert.deepEqual(c.putCli, ['CL1', 'BODY', 'RES']);

  router.dispatch({ method: 'DELETE', pathname: '/api/fornecedores/F1', res: 'RES' });
  assert.deepEqual(c.delForn, ['F1', 'RES']);
});

test('routes/comercial.js — proposta PATCH reusa o handler de PUT', () => {
  const calls = [];
  const router = createRouter();
  require('../routes/comercial')(router, {
    handlePutProposta: (id, body, res) => {
      calls.push([id, body, res]);
    },
  });
  router.dispatch({ method: 'PUT', pathname: '/api/propostas/P1', body: 'B', res: 'R' });
  router.dispatch({ method: 'PATCH', pathname: '/api/propostas/P1', body: 'B2', res: 'R2' });
  assert.deepEqual(calls, [
    ['P1', 'B', 'R'],
    ['P1', 'B2', 'R2'],
  ]);
});

test('routes/comercial.js — proposta: sub-recursos aninhados e upload multipart', () => {
  const c = {};
  const router = createRouter();
  require('../routes/comercial')(router, {
    handlePutPropostaCusto: (id, cid, body, res) => {
      c.putCusto = [id, cid, body, res];
    },
    handleDeletePropostaAnexo: (id, aid, res) => {
      c.delAnexo = [id, aid, res];
    },
    handleUploadPropostaAnexo: (id, req, res) => {
      c.upAnexo = [id, req, res];
    },
    handleGetPropostaPreview: (id, res) => {
      c.preview = [id, res];
    },
  });
  router.dispatch({ method: 'PUT', pathname: '/api/propostas/P1/custos/C2', body: 'B', res: 'R' });
  assert.deepEqual(c.putCusto, ['P1', 'C2', 'B', 'R']);

  router.dispatch({ method: 'DELETE', pathname: '/api/propostas/P1/anexos/A3', res: 'R' });
  assert.deepEqual(c.delAnexo, ['P1', 'A3', 'R']);

  router.dispatch({ method: 'POST', pathname: '/api/propostas/P1/anexos', req: 'REQ', res: 'R' });
  assert.deepEqual(c.upAnexo, ['P1', 'REQ', 'R']); // multipart recebe req cru

  router.dispatch({ method: 'GET', pathname: '/api/propostas/P9/preview', res: 'R' });
  assert.deepEqual(c.preview, ['P9', 'R']);
});

test('routes/comercial.js — proposta/:id não engole as sub-rotas (docx etc.)', () => {
  let getProp = null,
    getDocx = null;
  const router = createRouter();
  require('../routes/comercial')(router, {
    handleGetProposta: (id) => {
      getProp = id;
    },
    handleGetPropostaDocx: (id) => {
      getDocx = id;
    },
  });
  router.dispatch({ method: 'GET', pathname: '/api/propostas/P1', res: 'R' });
  router.dispatch({ method: 'GET', pathname: '/api/propostas/P1/docx', res: 'R' });
  assert.equal(getProp, 'P1');
  assert.equal(getDocx, 'P1');
});

// ─── routes/operacao.js (recursos, documentos, estoque, solicitações, ────────
//     manutenções, frota, dashboard-layouts, doc-templates) ──────────────────

test('routes/operacao.js — registra exatamente as 125 rotas de operação', () => {
  const router = createRouter();
  require('../routes/operacao')(router, {});
  const rotas = router
    .list()
    .map((r) => `${r.method} ${r.pattern}`)
    .sort();
  assert.deepEqual(
    rotas,
    [
      'GET /api/recursos/:id/treinamentos',
      'POST /api/recursos/:id/treinamentos',
      'PUT /api/recursos/:id/treinamentos/:trId',
      'DELETE /api/recursos/:id/treinamentos/:trId',
      'GET /api/recursos/:id/epis',
      'POST /api/recursos/:id/epis',
      'PUT /api/recursos/:id/epis/:epiId',
      'DELETE /api/recursos/:id/epis/:epiId',
      'GET /api/recursos/:id/ponto',
      'POST /api/recursos/:id/ponto',
      'PUT /api/recursos/:id/ponto/:pontoId',
      'DELETE /api/recursos/:id/ponto/:pontoId',
      'DELETE /api/dashboard/layouts/:id',
      'DELETE /api/doc-templates/:id',
      'DELETE /api/estoque/almoxarifados/:id',
      'DELETE /api/estoque/itens/:id',
      'DELETE /api/estoque/movimentacoes/:id',
      'DELETE /api/manutencoes/:id',
      'DELETE /api/manutencoes/:id/fotos/:fotoId',
      'DELETE /api/recursos/:id',
      'DELETE /api/recursos/:id/documentos/:docId',
      'DELETE /api/recursos/:id/documentos/:docId/arquivo',
      'DELETE /api/recursos/:id/folgas/:folgaId',
      'DELETE /api/solicitacoes-compra/:id',
      'DELETE /api/veiculos/:id',
      'DELETE /api/veiculos/:id/abastecimentos/:abastecId',
      'DELETE /api/veiculos/:id/manutencoes/:manutId',
      'DELETE /api/veiculos/:id/planos/:planoId',
      'GET /api/cotacoes-historico',
      'GET /api/dashboard/cobranca',
      'GET /api/dashboard/layouts',
      'GET /api/dashboard/operacional',
      'GET /api/doc-templates',
      'GET /api/documentos/status',
      'GET /api/estoque/almoxarifados',
      'GET /api/estoque/itens',
      'GET /api/estoque/movimentacoes',
      'GET /api/estoque/saldo',
      'GET /api/estoque/visao-geral',
      'GET /api/manutencoes',
      'GET /api/recursos',
      'GET /api/recursos/:id/documentos/:docId/arquivo',
      'GET /api/solicitacoes-compra',
      'GET /api/veiculos',
      'GET /api/veiculos/:id/abastecimentos',
      'POST /api/dashboard/layouts',
      'POST /api/doc-templates',
      'POST /api/estoque/almoxarifados',
      'POST /api/estoque/itens',
      'POST /api/estoque/movimentacoes',
      'POST /api/manutencoes',
      'POST /api/manutencoes/:id/aprovar',
      'POST /api/manutencoes/:id/avaliar',
      'POST /api/manutencoes/:id/cancelar',
      'POST /api/manutencoes/:id/rejeitar',
      'POST /api/manutencoes/:id/retorno',
      'POST /api/recursos',
      'POST /api/recursos/:id/documentos',
      'POST /api/recursos/:id/documentos/:docId/arquivo',
      'POST /api/recursos/:id/documentos/:docId/validar',
      'POST /api/recursos/:id/folgas',
      'POST /api/recursos/:id/folgas/:folgaId/passagem',
      'POST /api/solicitacoes-compra',
      'POST /api/solicitacoes-compra/:id/aprovar',
      'POST /api/solicitacoes-compra/:id/avaliar',
      'POST /api/solicitacoes-compra/:id/cancelar',
      'POST /api/solicitacoes-compra/:id/comprar',
      'POST /api/solicitacoes-compra/:id/receber',
      'POST /api/solicitacoes-compra/:id/rejeitar',
      'POST /api/veiculos',
      'POST /api/veiculos/:id/abastecimentos',
      'POST /api/veiculos/:id/manutencoes',
      'POST /api/veiculos/:id/planos',
      'PUT /api/dashboard/layouts/:id',
      'PUT /api/doc-templates/:id',
      'PUT /api/estoque/almoxarifados/:id',
      'PUT /api/estoque/itens/:id',
      'PUT /api/manutencoes/:id',
      'PUT /api/recursos/:id',
      'PUT /api/recursos/:id/documentos/:docId',
      'PUT /api/solicitacoes-compra/:id',
      'PUT /api/veiculos/:id',
      'PUT /api/veiculos/:id/abastecimentos/:abastecId',
      'PUT /api/veiculos/:id/km',
      'PUT /api/veiculos/:id/localizacao',
      'PUT /api/veiculos/:id/manutencoes/:manutId',
      'PUT /api/veiculos/:id/planos/:planoId',
      // Mapa de cotações + pedido de compra (item 13)
      'GET /api/cotacoes',
      'POST /api/cotacoes',
      'GET /api/cotacoes/:id',
      'PUT /api/cotacoes/:id',
      'DELETE /api/cotacoes/:id',
      'POST /api/cotacoes/:id/itens',
      'PUT /api/cotacoes/:id/itens/:itemId',
      'DELETE /api/cotacoes/:id/itens/:itemId',
      'PUT /api/cotacoes/:id/precos',
      'DELETE /api/cotacoes/:id/precos/:precoId',
      'POST /api/cotacoes/:id/gerar-ordem',
      'GET /api/ordens-compra',
      'GET /api/ordens-compra/:id',
      'PUT /api/ordens-compra/:id',
      'DELETE /api/ordens-compra/:id',
      // Subcontratados + medições (item 14)
      'GET /api/subcontratados',
      'POST /api/subcontratados',
      'PUT /api/subcontratados/:id',
      'DELETE /api/subcontratados/:id',
      'GET /api/subcontratados/:id/medicoes',
      'POST /api/subcontratados/:id/medicoes',
      'PUT /api/subcontratados/:id/medicoes/:medId',
      'DELETE /api/subcontratados/:id/medicoes/:medId',
      // Ferramentaria + calibração (item 15)
      'GET /api/ferramentas',
      'POST /api/ferramentas',
      'PUT /api/ferramentas/:id',
      'DELETE /api/ferramentas/:id',
      'GET /api/ferramentas/:id/calibracoes',
      'POST /api/ferramentas/:id/calibracoes',
      'DELETE /api/ferramentas/:id/calibracoes/:calId',
      // Equipamentos próprios/locados (item 16)
      'GET /api/equipamentos',
      'POST /api/equipamentos',
      'PUT /api/equipamentos/:id',
      'DELETE /api/equipamentos/:id',
      'GET /api/equipamentos/:id/locacoes',
      'POST /api/equipamentos/:id/locacoes',
      'PUT /api/equipamentos/:id/locacoes/:locId',
      'DELETE /api/equipamentos/:id/locacoes/:locId',
    ].sort()
  );
});

test('routes/operacao.js — req injetado, sub-recursos aninhados e :param', () => {
  const c = {};
  const router = createRouter();
  require('../routes/operacao')(router, {
    handlePostManutencao: (req, body, res) => {
      c.postManut = [req, body, res];
    },
    handleAvaliarSolicitacao: (req, id, body, res) => {
      c.avalSol = [req, id, body, res];
    },
    handlePutItemEstoque: (id, body, res) => {
      c.putItem = [id, body, res];
    },
    handlePutVeiculoPlano: (id, planoId, body, res) => {
      c.putPlano = [id, planoId, body, res];
    },
    handleDeleteFolga: (id, folgaId, res) => {
      c.delFolga = [id, folgaId, res];
    },
    handleDeleteManutencaoFoto: (id, fotoId, res) => {
      c.delManutFoto = [id, fotoId, res];
    },
  });
  router.dispatch({
    method: 'POST',
    pathname: '/api/manutencoes',
    req: 'REQ',
    body: 'B',
    res: 'R',
  });
  assert.deepEqual(c.postManut, ['REQ', 'B', 'R']); // req cru no 1º arg

  router.dispatch({ method: 'DELETE', pathname: '/api/manutencoes/M1/fotos/F2', res: 'R' });
  assert.deepEqual(c.delManutFoto, ['M1', 'F2', 'R']);

  router.dispatch({
    method: 'POST',
    pathname: '/api/solicitacoes-compra/S1/avaliar',
    req: 'REQ',
    body: 'B',
    res: 'R',
  });
  assert.deepEqual(c.avalSol, ['REQ', 'S1', 'B', 'R']);

  router.dispatch({ method: 'PUT', pathname: '/api/estoque/itens/IT9', body: 'B', res: 'R' });
  assert.deepEqual(c.putItem, ['IT9', 'B', 'R']);

  router.dispatch({ method: 'PUT', pathname: '/api/veiculos/V1/planos/P2', body: 'B', res: 'R' });
  assert.deepEqual(c.putPlano, ['V1', 'P2', 'B', 'R']);

  router.dispatch({ method: 'DELETE', pathname: '/api/recursos/R1/folgas/F2', res: 'R' });
  assert.deepEqual(c.delFolga, ['R1', 'F2', 'R']);
});

// ─── routes/contracts.js (contratos, saídas, RDO, aditivos, marcos…) ─────────

test('routes/contracts.js — registra exatamente as 61 rotas de contratos', () => {
  const router = createRouter();
  require('../routes/contracts')(router, {});
  const rotas = router
    .list()
    .map((r) => `${r.method} ${r.pattern}`)
    .sort();
  assert.deepEqual(
    rotas,
    [
      'DELETE /api/contracts/:id',
      'DELETE /api/contracts/:id/aditivos/:aditivoId',
      'DELETE /api/contracts/:id/atividades/:atvId',
      'DELETE /api/contracts/:id/budget/:budgetId',
      'DELETE /api/contracts/:id/marcos/:marcoId',
      'DELETE /api/contracts/:id/ocorrencias/:ocorrId',
      'DELETE /api/contracts/:id/organograma/:membroId',
      'DELETE /api/contracts/:id/rdos/:rdoId',
      'DELETE /api/contracts/:id/rdos/:rdoId/assinaturas/:assId',
      'DELETE /api/contracts/:id/rdos/:rdoId/fotos/:fotoId',
      'DELETE /api/contracts/:id/servicos/:servicoId',
      'DELETE /api/saidas/:id',
      'GET /api/contracts',
      'GET /api/contracts/:id/atividades',
      'GET /api/contracts/:id/curva-s',
      'GET /api/contracts/:id/dre',
      'GET /api/contracts/:id/evm',
      'GET /api/contracts/:id/data-book',
      'GET /api/contracts/:id/ssma',
      'POST /api/contracts/:id/ssma',
      'PUT /api/contracts/:id/ssma/:ocorrId',
      'DELETE /api/contracts/:id/ssma/:ocorrId',
      'GET /api/contracts/:id/produtividade-hh',
      'GET /api/contracts/:id/punch',
      'POST /api/contracts/:id/punch',
      'PUT /api/contracts/:id/punch/:itemId',
      'DELETE /api/contracts/:id/punch/:itemId',
      'POST /api/contracts/:id/punch/:itemId/fotos',
      'DELETE /api/contracts/:id/punch/:itemId/fotos/:fotoId',
      'GET /api/contracts/:id/rdos/:rdoId/apontamentos',
      'PUT /api/contracts/:id/rdos/:rdoId/apontamentos',
      'GET /api/contracts/:id/medicoes',
      'GET /api/contracts/:id/servicos',
      'GET /api/contracts/:id/rdos/:rdoId/assinaturas',
      'GET /api/contracts/:id/rdos/:rdoId/assinaturas/:assId',
      'GET /api/contracts/:id/rdos/:rdoId/pdf',
      'GET /api/rdos',
      'PATCH /api/contracts/:id',
      'POST /api/contracts',
      'POST /api/contracts/:id/aditivos',
      'POST /api/contracts/:id/atividades',
      'POST /api/contracts/:id/bms/:nfId/aprovacao',
      'POST /api/contracts/:id/budget',
      'POST /api/contracts/:id/marcos',
      'POST /api/contracts/:id/medicoes',
      'POST /api/contracts/:id/ocorrencias',
      'POST /api/contracts/:id/organograma',
      'POST /api/contracts/:id/rdos',
      'POST /api/contracts/:id/rdos/:rdoId/fotos',
      'POST /api/contracts/:id/saidas',
      'POST /api/contracts/:id/servicos',
      'PUT /api/contracts/:id',
      'PUT /api/contracts/:id/aditivos/:aditivoId',
      'PUT /api/contracts/:id/atividades/:atvId',
      'PUT /api/contracts/:id/budget/:budgetId',
      'PUT /api/contracts/:id/marcos/:marcoId',
      'PUT /api/contracts/:id/ocorrencias/:ocorrId',
      'PUT /api/contracts/:id/organograma/:membroId',
      'PUT /api/contracts/:id/rdos/:rdoId',
      'PUT /api/contracts/:id/servicos/:servicoId',
      'PUT /api/saidas/:id',
    ].sort()
  );
});

test('routes/contracts.js — organograma DELETE (5 args), assinaturas, fotos, saídas', () => {
  const c = {};
  const router = createRouter();
  require('../routes/contracts')(router, {
    handleDeleteMembroOrganograma: (cid, mid, body, res, query) => {
      c.delOrg = [cid, mid, body, res, query];
    },
    handleListRdoAssinaturas: (rdoId, res) => {
      c.listAss = [rdoId, res];
    },
    handleGetRdoAssinatura: (rdoId, assId, res) => {
      c.getAss = [rdoId, assId, res];
    },
    handlePostRdoFoto: (cid, rid, req, res) => {
      c.postFoto = [cid, rid, req, res];
    },
    handlePutSaida: (id, body, res) => {
      c.putSaida = [id, body, res];
    },
  });
  router.dispatch({
    method: 'DELETE',
    pathname: '/api/contracts/C1/organograma/M2',
    body: 'B',
    res: 'R',
    parsedUrl: { query: 'Q' },
  });
  assert.deepEqual(c.delOrg, ['C1', 'M2', 'B', 'R', 'Q']); // 5 args, inclui query

  router.dispatch({ method: 'GET', pathname: '/api/contracts/C1/rdos/RD2/assinaturas', res: 'R' });
  assert.deepEqual(c.listAss, ['RD2', 'R']); // recebe rdoId (params[1]), não o contractId

  router.dispatch({
    method: 'GET',
    pathname: '/api/contracts/C1/rdos/RD2/assinaturas/AS3',
    res: 'R',
  });
  assert.deepEqual(c.getAss, ['RD2', 'AS3', 'R']);

  router.dispatch({
    method: 'POST',
    pathname: '/api/contracts/C1/rdos/RD2/fotos',
    req: 'REQ',
    res: 'R',
  });
  assert.deepEqual(c.postFoto, ['C1', 'RD2', 'REQ', 'R']); // multipart recebe req cru

  router.dispatch({ method: 'PUT', pathname: '/api/saidas/S9', body: 'B', res: 'R' });
  assert.deepEqual(c.putSaida, ['S9', 'B', 'R']);
});

test('routes/contracts.js — BM estruturado: serviços, medições e aprovação de BM', () => {
  const c = {};
  const router = createRouter();
  require('../routes/contracts')(router, {
    handleListContractServicos: (cid, res) => {
      c.listSrv = [cid, res];
    },
    handlePutContractServico: (cid, sid, body, res) => {
      c.putSrv = [cid, sid, body, res];
    },
    handleDeleteContractServico: (cid, sid, res) => {
      c.delSrv = [cid, sid, res];
    },
    handlePostContractMedicao: (cid, body, res) => {
      c.postMed = [cid, body, res];
    },
    handlePostBmAprovacao: (cid, nfId, body, user, res) => {
      c.aprovBm = [cid, nfId, body, user, res];
    },
  });

  router.dispatch({ method: 'GET', pathname: '/api/contracts/C1/servicos', res: 'R' });
  assert.deepEqual(c.listSrv, ['C1', 'R']);

  router.dispatch({
    method: 'PUT',
    pathname: '/api/contracts/C1/servicos/SRV2',
    body: 'B',
    res: 'R',
  });
  assert.deepEqual(c.putSrv, ['C1', 'SRV2', 'B', 'R']);

  router.dispatch({ method: 'DELETE', pathname: '/api/contracts/C1/servicos/SRV2', res: 'R' });
  assert.deepEqual(c.delSrv, ['C1', 'SRV2', 'R']);

  router.dispatch({ method: 'POST', pathname: '/api/contracts/C1/medicoes', body: 'B', res: 'R' });
  assert.deepEqual(c.postMed, ['C1', 'B', 'R']);

  // Aprovação recebe o usuário da sessão (autoria do aceite) — 5 args.
  router.dispatch({
    method: 'POST',
    pathname: '/api/contracts/C1/bms/NF7/aprovacao',
    body: 'B',
    req: { user: 'U' },
    res: 'R',
  });
  assert.deepEqual(c.aprovBm, ['C1', 'NF7', 'B', 'U', 'R']);

  // Sem req no ctx (dispatch parcial) não pode estourar TypeError.
  router.dispatch({
    method: 'POST',
    pathname: '/api/contracts/C2/bms/NF8/aprovacao',
    body: 'B',
    res: 'R',
  });
  assert.deepEqual(c.aprovBm, ['C2', 'NF8', 'B', undefined, 'R']);
});

test('routes/contracts.js — DRE por obra despacha (id, res)', () => {
  const c = {};
  const router = createRouter();
  require('../routes/contracts')(router, {
    handleGetContractDre: (cid, res) => {
      c.dre = [cid, res];
    },
  });
  router.dispatch({ method: 'GET', pathname: '/api/contracts/C1/dre', res: 'R' });
  assert.deepEqual(c.dre, ['C1', 'R']);
});

test('routes/contracts.js — apontamento de HH e produtividade despacham certo', () => {
  const c = {};
  const router = createRouter();
  require('../routes/contracts')(router, {
    handleListRdoApontamentos: (cid, rid, res) => {
      c.list = [cid, rid, res];
    },
    handlePutRdoApontamentos: (cid, rid, body, res) => {
      c.put = [cid, rid, body, res];
    },
    handleGetContractProdutividade: (cid, res) => {
      c.prod = [cid, res];
    },
  });
  router.dispatch({ method: 'GET', pathname: '/api/contracts/C1/rdos/R7/apontamentos', res: 'R' });
  assert.deepEqual(c.list, ['C1', 'R7', 'R']);
  router.dispatch({ method: 'PUT', pathname: '/api/contracts/C1/rdos/R7/apontamentos', body: 'B', res: 'R' });
  assert.deepEqual(c.put, ['C1', 'R7', 'B', 'R']);
  router.dispatch({ method: 'GET', pathname: '/api/contracts/C1/produtividade-hh', res: 'R' });
  assert.deepEqual(c.prod, ['C1', 'R']);
});

test('routes/contracts.js — punch list despacha (id, itemId, fotoId, ...)', () => {
  const c = {};
  const router = createRouter();
  require('../routes/contracts')(router, {
    handleListPunch: (cid, res) => { c.list = [cid, res]; },
    handlePostPunch: (cid, body, res) => { c.post = [cid, body, res]; },
    handlePutPunch: (cid, iid, body, res) => { c.put = [cid, iid, body, res]; },
    handleDeletePunch: (cid, iid, res) => { c.del = [cid, iid, res]; },
    handleDeletePunchFoto: (cid, iid, fid, res) => { c.delFoto = [cid, iid, fid, res]; },
  });
  router.dispatch({ method: 'GET', pathname: '/api/contracts/C1/punch', res: 'R' });
  assert.deepEqual(c.list, ['C1', 'R']);
  router.dispatch({ method: 'POST', pathname: '/api/contracts/C1/punch', body: 'B', res: 'R' });
  assert.deepEqual(c.post, ['C1', 'B', 'R']);
  router.dispatch({ method: 'PUT', pathname: '/api/contracts/C1/punch/P9', body: 'B', res: 'R' });
  assert.deepEqual(c.put, ['C1', 'P9', 'B', 'R']);
  router.dispatch({ method: 'DELETE', pathname: '/api/contracts/C1/punch/P9', res: 'R' });
  assert.deepEqual(c.del, ['C1', 'P9', 'R']);
  router.dispatch({ method: 'DELETE', pathname: '/api/contracts/C1/punch/P9/fotos/F2', res: 'R' });
  assert.deepEqual(c.delFoto, ['C1', 'P9', 'F2', 'R']);
});

// ─── routes/recrutamento.js (solicitações, candidatos, docs/arquivo, sino) ───

test('routes/recrutamento.js — registra exatamente as 14 rotas de recrutamento', () => {
  const router = createRouter();
  require('../routes/recrutamento')(router, {});
  const rotas = router
    .list()
    .map((r) => `${r.method} ${r.pattern}`)
    .sort();
  assert.deepEqual(
    rotas,
    [
      'DELETE /api/recrutamento/candidatos/:id/documentos/:tipo/arquivo',
      'GET /api/notificacoes',
      'GET /api/recrutamento/candidatos/:id/documentos/:tipo/arquivo',
      'GET /api/recrutamento/solicitacoes',
      'GET /api/recrutamento/solicitacoes/:id',
      'PATCH /api/recrutamento/candidatos/:id/antecedentes',
      'PATCH /api/recrutamento/candidatos/:id/triagem',
      'POST /api/notificacoes/:id/marcar-lida',
      'POST /api/recrutamento/candidatos/:id/aprovar',
      'POST /api/recrutamento/candidatos/:id/documentos/:tipo',
      'POST /api/recrutamento/candidatos/:id/documentos/:tipo/arquivo',
      'POST /api/recrutamento/solicitacoes',
      'POST /api/recrutamento/solicitacoes/:id/cancelar',
      'POST /api/recrutamento/vagas/:id/candidatos',
    ].sort()
  );
});

test('routes/recrutamento.js — arquivo de documento: POST/GET/DELETE recebem (id, tipo, …)', () => {
  const c = {};
  const router = createRouter();
  require('../routes/recrutamento')(router, {
    handlePostCandidatoDocArquivo: (id, tipo, req, res) => {
      c.post = [id, tipo, req, res];
    },
    handleGetCandidatoDocArquivo: (id, tipo, res) => {
      c.get = [id, tipo, res];
    },
    handleDeleteCandidatoDocArquivo: (id, tipo, res) => {
      c.del = [id, tipo, res];
    },
  });
  // a sub-rota /arquivo (7 segmentos) não é engolida pela /documentos/:tipo (6)
  router.dispatch({
    method: 'POST',
    pathname: '/api/recrutamento/candidatos/C1/documentos/rg/arquivo',
    req: 'REQ',
    res: 'RES',
  });
  assert.deepEqual(c.post, ['C1', 'rg', 'REQ', 'RES']);

  router.dispatch({
    method: 'GET',
    pathname: '/api/recrutamento/candidatos/C1/documentos/cpf/arquivo',
    res: 'RES',
  });
  assert.deepEqual(c.get, ['C1', 'cpf', 'RES']);

  router.dispatch({
    method: 'DELETE',
    pathname: '/api/recrutamento/candidatos/C1/documentos/ctps/arquivo',
    res: 'RES',
  });
  assert.deepEqual(c.del, ['C1', 'ctps', 'RES']);
});
