'use strict';
/**
 * @file Testes do gerador de IDs (lib/id.js). Formato `<prefixo>_<timestamp36><random8hex>`.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { generateId } = require('../lib/id');

test('generateId: começa com o prefixo + underscore', () => {
  assert.ok(generateId('cp').startsWith('cp_'));
  assert.ok(generateId('rdo').startsWith('rdo_'));
});

test('generateId: formato timestamp36 + 8 hex no fim', () => {
  assert.match(generateId('x'), /^x_[0-9a-z]+[0-9a-f]{8}$/);
});

test('generateId: termina em 8 caracteres hex aleatórios', () => {
  const id = generateId('p');
  assert.match(id.slice(-8), /^[0-9a-f]{8}$/);
});

test('generateId: único entre muitas chamadas', () => {
  const ids = new Set();
  for (let i = 0; i < 2000; i++) ids.add(generateId('u'));
  assert.strictEqual(ids.size, 2000, 'todos os IDs devem ser distintos');
});
