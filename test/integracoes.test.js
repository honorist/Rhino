'use strict';
/**
 * Handler de Integrações e recursos transversais (handlers/integracoes.js):
 * estatísticas de uso de IA, export/anonimização LGPD, chat IA + auto-
 * classificação (fetch pra API Anthropic mockado), e importação/conciliação
 * de extrato OFX. `db`/`repos`/`perms` dublados — nada toca o Postgres nem a
 * API real da Anthropic.
 *  - blockIfNoScreenAccess espelha no servidor o gate de tela do frontend:
 *    super admin sempre passa; perfil restrito sem a rota nas `abas` é 403;
 *  - IA: sem ANTHROPIC_API_KEY → 503; rate-limit de 20/5min por usuário → 429;
 *    resposta não-ok da API externa → 502 (nunca vaza o corpo cru);
 *  - LGPD delete anonimiza (não apaga a linha) e limpa as sessões + cookie;
 *  - OFX: concilia por valor (±0,02) e data (±1 dia) com lançamentos de caixa
 *    existentes; nenhuma transação no arquivo → 400.
 */
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');

const db = require('../db');
const repos = require('../db/repos');
const auth = require('../lib/auth');
const perms = require('../lib/permissions');
const h = require('../handlers/integracoes');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    headers: null,
    writeHead(s, hd) { res.status = s; res.headers = { ...(res.headers || {}), ...(hd || {}) }; },
    setHeader(k, v) { res.headers = { ...(res.headers || {}), [k]: v }; },
    end(payload) { res.body = payload ? (typeof payload === 'string' && payload.trim().startsWith('{') ? JSON.parse(payload) : payload) : null; },
  };
  return res;
}

const orig = {
  getOne: db.getOne, getMany: db.getMany, query: db.query,
  users: repos.users, contracts: repos.contracts, caixa: repos.caixa, contasPagar: repos.contasPagar, tiposBase: repos.tiposBase,
  hash: auth.hash, clearSessionCookie: auth.clearSessionCookie,
  isSuperAdmin: perms.isSuperAdmin, loadAbas: perms.loadAbas,
  fetch: global.fetch, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};
let dbQueries;

beforeEach(() => {
  dbQueries = [];
  db.getOne = async () => ({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
  db.getMany = async () => [];
  db.query = async (sql, params) => { dbQueries.push({ sql, params }); return { rows: [] }; };
  repos.users = { findById: async (id) => ({ id, email: 'a@a.com', name: 'A' }), updateById: async (id, patch) => ({ id, ...patch }) };
  repos.contracts = { findAll: async () => [{ id: 'c1', status: 'ativo', name: 'C1' }] };
  repos.caixa = { findAll: async () => [] };
  repos.contasPagar = { findAll: async () => [] };
  repos.tiposBase = { findAll: async () => [{ key: 'material', label: 'Material' }] };
  auth.hash = async () => 'hashed';
  auth.clearSessionCookie = () => {};
  perms.isSuperAdmin = () => false;
  perms.loadAbas = async () => null;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  Object.assign(db, { getOne: orig.getOne, getMany: orig.getMany, query: orig.query });
  Object.assign(repos, { users: orig.users, contracts: orig.contracts, caixa: orig.caixa, contasPagar: orig.contasPagar, tiposBase: orig.tiposBase });
  Object.assign(auth, { hash: orig.hash, clearSessionCookie: orig.clearSessionCookie });
  Object.assign(perms, { isSuperAdmin: orig.isSuperAdmin, loadAbas: orig.loadAbas });
  global.fetch = orig.fetch;
  if (orig.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = orig.ANTHROPIC_API_KEY;
});

// ---------------- handleAiUsageStats ----------------

test('handleAiUsageStats — devolve monthly/allTime', async () => {
  const res = fakeRes();
  await h.handleAiUsageStats(res);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.monthly);
  assert.ok(res.body.allTime);
});

// ---------------- LGPD ----------------

test('handleLgpdExport — sem usuário devolve 401', async () => {
  const res = fakeRes();
  await h.handleLgpdExport({ user: null }, res);
  assert.equal(res.status, 401);
});

test('handleLgpdExport — devolve JSON com Content-Disposition attachment', async () => {
  const res = fakeRes();
  await h.handleLgpdExport({ user: { id: 'u1' } }, res);
  assert.equal(res.status, 200);
  assert.match(res.headers['Content-Disposition'], /attachment; filename="rhino-lgpd-u1\.json"/);
  assert.equal(res.body.usuario.id, 'u1');
  assert.ok(res.body.exportado_em);
});

test('handleLgpdDelete — sem usuário devolve 401', async () => {
  const res = fakeRes();
  await h.handleLgpdDelete({ user: null }, res);
  assert.equal(res.status, 401);
});

test('handleAiUsageStats — erro de query devolve 500', async () => {
  db.getOne = async () => { throw new Error('falha de query simulada'); };
  const res = fakeRes();
  await h.handleAiUsageStats(res);
  assert.equal(res.status, 500);
});

test('handleLgpdExport — erro ao buscar o usuário devolve 500', async () => {
  repos.users.findById = async () => { throw new Error('falha simulada'); };
  const res = fakeRes();
  await h.handleLgpdExport({ user: { id: 'u1' } }, res);
  assert.equal(res.status, 500);
});

test('handleLgpdDelete — erro ao atualizar o usuário devolve 500', async () => {
  repos.users.updateById = async () => { throw new Error('falha simulada'); };
  const res = fakeRes();
  await h.handleLgpdDelete({ user: { id: 'u1' } }, res);
  assert.equal(res.status, 500);
});

test('handleLgpdDelete — anonimiza (não apaga a linha) e limpa sessões', async () => {
  let updatePatch = null;
  repos.users.updateById = async (id, patch) => { updatePatch = patch; return { id, ...patch }; };
  const res = fakeRes();
  await h.handleLgpdDelete({ user: { id: 'u1' } }, res);
  assert.equal(res.status, 200);
  assert.match(updatePatch.email, /^deleted_u1@lgpd\.rhino$/);
  assert.equal(updatePatch.isActive, false);
  assert.ok(dbQueries.some((q) => /DELETE FROM sessions WHERE user_id/.test(q.sql)));
});

// ---------------- handleAiChat / handleAiClassify — gates ----------------

test('handleAiChat — perfil restrito sem #/ai-chat nas abas devolve 403', async () => {
  perms.loadAbas = async () => ['#/dashboard']; // sem '#/ai-chat'
  const res = fakeRes();
  await h.handleAiChat({ user: { id: 'gate1' } }, { message: 'oi' }, res);
  assert.equal(res.status, 403);
});

test('handleAiChat — super admin ignora o gate de tela mas ainda exige API key', async () => {
  perms.isSuperAdmin = () => true;
  const res = fakeRes();
  await h.handleAiChat({ user: { id: 'admin1' } }, { message: 'oi' }, res);
  assert.equal(res.status, 503); // sem ANTHROPIC_API_KEY
});

test('handleAiChat — sem ANTHROPIC_API_KEY devolve 503', async () => {
  const res = fakeRes();
  await h.handleAiChat({ user: { id: 'user-503' } }, { message: 'oi' }, res);
  assert.equal(res.status, 503);
});

test('handleAiChat — message vazio devolve 400', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  const res = fakeRes();
  await h.handleAiChat({ user: { id: 'user-400' } }, { message: '  ' }, res);
  assert.equal(res.status, 400);
});

test('handleAiChat — sucesso: chama a API Anthropic e devolve reply/model', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  let capturedBody;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ content: [{ text: 'Resposta da IA' }], model: 'claude-haiku-4-5-20251001' }) };
  };
  const res = fakeRes();
  await h.handleAiChat({ user: { id: 'user-ok' } }, { message: 'Qual o saldo?' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'Resposta da IA');
  assert.equal(capturedBody.messages[0].content, 'Qual o saldo?');
});

test('handleAiChat — resposta não-ok da API externa devolve 502 (não vaza corpo cru)', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  global.fetch = async () => ({ ok: false, status: 500 });
  const res = fakeRes();
  await h.handleAiChat({ user: { id: 'user-502' } }, { message: 'oi' }, res);
  assert.equal(res.status, 502);
});

test('handleAiChat — rate-limit de 20 chamadas/5min bloqueia a 21ª com 429', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  global.fetch = async () => ({ ok: true, json: async () => ({ content: [{ text: 'ok' }] }) });
  const user = { id: 'user-ratelimit-' + Date.now() };
  for (let i = 0; i < 20; i++) {
    const r = fakeRes();
    await h.handleAiChat({ user }, { message: 'oi' }, r);
    assert.equal(r.status, 200, `chamada ${i + 1} deveria passar`);
  }
  const res21 = fakeRes();
  await h.handleAiChat({ user }, { message: 'oi' }, res21);
  assert.equal(res21.status, 429);
  assert.ok(res21.headers['Retry-After']);
});

test('handleAiClassify — sem descricao devolve 400', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  const res = fakeRes();
  await h.handleAiClassify({ user: { id: 'cls1' } }, { valor: 100 }, res);
  assert.equal(res.status, 400);
});

test('handleAiClassify — sucesso extrai o JSON do texto da resposta', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ content: [{ text: 'Aqui está: {"category":"material","contractId":"c1","confidence":0.9,"justificativa":"x"}' }] }),
  });
  const res = fakeRes();
  await h.handleAiClassify({ user: { id: 'cls2' } }, { descricao: 'Cimento', valor: 500 }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.category, 'material');
  assert.equal(res.body.confidence, 0.9);
});

// ---------------- OFX ----------------

function fakeOfxReq(content) {
  const req = new EventEmitter();
  req.destroy = () => {};
  setImmediate(() => {
    req.emit('data', Buffer.from(content, 'utf8'));
    req.emit('end');
  });
  return req;
}

const OFX_SAMPLE = `
<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260415120000
<TRNAMT>-350.50
<FITID>abc123
<MEMO>Compra material
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260416120000
<TRNAMT>1200.00
<FITID>def456
<MEMO>Recebimento NF
</STMTTRN>
</OFX>`;

test('handleImportarOfx — arquivo maior que 5MB é rejeitado (destroy + 400)', async () => {
  const req = new EventEmitter();
  let destroyed = false;
  req.destroy = () => { destroyed = true; };
  const res = fakeRes();
  const big = Buffer.alloc(6 * 1024 * 1024, 0x41);
  setImmediate(() => req.emit('data', big));
  await h.handleImportarOfx(req, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /muito grande/);
  assert.equal(destroyed, true);
});

test('handleImportarOfx — arquivo sem transações reconhecíveis devolve 400', async () => {
  const req = fakeOfxReq('<OFX>sem transacoes</OFX>');
  const res = fakeRes();
  await new Promise((resolve) => {
    h.handleImportarOfx(req, res);
    req.once('end', () => setImmediate(resolve));
  });
  assert.equal(res.status, 400);
});

test('handleImportarOfx — parseia transações e marca "novo" quando não há match no caixa', async () => {
  const req = fakeOfxReq(OFX_SAMPLE);
  const res = fakeRes();
  await new Promise((resolve) => {
    h.handleImportarOfx(req, res);
    req.once('end', () => setImmediate(resolve));
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.novos, 2);
  assert.equal(res.body.transacoes[0].tipo, 'saida');
  assert.equal(res.body.transacoes[0].valor, -350.5);
  assert.equal(res.body.transacoes[1].tipo, 'entrada');
});

test('handleImportarOfx — concilia quando valor (±0,02) e data (±1 dia) batem com o caixa', async () => {
  repos.caixa.findAll = async () => [{ id: 'cxa1', description: 'Compra material', value: 350.5, date: '2026-04-15' }];
  const req = fakeOfxReq(OFX_SAMPLE);
  const res = fakeRes();
  await new Promise((resolve) => {
    h.handleImportarOfx(req, res);
    req.once('end', () => setImmediate(resolve));
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.novos, 1); // só a 2ª (crédito) fica sem match
  assert.equal(res.body.transacoes[0].status, 'conciliado');
  assert.equal(res.body.transacoes[0].match.id, 'cxa1');
});
