'use strict';
// node --test test/tela-visitas-repo.test.js  (sem servidor, sem DB — db dublado)
//
// Achado 6.3 da varredura 2026-09-08: zero instrumentação de uso — 13
// módulos novos foram ao ar sem nenhum sinal de quantas pessoas realmente os
// abrem. db/repos/tela_visitas.js é o registro mais simples possível: um
// contador agregado por (tela, dia), sem PII, sem crescer sem limite.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const repo = require('../db/repos/tela_visitas');

const orig = { query: db.query, getMany: db.getMany };
afterEach(() => Object.assign(db, orig));

test('incrementar — UPSERT que soma 1 na linha existente (não sobrescreve)', async () => {
  let captured;
  db.query = async (sql, params) => { captured = { sql, params }; return { rowCount: 1 }; };
  await repo.incrementar('#/ssma', '2026-09-08');
  assert.match(captured.sql, /INSERT INTO tela_visitas/);
  assert.match(captured.sql, /ON CONFLICT \(tela, data\) DO UPDATE SET visitas = tela_visitas\.visitas \+ 1/);
  assert.equal(captured.params[1], '#/ssma');
  assert.equal(captured.params[2], '2026-09-08');
});

test('resumoPorTela — agrega por tela, filtra pela janela de dias, ordena por total desc', async () => {
  let captured;
  db.getMany = async (sql, params) => { captured = { sql, params }; return [{ tela: '#/ssma', total: 42, ultimaVisita: '2026-09-08' }]; };
  const out = await repo.resumoPorTela(30);
  assert.match(captured.sql, /GROUP BY tela/);
  assert.match(captured.sql, /ORDER BY total DESC/);
  assert.deepEqual(captured.params, ['30']);
  assert.deepEqual(out, [{ tela: '#/ssma', total: 42, ultimaVisita: '2026-09-08' }]);
});

test('repo expõe .table (entra automaticamente no backup completo, lib/backup-payload.js)', () => {
  assert.equal(repo.table, 'tela_visitas');
});
