'use strict';
/**
 * @file lib/dashboard-alertas.js — item 2 do plano async-wandering-kite
 * (notificações in-app pros indicadores críticos do dashboard). `db` e
 * `repos` são passados como dependências injetadas (não monkeypatcha módulo
 * compartilhado) — mais simples de isolar aqui que o padrão dos handlers.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { checarAlertasDashboard, THRESHOLDS } = require('../lib/dashboard-alertas');

test('THRESHOLDS tem os 3 indicadores esperados', () => {
  const tipos = THRESHOLDS.map((t) => t.tipo);
  assert.deepStrictEqual(tipos, [
    'dashboard.docs_vencidos',
    'dashboard.manutencao_atrasada',
    'dashboard.revisao_vencida',
  ]);
});

test('indicador zerado não dispara notificação', async () => {
  const criadas = [];
  const db = { getOne: async () => ({ n: 0 }) };
  const repos = { notificacoes: { create: async (row) => criadas.push(row) } };
  const disparados = await checarAlertasDashboard({
    db,
    repos,
    generateId: (p) => `${p}_1`,
  });
  assert.deepStrictEqual(disparados, []);
  assert.strictEqual(criadas.length, 0);
});

test('indicador crítico dispara notificação com destinatario todos', async () => {
  const criadas = [];
  let call = 0;
  const db = {
    getOne: async (sql) => {
      call++;
      // 1ª chamada de cada threshold = a query de contagem; a query de dedup
      // (SELECT id FROM notificacoes...) vem logo depois quando n > 0.
      if (sql.startsWith('SELECT id FROM notificacoes')) return null; // nunca notificado ainda
      return { n: 3 };
    },
  };
  const repos = { notificacoes: { create: async (row) => criadas.push(row) } };
  const disparados = await checarAlertasDashboard({ db, repos, generateId: (p) => `${p}_x` });

  assert.deepStrictEqual(disparados, [
    'dashboard.docs_vencidos',
    'dashboard.manutencao_atrasada',
    'dashboard.revisao_vencida',
  ]);
  assert.strictEqual(criadas.length, 3);
  assert.strictEqual(criadas[0].destinatario, 'todos');
  assert.strictEqual(criadas[0].tipo, 'dashboard.docs_vencidos');
  assert.ok(criadas[0].mensagem.includes('3'));
  assert.strictEqual(criadas[0].link, '#/recursos');
});

test('já notificado hoje não duplica', async () => {
  const criadas = [];
  const db = {
    getOne: async (sql) => {
      if (sql.startsWith('SELECT id FROM notificacoes')) return { id: 'not_ja_existe' };
      return { n: 5 };
    },
  };
  const repos = { notificacoes: { create: async (row) => criadas.push(row) } };
  const disparados = await checarAlertasDashboard({ db, repos, generateId: (p) => `${p}_y` });

  assert.deepStrictEqual(disparados, []);
  assert.strictEqual(criadas.length, 0);
});

test('um indicador falhando (query lança) não impede os outros 2', async () => {
  const criadas = [];
  let n = 0;
  const db = {
    getOne: async (sql) => {
      if (sql.startsWith('SELECT id FROM notificacoes')) return null;
      n++;
      if (n === 1) throw new Error('relation "recursos" does not exist');
      return { n: 2 };
    },
  };
  const repos = { notificacoes: { create: async (row) => criadas.push(row) } };
  const disparados = await checarAlertasDashboard({ db, repos, generateId: (p) => `${p}_z` });

  // O 1º threshold (docs_vencidos) lançou e foi pulado; os outros 2 dispararam.
  assert.deepStrictEqual(disparados, ['dashboard.manutencao_atrasada', 'dashboard.revisao_vencida']);
  assert.strictEqual(criadas.length, 2);
});
