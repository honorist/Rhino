'use strict';
/**
 * @file db/repos/caixa.js — findPageKeyset() (item 10 do plano
 * async-wandering-kite / TODO P1-3 da DB review). Monkeypatcha `db` (mesmo
 * padrão de test/audit-list-events.test.js) — não toca Postgres.
 */
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const caixa = require('../db/repos/caixa');

const orig = { getMany: db.getMany };
afterEach(() => Object.assign(db, orig));

test('sem cursor (1ª página): sem WHERE de seek', async () => {
  let capturedSql = '', capturedVals = [];
  db.getMany = async (sql, vals) => { capturedSql = sql; capturedVals = vals; return []; };

  await caixa.findPageKeyset({ limit: 50 });

  assert.ok(!capturedSql.includes('WHERE'), 'sem cursor não deve ter WHERE');
  assert.ok(capturedSql.includes('ORDER BY date DESC, created_at DESC, id DESC'));
  assert.deepStrictEqual(capturedVals, [50]);
});

test('com cursor: seek por (date, created_at, id), sem OFFSET', async () => {
  let capturedSql = '', capturedVals = [];
  db.getMany = async (sql, vals) => { capturedSql = sql; capturedVals = vals; return []; };

  await caixa.findPageKeyset({
    limit: 20,
    after: { date: '2026-08-01', createdAt: '2026-08-01T10:00:00.000Z', id: 'cxa_9' },
  });

  assert.ok(capturedSql.includes('(date, created_at, id) < ($1, $2, $3)'));
  assert.ok(!capturedSql.includes('OFFSET'));
  assert.deepStrictEqual(capturedVals, ['2026-08-01', '2026-08-01T10:00:00.000Z', 'cxa_9', 20]);
});

test('limit é capado em 500 e nunca fica abaixo de 1', async () => {
  let vals500, vals1;
  db.getMany = async (sql, v) => { vals500 = v; return []; };
  await caixa.findPageKeyset({ limit: 9999 });
  assert.deepStrictEqual(vals500, [500]);

  db.getMany = async (sql, v) => { vals1 = v; return []; };
  await caixa.findPageKeyset({ limit: -5 });
  assert.deepStrictEqual(vals1, [1]);
});

test('limit inválido (não-inteiro) cai no default de 100', async () => {
  let capturedVals;
  db.getMany = async (sql, v) => { capturedVals = v; return []; };
  await caixa.findPageKeyset({ limit: 'abc' });
  assert.deepStrictEqual(capturedVals, [100]);
});

test('after incompleto (falta id) é ignorado — trata como 1ª página', async () => {
  let capturedSql;
  db.getMany = async (sql) => { capturedSql = sql; return []; };
  await caixa.findPageKeyset({ limit: 10, after: { date: '2026-08-01', createdAt: 'x' } });
  assert.ok(!capturedSql.includes('WHERE'));
});
