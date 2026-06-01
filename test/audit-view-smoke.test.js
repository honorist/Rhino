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

test('_eventRow renderiza sem lançar (com diff de update)', () => {
  const html = A._eventRow({
    id: 9, ts: new Date().toISOString(), userEmail: 'maria.costa@x.com',
    entity: 'contracts', entityId: 'ctr_1', action: 'update', status: 200,
    beforeState: { value: 120000 }, body: { value: 135000 },
  });
  assert.ok(html.includes('Maria Costa'));
  assert.ok(html.includes('135.000,00'), 'diff deve formatar valor monetário');
});
