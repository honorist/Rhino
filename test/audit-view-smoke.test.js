'use strict';
/**
 * @file Smoke test de runtime da view Auditoria (js/views/Auditoria.js).
 * Carrega o arquivo num sandbox `vm` com stubs de window/escapeHtml/Store/etc. e
 * exercita os helpers PUROS (sem DOM). Pega erros de runtime que `node --check`
 * não detecta (ex: referência a método inexistente, formatação errada).
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert');

function loadView() {
  const code = fs.readFileSync(path.join(__dirname, '../js/views/Auditoria.js'), 'utf8');
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const sandbox = {
    window: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    escapeHtml,
    Store: { state: {
      contracts: [{ id: 'ctr_1', name: 'Obra Figueira' }],
      clientes: [{ id: 'cli_1', nome: 'Veracel' }],
      recursos: [{ id: 'rec_1', nome: 'Carlos Mendes' }],
    } },
    document: {}, console, Date, Intl,
  };
  sandbox.window.Store = sandbox.Store;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.Auditoria;
}

const A = loadView();

test('view carrega e expõe window.Auditoria', () => {
  assert.ok(A && typeof A.render === 'function');
});

test('_entityInfo traduz e dá artigo', () => {
  // Nota: objetos vêm do realm do vm → comparar propriedades, não deepStrictEqual.
  const cli = A._entityInfo('clientes');
  assert.strictEqual(cli.label, 'Cliente');
  assert.strictEqual(cli.artigo, 'o');
  const cp = A._entityInfo('contas-pagar');
  assert.strictEqual(cp.label, 'Conta a pagar');
  assert.strictEqual(cp.artigo, 'a');
});

test('_actionVerb cobre as ações novas', () => {
  assert.strictEqual(A._actionVerb('aprovar').verbo, 'Aprovou');
  assert.strictEqual(A._actionVerb('enviar').verbo, 'Enviou');
  assert.strictEqual(A._actionVerb('comprar').verbo, 'Comprou');
});

test('_eventSentence: criação com nome amigável', () => {
  const s = A._eventSentence({ entity: 'clientes', entityId: 'cli_1', action: 'create', entityLabel: 'Veracel' });
  assert.ok(s.startsWith('criou'), s);
  assert.ok(s.includes('cliente'), s);
  assert.ok(s.includes('Veracel'), s);
});

test('_eventSentence: passagem aponta para o colaborador', () => {
  const s = A._eventSentence({ entity: 'recursos', entityId: 'rec_1', action: 'passagem' });
  assert.ok(s.includes('comprou passagem para'), s);
  assert.ok(s.includes('Carlos Mendes'), s);
});

test('_eventSentence: nome via Store quando não há entityLabel', () => {
  const s = A._eventSentence({ entity: 'contracts', entityId: 'ctr_1', action: 'update' });
  assert.ok(s.includes('Obra Figueira'), s);
});

test('_eventTarget: item removido sem nome', () => {
  const s = A._eventTarget({ entity: 'veiculos', entityId: 'vei_x', action: 'delete' });
  assert.ok(s.includes('(removido)'), s);
});

test('_fmtVal: número comum NÃO vira moeda', () => {
  assert.strictEqual(A._fmtVal(3, 'nivel'), '3');
  assert.strictEqual(A._fmtVal(2025, 'ano'), '2.025');
});

test('_fmtVal: campo de dinheiro vira moeda', () => {
  assert.strictEqual(A._fmtVal(120000, 'valor'), '120.000,00');
  assert.strictEqual(A._fmtVal(5000, 'salario'), '5.000,00');
});

test('_fmtVal: booleano e vazio', () => {
  assert.strictEqual(A._fmtVal(true, 'x'), 'Sim');
  assert.strictEqual(A._fmtVal('', 'x'), '—');
});

test('_dayLabel: Hoje / Ontem', () => {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje.getTime() - 86400000);
  assert.strictEqual(A._dayLabel(hoje), 'Hoje');
  assert.strictEqual(A._dayLabel(ontem), 'Ontem');
});

test('_groupByDay separa por dia', () => {
  const now = new Date();
  const ontem = new Date(now.getTime() - 86400000);
  const groups = A._groupByDay([
    { id: 1, ts: now.toISOString() },
    { id: 2, ts: now.toISOString() },
    { id: 3, ts: ontem.toISOString() },
  ]);
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].rows.length, 2);
  assert.strictEqual(groups[1].rows.length, 1);
});

test('_avatar: iniciais determinísticas', () => {
  const a = A._avatar('joao.silva@x.com');
  assert.strictEqual(a.initials, 'JS');
  assert.ok(a.hue >= 0 && a.hue < 360);
});

test('_userName humaniza o email', () => {
  assert.strictEqual(A._userName('joao.silva@x.com'), 'Joao Silva');
});

test('_eventRow (update) mostra resumo do diff (US-2)', () => {
  const html = A._eventRow({
    id: 9, ts: new Date().toISOString(), userEmail: 'maria.costa@x.com',
    entity: 'contracts', entityId: 'ctr_1', action: 'update', status: 200,
    beforeState: { value: 120000 }, body: { value: 135000 },
  });
  assert.ok(html.includes('Maria Costa'));
  assert.ok(html.includes('alterou'), 'frase deve ser o diff, não genérica');
  assert.ok(html.includes('135.000,00'), 'valor novo formatado');
});

// ── US-3: data sem fuso ──
test('_fmtDatePura não tira 1 dia (bug UTC)', () => {
  assert.strictEqual(A._fmtDatePura('2026-06-01'), '01/06/2026');
  assert.strictEqual(A._fmtDatePura('2026-06-01T00:00:00-03:00'), '01/06/2026');
  assert.strictEqual(A._fmtDatePura(''), '—');
});

// ── US-1: formatação tipada ──
test('_fieldMeta resolve rótulo + tipo', () => {
  assert.strictEqual(A._fieldMeta('execPct').type, 'percent');
  assert.strictEqual(A._fieldMeta('execPct').label, 'Execução');
  assert.strictEqual(A._fieldMeta('valor').type, 'money');
  assert.strictEqual(A._fieldMeta('dataFimPlan').type, 'date');
  assert.strictEqual(A._fieldMeta('nome').type, 'text');
});

test('_fmtTyped formata por tipo', () => {
  assert.strictEqual(A._fmtTyped(10, 'percent'), '10%');
  assert.strictEqual(A._fmtTyped(120000, 'money'), 'R$ 120.000,00');
  assert.strictEqual(A._fmtTyped('2026-06-01', 'date'), '01/06/2026');
  assert.strictEqual(A._fmtTyped('***', 'text'), '***');
  assert.strictEqual(A._fmtTyped(null, 'money'), '—');
});

// ── US-2: resumo do update ──
test('_updateSummaryHtml: 1 campo com valores', () => {
  const s = A._updateSummaryHtml({ beforeState: { execPct: 5 }, body: { execPct: 10 } });
  assert.ok(s.includes('alterou') && s.includes('Execução') && s.includes('5%') && s.includes('10%'), s);
});

test('_updateSummaryHtml: 2 campos (2º só rótulo)', () => {
  const s = A._updateSummaryHtml({
    beforeState: { execPct: 5, dataFimPlan: '2026-05-30' },
    body: { execPct: 10, dataFimPlan: '2026-05-31' },
  });
  assert.ok(s.includes('Execução') && s.includes(' e ') && s.includes('Data fim'), s);
});

test('_updateSummaryHtml: >2 campos vira +N', () => {
  const s = A._updateSummaryHtml({
    beforeState: { a: 1, b: 1, c: 1 }, body: { a: 2, b: 2, c: 2 },
  });
  assert.ok(s.includes('+1 campos'), s);
});

// ── US-2: agrupamento consecutivo ──
test('_groupConsecutive agrupa creates idênticos', () => {
  const g = A._groupConsecutive([
    { id: 1, userEmail: 'a@x', action: 'create', entity: 'contas-pagar', status: 200 },
    { id: 2, userEmail: 'a@x', action: 'create', entity: 'contas-pagar', status: 200 },
    { id: 3, userEmail: 'a@x', action: 'create', entity: 'contas-pagar', status: 200 },
  ]);
  assert.strictEqual(g.length, 1);
  assert.strictEqual(g[0]._count, 3);
});

test('_groupConsecutive NÃO agrupa updates', () => {
  const g = A._groupConsecutive([
    { id: 1, userEmail: 'a@x', action: 'update', entity: 'contracts', status: 200 },
    { id: 2, userEmail: 'a@x', action: 'update', entity: 'contracts', status: 200 },
  ]);
  assert.strictEqual(g.length, 2);
});

test('_pluralEntity pluraliza a 1ª palavra', () => {
  assert.strictEqual(A._pluralEntity('contas-pagar', 5), '5 contas a pagar');
  assert.strictEqual(A._pluralEntity('clientes', 3), '3 clientes');
});
