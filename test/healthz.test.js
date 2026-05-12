'use strict';
// node --test test/healthz.test.js  (requer servidor rodando com PG acessível)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const BASE = `http://localhost:${process.env.PORT || 3001}`;

function get(path) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    http.get(`${BASE}${path}`, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: (() => { try { return JSON.parse(data); } catch { return data; } })(),
          ms: Date.now() - t0,
        });
      });
    }).on('error', reject);
  });
}

// ─── /healthz ────────────────────────────────────────────────────────────────

test('GET /healthz retorna 200 com PG ok', async () => {
  const r = await get('/healthz');
  assert.equal(r.status, 200, `status esperado 200, recebeu ${r.status}: ${JSON.stringify(r.body)}`);
});

test('GET /healthz body tem status: "ok"', async () => {
  const r = await get('/healthz');
  assert.equal(r.body.status, 'ok');
});

test('GET /healthz body tem campo db', async () => {
  const r = await get('/healthz');
  assert.ok(Object.prototype.hasOwnProperty.call(r.body, 'db'));
  assert.equal(r.body.db, 'ok');
});

test('GET /healthz body tem uptime_s como número', async () => {
  const r = await get('/healthz');
  assert.ok(typeof r.body.uptime_s === 'number', `uptime_s deve ser number: ${r.body.uptime_s}`);
  assert.ok(r.body.uptime_s >= 0);
});

test('GET /healthz body tem version', async () => {
  const r = await get('/healthz');
  assert.ok(r.body.version, 'version ausente');
});

test('GET /healthz responde em menos de 2 segundos', async () => {
  const r = await get('/healthz');
  assert.ok(r.ms < 2000, `healthz demorou ${r.ms}ms (máx 2000ms)`);
});

test('GET /healthz não retorna 401 (sem auth)', async () => {
  const r = await get('/healthz');
  assert.notEqual(r.status, 401, '/healthz não deve exigir autenticação');
  assert.notEqual(r.status, 403);
});

// ─── /readyz ─────────────────────────────────────────────────────────────────

test('GET /readyz retorna 200', async () => {
  const r = await get('/readyz');
  assert.equal(r.status, 200, `readyz status: ${r.status} body: ${JSON.stringify(r.body)}`);
});

test('GET /readyz não retorna 401', async () => {
  const r = await get('/readyz');
  assert.notEqual(r.status, 401);
});

// ─── /api/health (rota legada mantida) ───────────────────────────────────────

test('GET /api/health continua respondendo 200', async () => {
  const r = await get('/api/health');
  assert.equal(r.status, 200, `api/health status: ${r.status}`);
});

test('GET /api/health body tem db: "ok"', async () => {
  const r = await get('/api/health');
  assert.equal(r.body.db, 'ok');
});
