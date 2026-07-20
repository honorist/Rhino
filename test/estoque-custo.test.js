'use strict';
/**
 * Custo médio ponderado (lib/estoque-custo.js) — a regra de dinheiro do
 * recebimento de compra. Se esta fórmula erra, o custo médio do item fica
 * errado e contamina a margem por obra e o valor do estoque no dashboard.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { custoMedioPonderado } = require('../lib/estoque-custo');

test('primeira entrada (estoque zerado) adota o preço da entrada', () => {
  // Item novo: saldo passa a ser 10, nada antes.
  const c = custoMedioPonderado({
    saldoTotal: 10,
    qtdEntrada: 10,
    custoMedioAnterior: 0,
    precoUnitEntrada: 5,
  });
  assert.strictEqual(c, 5);
});

test('média ponderada entre saldo anterior e nova entrada', () => {
  // Tinha 10 un a R$ 5 (=50). Entram 10 un a R$ 15 (=150). Total 20 un, R$ 200 → R$ 10.
  const c = custoMedioPonderado({
    saldoTotal: 20,
    qtdEntrada: 10,
    custoMedioAnterior: 5,
    precoUnitEntrada: 15,
  });
  assert.strictEqual(c, 10);
});

test('entrada ao mesmo custo médio mantém o custo', () => {
  const c = custoMedioPonderado({
    saldoTotal: 30,
    qtdEntrada: 10,
    custoMedioAnterior: 8,
    precoUnitEntrada: 8,
  });
  assert.strictEqual(c, 8);
});

test('quantidades fracionárias', () => {
  // 2,5 un a R$ 4 (=10) + 2,5 un a R$ 6 (=15) = 5 un, R$ 25 → R$ 5.
  const c = custoMedioPonderado({
    saldoTotal: 5,
    qtdEntrada: 2.5,
    custoMedioAnterior: 4,
    precoUnitEntrada: 6,
  });
  assert.strictEqual(c, 5);
});

test('saldo total zero cai no preço da entrada (sem divisão por zero)', () => {
  const c = custoMedioPonderado({
    saldoTotal: 0,
    qtdEntrada: 0,
    custoMedioAnterior: 9,
    precoUnitEntrada: 7,
  });
  assert.strictEqual(c, 7);
  assert.ok(Number.isFinite(c));
});

test('strings numéricas (vindas do Postgres) são coeridas', () => {
  const c = custoMedioPonderado({
    saldoTotal: '20',
    qtdEntrada: '10',
    custoMedioAnterior: '5',
    precoUnitEntrada: '15',
  });
  assert.strictEqual(c, 10);
});
