'use strict';
/**
 * Regras puras de Controle de EPIs (lib/epi.js). Sem I/O; o "hoje" é injetado.
 * Um teste por regra (BR-EPI-001..003) + o cálculo da data de troca prevista.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const epi = require('../lib/epi');

// ── dataTrocaPrevista: entrega + vida útil (meses), com clamp de fim de mês ───
test('dataTrocaPrevista soma meses preservando o dia', () => {
  assert.equal(epi.dataTrocaPrevista('2026-01-15', 6), '2026-07-15');
});

test('dataTrocaPrevista vira o ano quando os meses ultrapassam dezembro', () => {
  assert.equal(epi.dataTrocaPrevista('2026-11-10', 3), '2027-02-10');
});

test('dataTrocaPrevista faz clamp para o último dia do mês de destino', () => {
  // 31/01 + 1 mês não existe em fevereiro → 28/02.
  assert.equal(epi.dataTrocaPrevista('2026-01-31', 1), '2026-02-28');
});

test('dataTrocaPrevista sem data ou sem vida útil → null', () => {
  assert.equal(epi.dataTrocaPrevista(null, 6), null);
  assert.equal(epi.dataTrocaPrevista('2026-01-15', 0), null);
  assert.equal(epi.dataTrocaPrevista('2026-01-15', null), null);
});

// ── BR-EPI-001: precisa de troca (não devolvido + troca no passado) ──────────
test('BR-EPI-001: troca no passado e não devolvido → precisa troca', () => {
  assert.equal(epi.precisaTroca('2026-07-01', '2026-07-21', false), true);
});

test('BR-EPI-001: troca no futuro → não precisa', () => {
  assert.equal(epi.precisaTroca('2026-08-01', '2026-07-21', false), false);
});

test('BR-EPI-001: devolvido nunca precisa de troca, mesmo vencido', () => {
  assert.equal(epi.precisaTroca('2020-01-01', '2026-07-21', true), false);
});

test('BR-EPI-001: sem data de troca prevista → nunca vence sozinho', () => {
  assert.equal(epi.precisaTroca(null, '2026-07-21', false), false);
});

// ── BR-EPI-002: status da ficha (devolvido > trocar > ativo) ─────────────────
test('BR-EPI-002: devolvido tem prioridade sobre troca vencida', () => {
  const e = { dataTrocaPrevista: '2020-01-01', devolvido: true };
  assert.equal(epi.statusEpi(e, '2026-07-21'), 'devolvido');
});

test('BR-EPI-002: não devolvido com troca vencida → trocar', () => {
  const e = { dataTrocaPrevista: '2026-07-01', devolvido: false };
  assert.equal(epi.statusEpi(e, '2026-07-21'), 'trocar');
});

test('BR-EPI-002: em dia e não devolvido → ativo', () => {
  const e = { dataTrocaPrevista: '2026-12-01', devolvido: false };
  assert.equal(epi.statusEpi(e, '2026-07-21'), 'ativo');
});

// ── BR-EPI-003: resumo particiona o total ────────────────────────────────────
test('BR-EPI-003: resumo conta total/ativos/aTrocar/devolvidos e particiona', () => {
  const hoje = '2026-07-21';
  const entregas = [
    { dataTrocaPrevista: '2026-12-01', devolvido: false }, // ativo
    { dataTrocaPrevista: '2026-07-01', devolvido: false }, // trocar
    { dataTrocaPrevista: '2020-01-01', devolvido: true }, // devolvido
    { dataTrocaPrevista: null, devolvido: false }, // ativo (sem prazo)
  ];
  const r = epi.resumo(entregas, hoje);
  assert.equal(r.total, 4);
  assert.equal(r.ativos, 2);
  assert.equal(r.aTrocar, 1);
  assert.equal(r.devolvidos, 1);
  assert.equal(r.ativos + r.aTrocar + r.devolvidos, r.total);
});

test('BR-EPI-003: lista vazia → tudo zero', () => {
  assert.deepEqual(epi.resumo([], '2026-07-21'), {
    total: 0,
    ativos: 0,
    aTrocar: 0,
    devolvidos: 0,
  });
});
