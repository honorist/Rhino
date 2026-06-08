'use strict';
/**
 * @file Testes do rate limiter em memória (lib/rate-limit.js). Token bucket por chave.
 * Cobre o gap de §8 (lógica de segurança sem teste). Janela testada com Date.now mockado.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const rl = require('../lib/rate-limit');

test('check: permite até max e bloqueia o excedente', () => {
  const key = 'ip1::login';
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(rl.check(key, { max: 3, windowMs: 1000 }).ok, true);
  }
  const blocked = rl.check(key, { max: 3, windowMs: 1000 });
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSec >= 1, 'retryAfterSec deve ser informado quando bloqueia');
});

test('check: remaining decresce a cada chamada', () => {
  assert.strictEqual(rl.check('ip2::x', { max: 5, windowMs: 1000 }).remaining, 4);
  assert.strictEqual(rl.check('ip2::x', { max: 5, windowMs: 1000 }).remaining, 3);
});

test('check: a janela expirando libera de novo (Date.now mockado)', () => {
  const real = Date.now;
  let t = 1000;
  Date.now = () => t;
  try {
    const key = 'ip3::w';
    assert.strictEqual(rl.check(key, { max: 1, windowMs: 100 }).ok, true);
    assert.strictEqual(rl.check(key, { max: 1, windowMs: 100 }).ok, false, 'bloqueado dentro da janela');
    t += 150; // passa da janela de 100ms
    assert.strictEqual(rl.check(key, { max: 1, windowMs: 100 }).ok, true, 'liberado após expirar');
  } finally {
    Date.now = real;
  }
});

test('check: chaves diferentes são independentes', () => {
  assert.strictEqual(rl.check('ipA::r', { max: 1, windowMs: 1000 }).ok, true);
  assert.strictEqual(rl.check('ipB::r', { max: 1, windowMs: 1000 }).ok, true);
});

test('refund: devolve um slot consumido (não pune tentativa legítima)', () => {
  const key = 'ip4::ref';
  rl.check(key, { max: 1, windowMs: 1000 });
  assert.strictEqual(rl.check(key, { max: 1, windowMs: 1000 }).ok, false);
  rl.refund(key);
  assert.strictEqual(rl.check(key, { max: 1, windowMs: 1000 }).ok, true, 'após refund volta a permitir');
});

test('clientKey: combina IP do socket + rota', () => {
  const req = { headers: {}, socket: { remoteAddress: '192.0.2.7' } };
  assert.strictEqual(rl.clientKey(req, 'login'), '192.0.2.7::login');
});

test('clientKey: sem IP disponível usa "unknown"', () => {
  assert.strictEqual(rl.clientKey({ headers: {}, socket: {} }, 'r'), 'unknown::r');
});
