'use strict';
/**
 * @file Smoke test de runtime da seção "Situação atual" do Dashboard
 * (js/views/Dashboard.js, _renderSituacaoAtual). Cobertura pedida no
 * steering/dashboard-proximos-passos.md (Step 1) — a metade backend
 * (handleDashboardOperacional) já tinha teste em dashboard-operacional.test.js;
 * faltava a renderização em si não quebrar com o payload zero-state que o
 * endpoint devolve quando o banco está vazio.
 *
 * Mesmo padrão de test/audit-view-smoke.test.js: carrega a view num sandbox
 * `vm` com stubs de window/escapeHtml/Store, sem DOM real.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert');

function loadView() {
  const code = fs.readFileSync(path.join(__dirname, '../js/views/Dashboard.js'), 'utf8');
  const escapeHtml = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const sandbox = {
    window: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    escapeHtml,
    Store: {
      state: {},
      formatBRLk: (v) => 'R$ ' + (Math.round((v || 0) / 100) / 10).toFixed(1) + 'k',
      formatBRL: (v) => 'R$ ' + (v || 0).toFixed(2),
    },
    document: {},
    console,
    Date,
    Intl,
  };
  sandbox.window.Store = sandbox.Store;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.Dashboard;
}

const D = loadView();

test('view carrega e expõe window.Dashboard', () => {
  assert.ok(D && typeof D.render === 'function');
  assert.ok(typeof D._renderSituacaoAtual === 'function');
});

test('_renderSituacaoAtual: zero-state (banco vazio) não lança e mostra zeros', () => {
  // Payload equivalente ao que handleDashboardOperacional devolve quando cada
  // query cai no fallback safe() — todos os KPIs em zero/undefined.
  const html = D._renderSituacaoAtual({});
  assert.ok(typeof html === 'string' && html.length > 0);
  assert.ok(html.includes('Situação atual'));
  // Os 9 cards, na ordem em que aparecem no código-fonte.
  assert.ok(html.includes('Equip. em manutenção'));
  assert.ok(html.includes('Manutenções atrasadas'));
  assert.ok(html.includes('Docs vencidos'));
  assert.ok(html.includes('Propostas ativas'));
  assert.ok(html.includes('Conversão propostas'));
  assert.ok(html.includes('Candidatos parados'));
  assert.ok(html.includes('Revisões venc'));
  assert.ok(html.includes('Folgas'));
  assert.ok(html.includes('Compras em avaliação'));
  // Metas em estado "tudo em dia" — sem nenhum indicador crítico.
  assert.ok(html.includes('nenhuma em aberto'));
  assert.ok(html.includes('todos em dia'));
  assert.ok(html.includes('nenhuma ativa'));
  assert.ok(html.includes('funil ativo'));
  assert.ok(html.includes('revisões em dia'));
  assert.ok(html.includes('sem atrasos'));
});

test('_renderSituacaoAtual: sub-objetos ausentes (safe() parcial) não lançam', () => {
  // Só alguns KPIs vieram — o resto ficou undefined (uma query falhou e o
  // caller não reconstituiu o objeto inteiro). `op.x || {}` deve blindar.
  const html = D._renderSituacaoAtual({ manutEquip: { emAberto: 2, atrasadas: 1 } });
  assert.ok(html.includes('Docs vencidos')); // não lançou ao acessar op.docsKpi ausente
});

test('_renderSituacaoAtual: indicador crítico aplica cor de aviso e meta correta', () => {
  const html = D._renderSituacaoAtual({
    manutEquip: { emAberto: 3, aAvaliar: 1, emManutencao: 2, atrasadas: 2 },
    docsKpi: { vencidos: 5, vencendo30d: 3 },
    propostasKpi: { emAndamento: 4, valorEmAndamento: 250000, taxaConversao: 40 },
    candidatosParados: 2,
    revisoes: { vencidas: 1 },
    folgasKpi: { proximas5d: 3 },
    comprasParadas: { emAvaliacao: 2, paradas3d: 2 },
  });
  assert.ok(html.includes('var(--rh-warn-strong)'), 'indicador crítico deve destacar em cor de aviso');
  assert.ok(html.includes('1 a avaliar'));
  assert.ok(html.includes('2 em exec.'));
  assert.ok(html.includes('3 vencem em 30 dias'));
  assert.ok(html.includes('2 parada(s) há mais de 3 dias'));
  assert.ok(html.includes('40%'));
  assert.ok(html.includes('sem atualização há +7 dias'));
});
