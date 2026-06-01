'use strict';
/**
 * @file Testes da lib de dinheiro (lib/money.js). Funções puras — sem banco.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const money = require('../lib/money');

test('round2 corrige drift de ponto flutuante', () => {
  assert.strictEqual(money.round2(0.1 + 0.2), 0.3);     // 0.30000000000000004 → 0.3
  assert.strictEqual(money.round2(1234.5678), 1234.57);
  assert.strictEqual(money.round2(2.005), 2.01);        // arredonda meio p/ cima
  assert.strictEqual(money.round2(100), 100);
});

test('round2 de inválido/Infinity vira 0', () => {
  assert.strictEqual(money.round2(NaN), 0);
  assert.strictEqual(money.round2('abc'), 0);
  assert.strictEqual(money.round2(Infinity), 0);
});

test('parse: lenient (inválido → 0) e limpo (2 casas)', () => {
  assert.strictEqual(money.parse('1234.5678'), 1234.57);
  assert.strictEqual(money.parse('abc'), 0);            // mesmo contrato do parseFloat||0
  assert.strictEqual(money.parse(''), 0);
  assert.strictEqual(money.parse('10.999'), 11);
  assert.strictEqual(money.parse(50), 50);
});

test('sum soma sem acumular drift', () => {
  // 0.1 dez vezes = 1.0 exato (parseFloat somaria 0.9999999999999999)
  assert.strictEqual(money.sum([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]), 1);
  assert.strictEqual(money.sum([{ v: 10.10 }, { v: 20.20 }, { v: 0.70 }], (x) => x.v), 31);
  assert.strictEqual(money.sum([]), 0);
  assert.strictEqual(money.sum(null), 0);
});

test('toCents / fromCents round-trip', () => {
  assert.strictEqual(money.toCents(1234.56), 123456);
  assert.strictEqual(money.fromCents(123456), 1234.56);
  assert.strictEqual(money.fromCents(money.toCents(99.99)), 99.99);
});
