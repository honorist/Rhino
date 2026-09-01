'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calcAderenciaPct } = require('../handlers/contract-rdos');

test('calcAderenciaPct — feitos/esperados arredondado', () => {
  assert.equal(calcAderenciaPct(7, 10), 70);
  assert.equal(calcAderenciaPct(10, 10), 100);
  assert.equal(calcAderenciaPct(0, 10), 0);
});

test('calcAderenciaPct — esperados zero devolve null, não 100 (sem obra ativa pra medir)', () => {
  assert.equal(calcAderenciaPct(0, 0), null);
});
