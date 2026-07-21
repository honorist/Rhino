'use strict';
/**
 * Regras puras da Matriz de treinamentos NR (lib/treinamento.js) — um teste por
 * BR-NR. Guarda o status de validade, o bloqueio de alocação e o resumo.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { statusValidade, podeAlocar, resumo, normalizarNr, NR_COMUNS } = require('../lib/treinamento');

const HOJE = '2026-07-21';

// ── BR-NR-001: status de validade ───────────────────────────────────────────
test('BR-NR-001: sem data de validade → sem_validade', () => {
  assert.equal(statusValidade(null, HOJE), 'sem_validade');
  assert.equal(statusValidade('', HOJE), 'sem_validade');
  assert.equal(statusValidade(undefined, HOJE), 'sem_validade');
});

test('BR-NR-001: validade no passado → vencido', () => {
  assert.equal(statusValidade('2026-07-20', HOJE), 'vencido');
  assert.equal(statusValidade('2020-01-01', HOJE), 'vencido');
});

test('BR-NR-001: validade dentro de 30 dias → vencendo (borda inclusiva)', () => {
  assert.equal(statusValidade('2026-07-21', HOJE), 'vencendo', 'vence hoje ainda é vencendo');
  assert.equal(statusValidade('2026-08-20', HOJE), 'vencendo', '30 dias exatos');
});

test('BR-NR-001: validade além de 30 dias → vigente', () => {
  assert.equal(statusValidade('2026-08-21', HOJE), 'vigente', '31 dias');
  assert.equal(statusValidade('2027-01-01', HOJE), 'vigente');
});

// ── BR-NR-002: bloqueio de alocação ─────────────────────────────────────────
test('BR-NR-002: NR exigida ausente entra em faltantes e bloqueia', () => {
  const r = podeAlocar([{ nr: 'NR-10', dataValidade: '2027-01-01' }], ['NR-10', 'NR-35'], HOJE);
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltantes, ['NR-35']);
  assert.deepEqual(r.vencidos, []);
});

test('BR-NR-002: NR exigida vencida entra em vencidos e bloqueia', () => {
  const r = podeAlocar([{ nr: 'NR-35', dataValidade: '2020-01-01' }], ['NR-35'], HOJE);
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltantes, []);
  assert.deepEqual(r.vencidos, ['NR-35']);
});

test('BR-NR-002: todas as NRs vigentes → ok e nada bloqueia', () => {
  const treinos = [
    { nr: 'NR-10', dataValidade: '2027-01-01' },
    { nr: 'nr-35', dataValidade: '2027-06-01' }, // caixa diferente casa
  ];
  const r = podeAlocar(treinos, ['NR-10', 'NR-35'], HOJE);
  assert.equal(r.ok, true);
  assert.deepEqual(r.faltantes, []);
  assert.deepEqual(r.vencidos, []);
});

test('BR-NR-002: sem_validade NÃO bloqueia (curso permanente)', () => {
  const r = podeAlocar([{ nr: 'NR-06', dataValidade: null }], ['NR-06'], HOJE);
  assert.equal(r.ok, true);
});

test('BR-NR-002: renovação — basta um treinamento não-vencido da mesma NR', () => {
  const treinos = [
    { nr: 'NR-35', dataValidade: '2020-01-01' }, // antigo, vencido
    { nr: 'NR-35', dataValidade: '2027-06-01' }, // renovado, vigente
  ];
  const r = podeAlocar(treinos, ['NR-35'], HOJE);
  assert.equal(r.ok, true, 'a renovação vigente cobre a NR');
});

test('BR-NR-002: sem NRs exigidas → sempre ok', () => {
  assert.equal(podeAlocar([], [], HOJE).ok, true);
  assert.equal(podeAlocar([], null, HOJE).ok, true);
});

// ── BR-NR-003: resumo ───────────────────────────────────────────────────────
test('BR-NR-003: resumo conta total, por status, vencidos/vencendo e NRs distintas', () => {
  const treinos = [
    { nr: 'NR-10', dataValidade: '2027-01-01' }, // vigente
    { nr: 'NR-35', dataValidade: '2026-08-10' }, // vencendo (20d)
    { nr: 'NR-35', dataValidade: '2020-01-01' }, // vencido
    { nr: 'NR-06', dataValidade: null }, // sem_validade
  ];
  const r = resumo(treinos, HOJE);
  assert.equal(r.total, 4);
  assert.deepEqual(r.porStatus, { vigente: 1, vencendo: 1, vencido: 1, sem_validade: 1 });
  assert.equal(r.vencidos, 1);
  assert.equal(r.vencendo, 1);
  assert.deepEqual([...r.nrs].sort(), ['NR-06', 'NR-10', 'NR-35']);
});

test('BR-NR-003: lista vazia devolve zeros coerentes', () => {
  const r = resumo([], HOJE);
  assert.equal(r.total, 0);
  assert.deepEqual(r.porStatus, { vigente: 0, vencendo: 0, vencido: 0, sem_validade: 0 });
  assert.deepEqual(r.nrs, []);
});

// ── helpers ─────────────────────────────────────────────────────────────────
test('normalizarNr: apara espaços e sobe caixa', () => {
  assert.equal(normalizarNr('  nr-10 '), 'NR-10');
  assert.equal(normalizarNr(null), '');
});

test('NR_COMUNS traz as NRs frequentes já normalizadas', () => {
  assert.ok(Array.isArray(NR_COMUNS) && NR_COMUNS.includes('NR-10') && NR_COMUNS.includes('NR-35'));
});
