'use strict';
// node --test test/headers.test.js  (requer servidor rodando: node server.js)
// PORT configurável via env: PORT=3001 node --test test/headers.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const BASE = `http://localhost:${process.env.PORT || 3001}`;

function fetchHeaders(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, res => {
      res.resume(); // drena o body
      resolve(res.headers);
    }).on('error', reject);
  });
}

// ─── Security headers ────────────────────────────────────────────────────────

test('X-Frame-Options: DENY ou SAMEORIGIN', async () => {
  const h = await fetchHeaders('/');
  assert.ok(h['x-frame-options'], 'X-Frame-Options ausente');
  assert.match(h['x-frame-options'], /DENY|SAMEORIGIN/i);
});

test('X-Content-Type-Options: nosniff', async () => {
  const h = await fetchHeaders('/');
  assert.equal(h['x-content-type-options'], 'nosniff');
});

test('Referrer-Policy presente', async () => {
  const h = await fetchHeaders('/');
  assert.ok(h['referrer-policy'], 'Referrer-Policy ausente');
});

test('Content-Security-Policy presente', async () => {
  const h = await fetchHeaders('/');
  assert.ok(h['content-security-policy'], 'Content-Security-Policy ausente');
});

test('CSP contém frame-ancestors', async () => {
  const h = await fetchHeaders('/');
  assert.match(h['content-security-policy'], /frame-ancestors/);
});

test('CSP contém default-src', async () => {
  const h = await fetchHeaders('/');
  assert.match(h['content-security-policy'], /default-src/);
});

test('X-Permitted-Cross-Domain-Policies presente', async () => {
  const h = await fetchHeaders('/');
  assert.ok(h['x-permitted-cross-domain-policies'], 'X-Permitted-Cross-Domain-Policies ausente');
  assert.equal(h['x-permitted-cross-domain-policies'], 'none');
});

test('X-DNS-Prefetch-Control presente', async () => {
  const h = await fetchHeaders('/');
  assert.ok(h['x-dns-prefetch-control'], 'X-DNS-Prefetch-Control ausente');
  assert.equal(h['x-dns-prefetch-control'], 'off');
});

test('Headers presentes na API também', async () => {
  const h = await fetchHeaders('/api/health');
  assert.ok(h['x-frame-options'], 'X-Frame-Options ausente na API');
  assert.ok(h['content-security-policy'], 'CSP ausente na API');
});

test('Server header não expõe "node" ou "express"', async () => {
  const h = await fetchHeaders('/');
  if (h['server']) {
    assert.doesNotMatch(h['server'], /node|express/i, `Server header vaza info: ${h['server']}`);
  }
});

// ─── CORS ────────────────────────────────────────────────────────────────────

test('CORS não permite origens externas arbitrárias', async () => {
  const h = await fetchHeaders('/');
  // Sem origin header → não deve ter Access-Control-Allow-Origin aberto
  assert.ok(
    !h['access-control-allow-origin'] || h['access-control-allow-origin'] !== '*',
    'CORS permite * (qualquer origem)'
  );
});
