'use strict';
/**
 * @file lib/dashboard-operacional.js — mesma cobertura de
 * test/dashboard-operacional.test.js (via o handler), mas testando a função
 * pura direto, sem monkeypatchar o módulo `db` compartilhado. Extraído de
 * handlers/dashboards.js no item 5 do plano async-wandering-kite.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { getDashboardOperacional } = require('../lib/dashboard-operacional');

test('zero-state: db sem dado nenhum devolve todo mundo zerado', async () => {
  const db = { getOne: async () => null, getMany: async () => [] };
  const data = await getDashboardOperacional(db);

  assert.strictEqual(data.combustivel.mesAtual, 0);
  assert.strictEqual(data.compras.abertas, 0);
  assert.strictEqual(data.manutEquip.atrasadas, 0);
  assert.strictEqual(data.docsKpi.vencidos, 0);
  assert.strictEqual(data.candidatosParados, 0);
  assert.deepStrictEqual(data.topCombustivel, []);
});

test('resiliência: query lançando não derruba as outras (sem try/catch do caller)', async () => {
  const db = {
    getOne: async () => {
      throw new Error('relation does not exist');
    },
    getMany: async () => {
      throw new Error('boom');
    },
  };
  // Não deve lançar — cada query tem seu próprio safe() interno.
  const data = await getDashboardOperacional(db);
  assert.strictEqual(data.propostasKpi.emAndamento, 0);
  assert.strictEqual(data.revisoes.vencidas, 0);
});
