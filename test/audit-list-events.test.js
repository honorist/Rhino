'use strict';
/**
 * @file lib/audit.js — listEvents() paginação por cursor (item 9 do plano
 * async-wandering-kite / TODO P1-4 da DB review). Monkeypatcha `db`
 * (mesmo padrão de test/dashboard-operacional.test.js) — não toca Postgres,
 * só verifica QUAL sql/params a função monta pra cada modo de paginação.
 */
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const audit = require('../lib/audit');

const orig = { getOne: db.getOne, getMany: db.getMany };
afterEach(() => Object.assign(db, orig));

test('sem cursor (1ª página): usa OFFSET, sem condição de seek', async () => {
  const calls = [];
  db.getOne = async (sql, vals) => { calls.push(['getOne', sql, vals]); return { n: 0 }; };
  db.getMany = async (sql, vals) => { calls.push(['getMany', sql, vals]); return []; };

  await audit.listEvents({ limit: 20, offset: 0 });

  const rowCall = calls.find((c) => c[0] === 'getMany');
  assert.ok(rowCall[1].includes('OFFSET'), 'sem cursor deve paginar por OFFSET');
  assert.ok(!rowCall[1].includes('(ts, id) <'), 'sem cursor não deve ter condição de seek');
  assert.deepStrictEqual(rowCall[2], [20, 0]); // limit, offset — sem outro filtro
});

test('com cursor (afterTs/afterId): usa seek por (ts,id), sem OFFSET', async () => {
  const calls = [];
  db.getOne = async (sql, vals) => { calls.push(['getOne', sql, vals]); return { n: 42 }; };
  db.getMany = async (sql, vals) => { calls.push(['getMany', sql, vals]); return []; };

  await audit.listEvents({ limit: 20, afterTs: '2026-08-01T10:00:00.000Z', afterId: 555 });

  const rowCall = calls.find((c) => c[0] === 'getMany');
  assert.ok(rowCall[1].includes('(ts, id) <'), 'com cursor deve usar seek por (ts, id)');
  assert.ok(!rowCall[1].includes('OFFSET'), 'com cursor não deve usar OFFSET');
  assert.deepStrictEqual(rowCall[2], ['2026-08-01T10:00:00.000Z', 555, 20]); // afterTs, afterId, limit

  // O total (COUNT) reflete só os filtros — não leva o cursor.
  const countCall = calls.find((c) => c[0] === 'getOne');
  assert.deepStrictEqual(countCall[2], []);
});

test('cursor + filtro (entity): condição de seek some DEPOIS do filtro nos params', async () => {
  const calls = [];
  db.getOne = async (sql, vals) => { calls.push(['getOne', sql, vals]); return { n: 1 }; };
  db.getMany = async (sql, vals) => { calls.push(['getMany', sql, vals]); return []; };

  await audit.listEvents({ entity: 'caixa', limit: 10, afterTs: '2026-08-01T10:00:00.000Z', afterId: 9 });

  const rowCall = calls.find((c) => c[0] === 'getMany');
  assert.deepStrictEqual(rowCall[2], ['caixa', '2026-08-01T10:00:00.000Z', 9, 10]);
  assert.ok(rowCall[1].includes('entity = $1'));
  assert.ok(rowCall[1].includes('(ts, id) < ($2, $3)'));

  // total continua só com o filtro de entity, sem o cursor.
  const countCall = calls.find((c) => c[0] === 'getOne');
  assert.deepStrictEqual(countCall[2], ['caixa']);
});

test('ORDER BY tem ts DESC, id DESC (desempate estável em timestamp colidindo)', async () => {
  let rowSql = '';
  db.getOne = async () => ({ n: 0 });
  db.getMany = async (sql) => { rowSql = sql; return []; };

  await audit.listEvents({ limit: 5 });
  assert.match(rowSql, /ORDER BY ts DESC, id DESC/);
});

test('devolve { rows, total } — total 0 quando db.getOne devolve null', async () => {
  db.getOne = async () => null;
  db.getMany = async () => [{ id: 1 }];

  const { rows, total } = await audit.listEvents({});
  assert.strictEqual(total, 0);
  assert.strictEqual(rows.length, 1);
});
