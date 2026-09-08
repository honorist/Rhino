'use strict';
// node --test test/terms-enforcement.test.js  (sem servidor, sem DB)
//
// Achado 2.3 da varredura 2026-09-08: aceite de Termos só era checado no
// client (js/app.js) — um cliente HTTP direto contornava o consentimento
// sem nenhuma barreira no servidor.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const terms = require('../lib/terms-enforcement');

test('sem usuário autenticado, não bloqueia (não é este enforcement que decide isso)', () => {
  assert.equal(terms.blocksOnPendingTerms({ pathname: '/api/contracts', user: null }), false);
});

test('usuário que nunca aceitou os termos é bloqueado em rota comum', () => {
  const user = { id: 'u1', acceptedTermsAt: null };
  assert.equal(terms.blocksOnPendingTerms({ pathname: '/api/contracts', user }), true);
});

test('usuário que já aceitou não é bloqueado', () => {
  const user = { id: 'u1', acceptedTermsAt: '2026-09-01T10:00:00.000Z' };
  assert.equal(terms.blocksOnPendingTerms({ pathname: '/api/contracts', user }), false);
});

test('/api/auth/accept-terms é isento mesmo sem aceite (senão o usuário nunca conseguiria aceitar)', () => {
  const user = { id: 'u1', acceptedTermsAt: null };
  assert.equal(terms.blocksOnPendingTerms({ pathname: '/api/auth/accept-terms', user }), false);
});

test('/api/auth/logout é isento mesmo sem aceite (usuário pode sempre sair)', () => {
  const user = { id: 'u1', acceptedTermsAt: null };
  assert.equal(terms.blocksOnPendingTerms({ pathname: '/api/auth/logout', user }), false);
});
