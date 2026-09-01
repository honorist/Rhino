'use strict';
/**
 * Regras puras da ferramentaria (lib/ferramenta.js). Um teste por regra
 * (BR-FERR-001..003). Cada assert falharia se a regra estivesse trocada.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const ferr = require('../lib/ferramenta');

// ── BR-FERR-001: Próxima calibração ─────────────────────────────────────────
test('BR-FERR-001: proximaCalibracao: soma a periodicidade em meses à última data', () => {
  assert.equal(ferr.proximaCalibracao('2026-01-15', 12), '2027-01-15');
  assert.equal(ferr.proximaCalibracao('2026-01-15', 6), '2026-07-15');
});

test('BR-FERR-001: proximaCalibracao: ajusta ao último dia do mês (não inventa 31/fev)', () => {
  // 31/jan + 1 mês → 28/fev (2026 não é bissexto).
  assert.equal(ferr.proximaCalibracao('2026-01-31', 1), '2026-02-28');
  // 31/jan + 1 mês em ano bissexto → 29/fev.
  assert.equal(ferr.proximaCalibracao('2024-01-31', 1), '2024-02-29');
});

test('BR-FERR-001: proximaCalibracao: periodicidade ausente/≤0 cai no padrão de 12 meses', () => {
  assert.equal(ferr.proximaCalibracao('2026-03-10', 0), '2027-03-10');
  assert.equal(ferr.proximaCalibracao('2026-03-10', undefined), '2027-03-10');
  assert.equal(ferr.proximaCalibracao('2026-03-10', -3), '2027-03-10');
});

test('BR-FERR-001: proximaCalibracao: sem última data válida devolve null', () => {
  assert.equal(ferr.proximaCalibracao('', 12), null);
  assert.equal(ferr.proximaCalibracao(null, 12), null);
  assert.equal(ferr.proximaCalibracao('data-invalida', 12), null);
});

// ── BR-FERR-002: Situação de calibração ─────────────────────────────────────
test('BR-FERR-002: situacaoCalibracao: em_dia quando falta mais de 30 dias', () => {
  assert.equal(ferr.situacaoCalibracao('2026-09-01', '2026-07-21'), 'em_dia');
  // 31 dias à frente → ainda em_dia (limite exclusivo em 30).
  assert.equal(ferr.situacaoCalibracao('2026-08-21', '2026-07-21'), 'em_dia');
});

test('BR-FERR-002: situacaoCalibracao: vencendo quando falta 30 dias ou menos (inclusive hoje)', () => {
  assert.equal(ferr.situacaoCalibracao('2026-08-20', '2026-07-21'), 'vencendo'); // 30 dias
  assert.equal(ferr.situacaoCalibracao('2026-08-01', '2026-07-21'), 'vencendo'); // 11 dias
  assert.equal(ferr.situacaoCalibracao('2026-07-21', '2026-07-21'), 'vencendo'); // vence hoje
});

test('BR-FERR-002: situacaoCalibracao: vencida quando a validade já passou', () => {
  assert.equal(ferr.situacaoCalibracao('2026-07-20', '2026-07-21'), 'vencida');
});

test('BR-FERR-002: situacaoCalibracao: validade ausente/inválida é vencida (sem certificado válido)', () => {
  assert.equal(ferr.situacaoCalibracao(null, '2026-07-21'), 'vencida');
  assert.equal(ferr.situacaoCalibracao('', '2026-07-21'), 'vencida');
});

// ── ultimaCalibracao: escolhe a aprovada mais recente ───────────────────────
test('ultimaCalibracao: pega a aprovada mais recente e ignora reprovadas', () => {
  const cals = [
    { data: '2025-01-10', validade: '2026-01-10', resultado: 'aprovado' },
    { data: '2026-01-10', validade: '2027-01-10', resultado: 'aprovado' },
    { data: '2026-06-10', validade: '2027-06-10', resultado: 'reprovado' },
  ];
  const u = ferr.ultimaCalibracao(cals);
  assert.equal(u.validade, '2027-01-10'); // a de 2026-06 é reprovada → não conta
});

test('ultimaCalibracao: lista vazia/sem aprovadas devolve null', () => {
  assert.equal(ferr.ultimaCalibracao([]), null);
  assert.equal(ferr.ultimaCalibracao([{ data: '2026-01-01', resultado: 'reprovado' }]), null);
});

// ── BR-FERR-003: Resumo ─────────────────────────────────────────────────────
test('BR-FERR-003: resumo: conta por status e por situação de calibração', () => {
  const ferramentas = [
    { id: 'f1', status: 'disponivel', requerCalibracao: true, periodicidadeMeses: 12 },
    { id: 'f2', status: 'em_uso', requerCalibracao: true, periodicidadeMeses: 12 },
    { id: 'f3', status: 'em_calibracao', requerCalibracao: true, periodicidadeMeses: 6 },
    { id: 'f4', status: 'inativa', requerCalibracao: false }, // não entra em porSituacao
  ];
  const calibracoesPorFerramenta = {
    f1: [{ data: '2026-06-01', validade: '2027-06-01', resultado: 'aprovado' }], // em_dia
    f2: [{ data: '2026-06-20', validade: '2026-08-01', resultado: 'aprovado' }], // vencendo
    f3: [{ data: '2025-06-01', validade: '2026-06-01', resultado: 'aprovado' }], // vencida
    // f4 sem calibração e não requer
  };
  const r = ferr.resumo(ferramentas, calibracoesPorFerramenta, '2026-07-21');
  assert.equal(r.total, 4);
  assert.equal(r.requerCalibracao, 3);
  assert.equal(r.porStatus.disponivel, 1);
  assert.equal(r.porStatus.em_uso, 1);
  assert.equal(r.porStatus.em_calibracao, 1);
  assert.equal(r.porStatus.inativa, 1);
  assert.equal(r.porSituacao.em_dia, 1);
  assert.equal(r.porSituacao.vencendo, 1);
  assert.equal(r.porSituacao.vencida, 1);
});

test('BR-FERR-003: resumo: ferramenta que requer calibração e nunca calibrou conta como vencida', () => {
  const r = ferr.resumo(
    [{ id: 'f1', status: 'disponivel', requerCalibracao: true, periodicidadeMeses: 12 }],
    {}, // sem calibrações
    '2026-07-21'
  );
  assert.equal(r.requerCalibracao, 1);
  assert.equal(r.porSituacao.vencida, 1);
  assert.equal(r.porSituacao.em_dia, 0);
});

test('BR-FERR-003: resumo: entrada vazia/ inválida devolve zeros', () => {
  const r = ferr.resumo(null, null, '2026-07-21');
  assert.equal(r.total, 0);
  assert.equal(r.requerCalibracao, 0);
  assert.equal(r.porStatus.disponivel, 0);
  assert.equal(r.porSituacao.vencida, 0);
});

// ── Normalização de vocabulário ─────────────────────────────────────────────
test('normalizações caem no default para valores desconhecidos', () => {
  assert.equal(ferr.normalizarStatus('xpto'), 'disponivel');
  assert.equal(ferr.normalizarStatus('em_uso'), 'em_uso');
  assert.equal(ferr.normalizarResultado('xpto'), 'aprovado');
  assert.equal(ferr.normalizarResultado('reprovado'), 'reprovado');
});
