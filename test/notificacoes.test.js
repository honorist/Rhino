'use strict';
/**
 * Regras puras de preferências de notificação (lib/notificacoes.js).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const notif = require('../lib/notificacoes');

// ── BR-NOTIF-001: catálogo ──────────────────────────────────────────────────
test('BR-NOTIF-001: TIPOS_CATALOGO tem tipo/label/categoria em cada entrada, sem tipo duplicado', () => {
  assert.ok(notif.TIPOS_CATALOGO.length > 0);
  const vistos = new Set();
  for (const t of notif.TIPOS_CATALOGO) {
    assert.equal(typeof t.tipo, 'string');
    assert.ok(t.tipo.length > 0);
    assert.equal(typeof t.label, 'string');
    assert.equal(typeof t.categoria, 'string');
    assert.ok(!vistos.has(t.tipo), `tipo duplicado: ${t.tipo}`);
    vistos.add(t.tipo);
  }
});

// ── BR-NOTIF-002: deveNotificar ─────────────────────────────────────────────
test('BR-NOTIF-002: lista vazia/ausente recebe tudo (default opt-out, não opt-in)', () => {
  assert.equal(notif.deveNotificar([], 'sugestao.nova'), true);
  assert.equal(notif.deveNotificar(null, 'sugestao.nova'), true);
  assert.equal(notif.deveNotificar(undefined, 'sugestao.nova'), true);
});

test('BR-NOTIF-002: tipo desativado explicitamente não notifica', () => {
  assert.equal(notif.deveNotificar(['sugestao.nova'], 'sugestao.nova'), false);
});

test('BR-NOTIF-002: tipo não desativado continua notificando mesmo com outros desativados', () => {
  assert.equal(notif.deveNotificar(['sugestao.nova', 'punch.atribuido'], 'sugestao.status'), true);
});

test('BR-NOTIF-002: entrada não-array (dado corrompido) recebe tudo, não quebra', () => {
  assert.equal(notif.deveNotificar('lixo', 'sugestao.nova'), true);
  assert.equal(notif.deveNotificar(42, 'sugestao.nova'), true);
});
