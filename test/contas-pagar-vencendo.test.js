'use strict';
/**
 * @file db/repos/contas_pagar.js — findVencendo() (item 11 do plano
 * async-wandering-kite / TODO P2-5 da DB review: trocar concatenação de
 * string por multiplicação numérica de INTERVAL, 100% parametrizada).
 */
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const contasPagar = require('../db/repos/contas_pagar');

const orig = { getMany: db.getMany };
afterEach(() => Object.assign(db, orig));

test('monta o intervalo por multiplicação numérica, sem concatenar string na query', async () => {
  let capturedSql = '', capturedVals = [];
  db.getMany = async (sql, vals) => { capturedSql = sql; capturedVals = vals; return []; };

  await contasPagar.findVencendo(45);

  assert.ok(capturedSql.includes("($1::int * INTERVAL '1 day')"), 'deve usar multiplicação numérica de INTERVAL');
  assert.ok(!capturedSql.includes("||"), "não deve mais concatenar string (' || ') pra montar o intervalo");
  // O valor vai como NÚMERO puro no parâmetro — não mais pré-formatado como
  // string pra caber numa concatenação SQL.
  assert.deepStrictEqual(capturedVals, [45]);
  assert.strictEqual(typeof capturedVals[0], 'number');
});

test('default de 30 dias quando não passa argumento', async () => {
  let capturedVals;
  db.getMany = async (sql, vals) => { capturedVals = vals; return []; };
  await contasPagar.findVencendo();
  assert.deepStrictEqual(capturedVals, [30]);
});
