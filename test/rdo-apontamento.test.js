'use strict';
/**
 * Apontamento de HH por colaborador × atividade (lib/rdo-apontamento.js) — um
 * teste por regra BR-APONT. É o que liga horas a pessoas e etapas do cronograma
 * e alimenta a produtividade da obra (previsto × realizado).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarApontamento, normalizarApontamentos, computeProdutividade } = require('../lib/rdo-apontamento');

// ── BR-APONT-001: horas nunca negativas, 2 casas ────────────────────────────
test('BR-APONT-001: horas negativas viram 0 (linha descartada) e fração arredonda', () => {
  assert.equal(normalizarApontamento({ funcao: 'Soldador', horas: -5 }), null);
  const a = normalizarApontamento({ funcao: 'Soldador', horas: '8.256' });
  assert.equal(a.horas, 8.26);
});

// ── BR-APONT-002: identidade + horas obrigatórias ───────────────────────────
test('BR-APONT-002: sem recurso e sem função → descartado', () => {
  assert.equal(normalizarApontamento({ horas: 8 }), null);
});
test('BR-APONT-002: com horas mas sem identidade → descartado; com identidade e sem horas → descartado', () => {
  assert.equal(normalizarApontamento({ atividadeId: 'a1', horas: 8 }), null, 'atividade não é identidade de pessoa');
  assert.equal(normalizarApontamento({ recursoId: 'r1', horas: 0 }), null);
});
test('BR-APONT-002: recurso OU função basta como identidade', () => {
  assert.ok(normalizarApontamento({ recursoId: 'r1', horas: 8 }));
  assert.ok(normalizarApontamento({ funcao: 'Ajudante', horas: 8 }));
});

test('normalizarApontamentos: filtra linhas vazias e normaliza ids', () => {
  const out = normalizarApontamentos([
    { recursoId: 'r1', atividadeId: 'a1', funcao: 'Soldador', horas: 8 },
    { funcao: '', horas: 0 }, // vazia
    { recursoId: 'r2', horas: 4.5 },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].recursoId, 'r1');
  assert.equal(out[1].atividadeId, null);
});

// ── BR-APONT-003/004: produtividade previsto × realizado ────────────────────
const ATIVS = [
  { id: 'a1', nome: 'Montagem', hhPlan: 100 },
  { id: 'a2', nome: 'Solda', hhPlan: 50 },
  { id: 'a3', nome: 'Pintura', hhPlan: 0 }, // sem plano
];

test('BR-APONT-003: HH realizado por atividade = Σ horas apontadas', () => {
  const r = computeProdutividade({
    atividades: ATIVS,
    apontamentos: [
      { atividadeId: 'a1', horas: 40 },
      { atividadeId: 'a1', horas: 30 },
      { atividadeId: 'a2', horas: 20 },
    ],
  });
  const byId = Object.fromEntries(r.porAtividade.map((a) => [a.atividadeId, a]));
  assert.equal(byId.a1.hhReal, 70);
  assert.equal(byId.a2.hhReal, 20);
});

test('BR-APONT-004: pct = real ÷ previsto × 100; saldo = previsto − real', () => {
  const r = computeProdutividade({
    atividades: ATIVS,
    apontamentos: [{ atividadeId: 'a1', horas: 70 }],
  });
  const a1 = r.porAtividade.find((a) => a.atividadeId === 'a1');
  assert.equal(a1.pct, 70);
  assert.equal(a1.saldo, 30);
  assert.equal(a1.status, 'ok');
});

test('BR-APONT-004: realizado acima do previsto → status estourado', () => {
  const r = computeProdutividade({
    atividades: ATIVS,
    apontamentos: [{ atividadeId: 'a2', horas: 65 }],
  });
  const a2 = r.porAtividade.find((a) => a.atividadeId === 'a2');
  assert.equal(a2.status, 'estourado');
  assert.equal(a2.saldo, -15);
  assert.equal(a2.pct, 130);
});

test('BR-APONT-004: atividade sem plano → pct 0 e status sem_plano (não divide por zero)', () => {
  const r = computeProdutividade({
    atividades: ATIVS,
    apontamentos: [{ atividadeId: 'a3', horas: 10 }],
  });
  const a3 = r.porAtividade.find((a) => a.atividadeId === 'a3');
  assert.equal(a3.pct, 0);
  assert.equal(a3.status, 'sem_plano');
  assert.equal(a3.hhReal, 10, 'realizado ainda é contado');
});

// ── BR-APONT-005: apontamentos sem atividade não se perdem ──────────────────
test('BR-APONT-005: horas sem atividade somam no bucket semAtividade e no total', () => {
  const r = computeProdutividade({
    atividades: ATIVS,
    apontamentos: [
      { atividadeId: 'a1', horas: 40 },
      { atividadeId: null, horas: 12 },
      { horas: 8 }, // idem, sem atividade
    ],
  });
  assert.equal(r.semAtividade, 20);
  assert.equal(r.totalHhReal, 60, '40 na a1 + 20 sem atividade');
  assert.equal(r.totalHhPlan, 150, '100 + 50 + 0');
});

test('zero-state: sem atividades e sem apontamentos não quebra', () => {
  const r = computeProdutividade({});
  assert.deepEqual(r.porAtividade, []);
  assert.equal(r.semAtividade, 0);
  assert.equal(r.totalHhPlan, 0);
  assert.equal(r.totalHhReal, 0);
});
