'use strict';
/**
 * @file lib/audit.js#purgeOldDetails — retenção de auditoria (achado 2.1 da
 * varredura 2026-09-08: steering §12 promete "retenção de auditoria/IP com
 * purga automática", mas audit_log crescia pra sempre). Monkeypatcha `db`
 * (mesmo padrão de test/audit-list-events.test.js) — não toca Postgres.
 *
 * Design: MASCARA (não apaga a linha) ip/body/before_state além da janela de
 * retenção — preserva o traço "quem fez o quê, quando" (valor de auditoria de
 * longo prazo) mas derruba o payload mais sensível/volumoso (IP, diffs
 * completos), que é o que a promessa do steering mira.
 */
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const audit = require('../lib/audit');

const orig = { query: db.query };
afterEach(() => Object.assign(db, orig));

test('purgeOldDetails — usa UPDATE (mascara), não DELETE (preserva a linha)', async () => {
  let captured = null;
  db.query = async (sql, vals) => {
    captured = { sql, vals };
    return { rowCount: 3 };
  };
  const n = await audit.purgeOldDetails(180);
  assert.equal(n, 3);
  assert.match(captured.sql, /UPDATE audit_log/);
  assert.doesNotMatch(captured.sql, /DELETE FROM audit_log/);
});

test('purgeOldDetails — mascara ip, body e before_state pra NULL', async () => {
  let captured = null;
  db.query = async (sql, vals) => { captured = { sql, vals }; return { rowCount: 0 }; };
  await audit.purgeOldDetails(180);
  assert.match(captured.sql, /ip\s*=\s*NULL/);
  assert.match(captured.sql, /body\s*=\s*NULL/);
  assert.match(captured.sql, /before_state\s*=\s*NULL/);
});

test('purgeOldDetails — filtra por janela de retenção em dias, parametrizado', async () => {
  let captured = null;
  db.query = async (sql, vals) => { captured = { sql, vals }; return { rowCount: 0 }; };
  await audit.purgeOldDetails(90);
  assert.match(captured.sql, /ts < NOW\(\) - \(\$1 \|\| ' days'\)::interval/);
  assert.deepEqual(captured.vals, ['90']);
});

test('purgeOldDetails — default de 180 dias quando não especificado', async () => {
  let captured = null;
  db.query = async (sql, vals) => { captured = { sql, vals }; return { rowCount: 0 }; };
  await audit.purgeOldDetails();
  assert.deepEqual(captured.vals, ['180']);
});

test('purgeOldDetails — sem rowCount na resposta, devolve 0 (não lança)', async () => {
  db.query = async () => ({});
  const n = await audit.purgeOldDetails(180);
  assert.equal(n, 0);
});
