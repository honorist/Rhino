'use strict';
/**
 * Regras puras do Punch list / Qualidade (lib/punch.js) — um teste por BR-PUNCH.
 * Guarda os carimbos de resolução/verificação, o vencimento e o resumo da obra.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carimboStatus, isVencido, resumo, normalizarStatus } = require('../lib/punch');

const AGORA = '2026-07-21T10:00:00.000Z';

// ── BR-PUNCH-001: carimbos derivam do status ────────────────────────────────
test('BR-PUNCH-001: resolvido carimba resolvido_em; verificado não ainda', () => {
  const c = carimboStatus('resolvido', AGORA);
  assert.equal(c.resolvidoEm, AGORA);
  assert.equal(c.verificadoEm, null);
});

test('BR-PUNCH-001: verificado carimba verificado_em e preserva resolvido_em anterior', () => {
  const c = carimboStatus('verificado', AGORA, { resolvidoEm: '2026-07-19T00:00:00.000Z' });
  assert.equal(c.resolvidoEm, '2026-07-19T00:00:00.000Z', 'não sobrescreve a resolução original');
  assert.equal(c.verificadoEm, AGORA);
});

test('BR-PUNCH-001: verificado sem resolução prévia carimba os dois', () => {
  const c = carimboStatus('verificado', AGORA);
  assert.equal(c.resolvidoEm, AGORA);
  assert.equal(c.verificadoEm, AGORA);
});

test('BR-PUNCH-001: reabrir (aberto/em_andamento) limpa os carimbos posteriores', () => {
  const c = carimboStatus('em_andamento', AGORA, { resolvidoEm: AGORA });
  assert.equal(c.resolvidoEm, null);
  assert.equal(c.verificadoEm, null);
});

test('normalizarStatus: status desconhecido vira aberto', () => {
  assert.equal(normalizarStatus('zzz'), 'aberto');
  assert.equal(normalizarStatus('verificado'), 'verificado');
});

// ── BR-PUNCH-002: vencimento ────────────────────────────────────────────────
test('BR-PUNCH-002: prazo no passado e aberto → vencido', () => {
  assert.equal(isVencido({ prazo: '2026-07-20', status: 'aberto' }, '2026-07-21'), true);
});

test('BR-PUNCH-002: resolvido/verificado nunca vencem', () => {
  assert.equal(isVencido({ prazo: '2026-07-01', status: 'resolvido' }, '2026-07-21'), false);
  assert.equal(isVencido({ prazo: '2026-07-01', status: 'verificado' }, '2026-07-21'), false);
});

test('BR-PUNCH-002: sem prazo ou prazo futuro → não vencido', () => {
  assert.equal(isVencido({ status: 'aberto' }, '2026-07-21'), false);
  assert.equal(isVencido({ prazo: '2026-07-30', status: 'aberto' }, '2026-07-21'), false);
});

// ── BR-PUNCH-003: resumo ────────────────────────────────────────────────────
test('BR-PUNCH-003: resumo conta total, por status, abertos, vencidos e a vencer 7d', () => {
  const itens = [
    { status: 'aberto', prazo: '2026-07-20' }, // vencido
    { status: 'em_andamento', prazo: '2026-07-25' }, // a vencer (4d)
    { status: 'aberto', prazo: '2026-08-30' }, // futuro, fora dos 7d
    { status: 'resolvido', prazo: '2026-07-01' }, // não vence (concluído p/ vencimento)
    { status: 'verificado' },
  ];
  const r = resumo(itens, '2026-07-21');
  assert.equal(r.total, 5);
  assert.deepEqual(r.porStatus, { aberto: 2, em_andamento: 1, resolvido: 1, verificado: 1 });
  assert.equal(r.abertos, 4, 'tudo que não está verificado');
  assert.equal(r.vencidos, 1);
  assert.equal(r.aVencer7d, 1);
});

test('BR-PUNCH-003: lista vazia devolve zeros coerentes', () => {
  const r = resumo([], '2026-07-21');
  assert.equal(r.total, 0);
  assert.equal(r.abertos, 0);
  assert.equal(r.vencidos, 0);
  assert.deepEqual(r.porStatus, { aberto: 0, em_andamento: 0, resolvido: 0, verificado: 0 });
});
