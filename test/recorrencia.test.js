'use strict';
// node --test test/recorrencia.test.js  (sem servidor, sem DB)
//
// Regra: recorrência de contas a pagar — cálculo da próxima data de vencimento.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { proximaData } = require('../lib/recorrencia');

test('proximaData — semanal soma 7 dias', () => {
  assert.equal(proximaData('2026-05-22', 'semanal'), '2026-05-29');
});

test('proximaData — quinzenal soma 15 dias', () => {
  assert.equal(proximaData('2026-05-22', 'quinzenal'), '2026-06-06');
});

test('proximaData — mensal soma 1 mês', () => {
  assert.equal(proximaData('2026-05-22', 'mensal'), '2026-06-22');
});

test('proximaData — trimestral soma 3 meses', () => {
  assert.equal(proximaData('2026-05-22', 'trimestral'), '2026-08-22');
});

test('proximaData — semestral soma 6 meses', () => {
  assert.equal(proximaData('2026-05-22', 'semestral'), '2026-11-22');
});

test('proximaData — anual soma 1 ano', () => {
  assert.equal(proximaData('2026-05-22', 'anual'), '2027-05-22');
});

test('proximaData — mensal cruza a virada do ano', () => {
  assert.equal(proximaData('2026-12-15', 'mensal'), '2027-01-15');
});

test('proximaData — periodicidade desconhecida/ausente cai em mensal (default)', () => {
  assert.equal(proximaData('2026-05-22', 'xyz'), '2026-06-22');
  assert.equal(proximaData('2026-05-22', undefined), '2026-06-22');
});

test('proximaData — comportamento atual de fim de mês (31/01 transborda fevereiro)', () => {
  // setMonth com dia 31 transborda fevereiro — comportamento herdado de
  // _calcProximaData. O teste TRAVA esse comportamento; mudá-lo é decisão consciente.
  assert.equal(proximaData('2026-01-31', 'mensal'), '2026-03-03');
});
