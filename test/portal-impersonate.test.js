'use strict';
// node --test test/portal-impersonate.test.js — testes puros, sem DB nem servidor.
//
// Regra de negócio do "Ver portal como cliente" (impersonação por super admin):
//  - somente super admin (nivelAcessoId null ou 'admin') pode impersonar;
//  - sessão impersonada tem TTL curto (30 min, não os 7 dias da sessão real);
//  - sid mantém o formato forte do portal (pses_ + 256 bits hex);
//  - a sessão registra QUEM está impersonando (impersonated_by).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  IMPERSONATE_TTL_MIN,
  validarImpersonacao,
  criarSessaoImpersonada,
} = require('../lib/portal-impersonate');

// ─── validarImpersonacao ─────────────────────────────────────────────────────

test('nega quando não há usuário autenticado', () => {
  assert.equal(validarImpersonacao(null), 'Não autenticado');
  assert.equal(validarImpersonacao(undefined), 'Não autenticado');
});

test('nega usuário com perfil comum (não super admin)', () => {
  const erro = validarImpersonacao({ id: 'user_1', nivelAcessoId: 'operacional' });
  assert.match(erro, /super admin/i);
});

test('permite super admin sem perfil (nivelAcessoId null)', () => {
  assert.equal(validarImpersonacao({ id: 'user_1', nivelAcessoId: null }), null);
});

test('permite admin explícito (nivelAcessoId "admin")', () => {
  assert.equal(validarImpersonacao({ id: 'user_1', nivelAcessoId: 'admin' }), null);
});

// ─── criarSessaoImpersonada ──────────────────────────────────────────────────

test('sid tem prefixo pses_ e 256 bits de entropia (64 hex)', () => {
  const s = criarSessaoImpersonada('user_1');
  assert.match(s.sid, /^pses_[0-9a-f]{64}$/);
});

test('sids são únicos entre chamadas', () => {
  assert.notEqual(criarSessaoImpersonada('u').sid, criarSessaoImpersonada('u').sid);
});

test('TTL é de 30 minutos — não os 7 dias da sessão real do cliente', () => {
  const t0 = Date.now();
  const s = criarSessaoImpersonada('user_1', t0);
  assert.equal(s.expiresAt.getTime() - t0, IMPERSONATE_TTL_MIN * 60 * 1000);
  assert.equal(IMPERSONATE_TTL_MIN, 30);
});

test('registra quem está impersonando', () => {
  assert.equal(criarSessaoImpersonada('user_9').impersonatedBy, 'user_9');
});
