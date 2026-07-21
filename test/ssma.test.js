'use strict';
/**
 * Regras puras de SSMA (lib/ssma.js). Um teste por regra (BR-SSMA-001..003).
 * A orquestração HTTP do handler é coberta em test/ssma-handler.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const ssma = require('../lib/ssma');

// ── BR-SSMA-001: Taxa de Frequência ─────────────────────────────────────────
test('calcTF: acidentes com afastamento por milhão de HHT', () => {
  // 1 acidente / 100.000 HHT → 10 por milhão.
  assert.equal(ssma.calcTF(1, 100000), 10);
  assert.equal(ssma.calcTF(3, 600000), 5);
});

test('calcTF: HHT 0 ou negativo devolve 0 (sem base para dividir)', () => {
  assert.equal(ssma.calcTF(2, 0), 0);
  assert.equal(ssma.calcTF(2, -50), 0);
});

test('calcTF: arredonda a 2 casas', () => {
  // 1 * 1e6 / 3 = 333333.333… → 333333.33
  assert.equal(ssma.calcTF(1, 3), 333333.33);
});

// ── BR-SSMA-002: Taxa de Gravidade ──────────────────────────────────────────
test('calcTG: dias perdidos por milhão de HHT', () => {
  assert.equal(ssma.calcTG(5, 100000), 50);
});

test('calcTG: HHT 0 devolve 0', () => {
  assert.equal(ssma.calcTG(10, 0), 0);
});

// ── BR-SSMA-003: Resumo da obra ─────────────────────────────────────────────
test('resumo: conta total, por tipo, por status, afastamento, dias e taxas', () => {
  const ocorrencias = [
    { tipo: 'acidente', status: 'encerrado', comAfastamento: true, diasPerdidos: 5 },
    { tipo: 'desvio', status: 'aberto', comAfastamento: false, diasPerdidos: 0 },
    { tipo: 'quase_acidente', status: 'em_investigacao', comAfastamento: false, diasPerdidos: 0 },
  ];
  const r = ssma.resumo(ocorrencias, 100000);
  assert.equal(r.total, 3);
  assert.equal(r.porTipo.acidente, 1);
  assert.equal(r.porTipo.desvio, 1);
  assert.equal(r.porTipo.quase_acidente, 1);
  assert.equal(r.porTipo.incidente, 0);
  assert.equal(r.porStatus.aberto, 1);
  assert.equal(r.porStatus.em_investigacao, 1);
  assert.equal(r.porStatus.encerrado, 1);
  assert.equal(r.comAfastamento, 1);
  assert.equal(r.diasPerdidos, 5);
  // TF = 1 afastamento por 100.000 HHT → 10; TG = 5 dias → 50.
  assert.equal(r.tf, 10);
  assert.equal(r.tg, 50);
});

test('resumo: sem HHT, taxas ficam 0 mas contagens continuam', () => {
  const r = ssma.resumo(
    [{ tipo: 'acidente', status: 'aberto', comAfastamento: true, diasPerdidos: 3 }],
    0
  );
  assert.equal(r.total, 1);
  assert.equal(r.comAfastamento, 1);
  assert.equal(r.diasPerdidos, 3);
  assert.equal(r.tf, 0);
  assert.equal(r.tg, 0);
});

test('resumo: entrada vazia/ inválida devolve zeros', () => {
  const r = ssma.resumo(null, 1000);
  assert.equal(r.total, 0);
  assert.equal(r.comAfastamento, 0);
  assert.equal(r.diasPerdidos, 0);
  assert.equal(r.tf, 0);
  assert.equal(r.tg, 0);
});

// ── Normalização de vocabulário ─────────────────────────────────────────────
test('normalizações caem no default para valores desconhecidos', () => {
  assert.equal(ssma.normalizarTipo('xpto'), 'desvio');
  assert.equal(ssma.normalizarGravidade('xpto'), 'media');
  assert.equal(ssma.normalizarStatus('xpto'), 'aberto');
  assert.equal(ssma.normalizarTipo('acidente'), 'acidente');
  assert.equal(ssma.normalizarStatus('encerrado'), 'encerrado');
});
