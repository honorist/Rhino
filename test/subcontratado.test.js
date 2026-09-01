'use strict';
/**
 * Regras puras de Subcontratados (lib/subcontratado.js). Um teste por regra
 * (BR-SUB-001..006), mutação-verificado: cada assert falharia se a regra
 * correspondente estivesse errada. A orquestração HTTP do handler não é coberta
 * aqui (depende de Postgres).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const sub = require('../lib/subcontratado');

// Fixture: valores escolhidos para que cada recorte dê um número distinto.
const MEDICOES = [
  { competencia: '2026-01', status: 'paga', valor: 1000 },
  { competencia: '2026-01', status: 'medida', valor: 500 },
  { competencia: '2026-02', status: 'prevista', valor: 200 },
  { competencia: '2026-02', status: 'paga', valor: 300 },
  { competencia: '2026-03', status: 'prevista', valor: 50 },
];

// ── BR-SUB-001: total medido (medida + paga) ────────────────────────────────
test('BR-SUB-001: totalMedido soma medida + paga (paga conta como medido)', () => {
  // paga: 1000 + 300 = 1300; medida: 500 → 1800. prevista (200+50) NÃO entra.
  assert.equal(sub.totalMedido(MEDICOES), 1800);
});

test('BR-SUB-001: totalMedido ignora previstas', () => {
  assert.equal(sub.totalMedido([{ status: 'prevista', valor: 999 }]), 0);
});

// ── BR-SUB-002: total pago (apenas paga) ────────────────────────────────────
test('BR-SUB-002: totalPago soma apenas status paga', () => {
  assert.equal(sub.totalPago(MEDICOES), 1300); // 1000 + 300
});

// ── BR-SUB-003: saldo a pagar = medido − pago ───────────────────────────────
test('BR-SUB-003: saldo é medido menos pago (o que falta quitar)', () => {
  // medido 1800 − pago 1300 = 500 (exatamente as medições "medida" não pagas).
  assert.equal(sub.saldo(MEDICOES), 500);
});

test('BR-SUB-003: saldo com tudo pago é zero', () => {
  assert.equal(sub.saldo([{ status: 'paga', valor: 400 }]), 0);
});

// ── BR-SUB-004: resumo por status ───────────────────────────────────────────
test('BR-SUB-004: resumoPorStatus reparte quantidade e valor; soma reconstitui o total', () => {
  const r = sub.resumoPorStatus(MEDICOES);
  assert.equal(r.prevista.quantidade, 2);
  assert.equal(r.prevista.valor, 250); // 200 + 50
  assert.equal(r.medida.quantidade, 1);
  assert.equal(r.medida.valor, 500);
  assert.equal(r.paga.quantidade, 2);
  assert.equal(r.paga.valor, 1300); // 1000 + 300
  // A soma dos três valores reconstitui o total de todas as medições.
  assert.equal(r.prevista.valor + r.medida.valor + r.paga.valor, 2050);
});

// ── BR-SUB-005: agregação por competência ───────────────────────────────────
test('BR-SUB-005: porCompetencia agrega por YYYY-MM, ordenado ascendente', () => {
  const g = sub.porCompetencia(MEDICOES);
  assert.deepEqual(g.map((x) => x.competencia), ['2026-01', '2026-02', '2026-03']);

  const jan = g.find((x) => x.competencia === '2026-01');
  assert.equal(jan.paga, 1000);
  assert.equal(jan.medida, 500);
  assert.equal(jan.prevista, 0);
  assert.equal(jan.total, 1500);
  assert.equal(jan.quantidade, 2);

  const fev = g.find((x) => x.competencia === '2026-02');
  assert.equal(fev.prevista, 200);
  assert.equal(fev.paga, 300);
  assert.equal(fev.total, 500);
});

test('BR-SUB-005: porCompetencia joga competência ausente no bucket "" (ordena primeiro)', () => {
  const g = sub.porCompetencia([
    { competencia: '2026-05', status: 'paga', valor: 10 },
    { status: 'prevista', valor: 7 },
  ]);
  assert.equal(g[0].competencia, ''); // '' ordena antes de '2026-05'
  assert.equal(g[0].total, 7);
  assert.equal(g[1].competencia, '2026-05');
});

// ── BR-SUB-006: resumo completo ─────────────────────────────────────────────
test('BR-SUB-006: resumo junta totais, saldo, por status e por competência', () => {
  const r = sub.resumo(MEDICOES);
  assert.equal(r.quantidade, 5);
  assert.equal(r.totalPrevisto, 250);
  assert.equal(r.totalMedido, 1800);
  assert.equal(r.totalPago, 1300);
  assert.equal(r.saldo, 500);
  assert.equal(r.porStatus.paga.valor, 1300);
  assert.equal(r.porCompetencia.length, 3);
});

test('BR-SUB-006: resumo com entrada vazia/ inválida devolve zeros', () => {
  const r = sub.resumo(null);
  assert.equal(r.quantidade, 0);
  assert.equal(r.totalPrevisto, 0);
  assert.equal(r.totalMedido, 0);
  assert.equal(r.totalPago, 0);
  assert.equal(r.saldo, 0);
  assert.deepEqual(r.porCompetencia, []);
});

// ── Coerção: NUMERIC do Postgres chega como string ──────────────────────────
test('somas coagem valor em string (NUMERIC do pg) sem drift', () => {
  const r = sub.resumo([
    { competencia: '2026-01', status: 'paga', valor: '0.10' },
    { competencia: '2026-01', status: 'paga', valor: '0.20' },
  ]);
  assert.equal(r.totalPago, 0.3); // 0.1 + 0.2 exato via centavos
});

// ── Normalizações ───────────────────────────────────────────────────────────
test('normalizações caem no default para valores desconhecidos', () => {
  assert.equal(sub.normalizarStatus('xpto'), 'prevista');
  assert.equal(sub.normalizarStatus('paga'), 'paga');
  assert.equal(sub.normalizarStatusCadastro('xpto'), 'ativo');
  assert.equal(sub.normalizarStatusCadastro('inativo'), 'inativo');
});
