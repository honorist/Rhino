'use strict';
/**
 * DRE realizado por obra (lib/dre.js) — um teste por regra BR-DRE, base caixa.
 * É a conta que a diretoria olha (margem por obra); um erro aqui distorce a
 * leitura de resultado de todas as obras.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeDreRealizado,
  bucketDeCategoria,
  avaliarMargem,
  META_MARGEM_PCT,
} = require('../lib/dre');

// Cenário base: obra de R$ 1.000.000, R$ 800k medido, com lançamentos de caixa.
function rowsBase() {
  return [
    { type: 'entrada', category: 'nota_fiscal', total: 480000 }, // receita recebida
    { type: 'entrada', category: 'aporte_contrato', total: 50000 }, // financiamento
    { type: 'saida', category: 'mao_de_obra', total: 120000 },
    { type: 'saida', category: 'Estoque', total: 60000 }, // casing inconsistente
    { type: 'saida', category: 'fornecedor', total: 30000 },
    { type: 'saida', category: 'base', total: 30000 },
    { type: 'saida', category: 'abastecimento', total: 12000 },
    { type: 'saida', category: 'passagem', total: 8000 },
  ];
}

// ── BR-DRE-001: receita = só nota fiscal; aportes fora da margem ─────────────
test('BR-DRE-001: receita recebida = Σ caixa(entrada, nota_fiscal); aportes à parte', () => {
  const dre = computeDreRealizado({ contractValue: 1000000, totalMedido: 800000, caixaRows: rowsBase() });
  assert.equal(dre.receita.recebida, 480000);
  assert.equal(dre.aportes, 50000, 'aporte é financiamento, não receita');
});

// ── BR-DRE-002/003: custos por bucket canônico; casing normalizado ──────────
test('BR-DRE-002/003: material soma estoque+fornecedor com casing normalizado', () => {
  const dre = computeDreRealizado({ contractValue: 1000000, totalMedido: 800000, caixaRows: rowsBase() });
  const material = dre.custos.find((c) => c.key === 'material');
  assert.equal(material.total, 90000, 'Estoque(60k) + fornecedor(30k)');
  const mo = dre.custos.find((c) => c.key === 'mao_de_obra');
  assert.equal(mo.total, 120000);
});

test('BR-DRE-002: categoria de saída desconhecida cai em "Outros", nunca some', () => {
  const dre = computeDreRealizado({
    contractValue: 100,
    totalMedido: 0,
    caixaRows: [{ type: 'saida', category: 'imprevisto_xyz', total: 777 }],
  });
  const outros = dre.custos.find((c) => c.key === 'outros');
  assert.equal(outros.total, 777);
  assert.equal(dre.custoTotal, 777, 'entra no custo total');
});

test('bucketDeCategoria: mapeamento direto e fallback', () => {
  assert.equal(bucketDeCategoria('mao_de_obra'), 'mao_de_obra');
  assert.equal(bucketDeCategoria('fornecedor'), 'material');
  assert.equal(bucketDeCategoria('passagem'), 'passagem');
  assert.equal(bucketDeCategoria('qualquer'), 'outros');
});

// ── BR-DRE-004: margem realizada = recebida − custo total ────────────────────
test('BR-DRE-004: margem realizada = receita recebida − custo total, pct sobre recebida', () => {
  const dre = computeDreRealizado({ contractValue: 1000000, totalMedido: 800000, caixaRows: rowsBase() });
  // custos = 120+90+30+12+8 = 260k; recebida 480k → margem 220k = 45,83%
  assert.equal(dre.custoTotal, 260000);
  assert.equal(dre.margem.valor, 220000);
  assert.equal(dre.margem.pct, 45.83);
});

test('BR-DRE-004: receita zero não divide por zero (pct = 0)', () => {
  const dre = computeDreRealizado({
    contractValue: 100,
    totalMedido: 0,
    caixaRows: [{ type: 'saida', category: 'mao_de_obra', total: 500 }],
  });
  assert.equal(dre.margem.valor, -500, 'margem pode ser negativa');
  assert.equal(dre.margem.pct, 0, 'sem receita, pct é 0 e não NaN/Infinity');
});

// ── BR-DRE-005: saldoAMedir é distinto da margem ────────────────────────────
test('BR-DRE-005: saldoAMedir = valor do contrato − medido (não é margem)', () => {
  const dre = computeDreRealizado({ contractValue: 1000000, totalMedido: 800000, caixaRows: rowsBase() });
  assert.equal(dre.saldoAMedir.valor, 200000, '1.000.000 − 800.000');
  assert.equal(dre.saldoAMedir.pct, 20);
  assert.notEqual(dre.saldoAMedir.valor, dre.margem.valor, 'saldo a medir ≠ margem');
});

// ── Zero-state: obra sem caixa não quebra ────────────────────────────────────
test('zero-state: obra sem lançamentos devolve zeros coerentes', () => {
  const dre = computeDreRealizado({ contractValue: 0, totalMedido: 0, caixaRows: [] });
  assert.equal(dre.receita.recebida, 0);
  assert.equal(dre.custoTotal, 0);
  assert.equal(dre.margem.valor, 0);
  assert.equal(dre.margem.pct, 0);
  assert.equal(dre.custos.length, 6, 'todos os buckets presentes, zerados');
});

test('robustez: caixaRows ausente/estranho não lança', () => {
  const dre = computeDreRealizado({ contractValue: 100, totalMedido: 50 });
  assert.equal(dre.custoTotal, 0);
  assert.equal(dre.saldoAMedir.valor, 50);
});

test('coerção: totais em string (NUMERIC do Postgres) somam certo', () => {
  const dre = computeDreRealizado({
    contractValue: '1000',
    totalMedido: '0',
    caixaRows: [
      { type: 'entrada', category: 'nota_fiscal', total: '250.50' },
      { type: 'saida', category: 'base', total: '100.25' },
    ],
  });
  assert.equal(dre.receita.recebida, 250.5);
  assert.equal(dre.custoTotal, 100.25);
  assert.equal(dre.margem.valor, 150.25);
});

// ═══════════ BR-DRE-006: avaliação da margem contra a meta ═══════════
// O limiar de 20% era um literal mágico dentro de uma template string da view
// (js/views/ContratoDetail.js:316-319), e contrato recém-criado — zero
// faturado, zero custo, margemPct 0 — abria exibindo "⚠ faltam 20,0pp",
// alarme falso no primeiro segundo de vida. Faltava o estado "ainda não se
// moveu".

test('BR-DRE-006: obra sem nenhum movimento não é cobrada de meta', () => {
  const r = avaliarMargem({ margemPct: 0, receitaRecebida: 0, custoTotal: 0 });
  assert.equal(r.status, 'sem_movimento');
  assert.equal(r.faltamPp, null, 'sem movimento não há distância pra meta');
  assert.equal(r.faltamValor, null);
});

test('BR-DRE-006: já ter custo (sem receita) JÁ é movimento — não é sem_movimento', () => {
  // Obra que começou a gastar antes de faturar está em prejuízo de verdade.
  const r = avaliarMargem({ margemPct: -100, receitaRecebida: 0, custoTotal: 5000 });
  assert.equal(r.status, 'prejuizo');
});

test('margem negativa é prejuízo', () => {
  const r = avaliarMargem({ margemPct: -12.5, receitaRecebida: 80000, custoTotal: 90000 });
  assert.equal(r.status, 'prejuizo');
  assert.equal(r.faltamPp, 32.5, 'distância até a meta de 20%');
});

test('margem entre 0 e a meta fica abaixo_meta, com o quanto falta', () => {
  const r = avaliarMargem({ margemPct: 12, receitaRecebida: 100000, custoTotal: 88000 });
  assert.equal(r.status, 'abaixo_meta');
  assert.equal(r.faltamPp, 8);
  // 20% de 100.000 = 20.000 de margem-alvo; a margem real é 12.000.
  assert.equal(r.faltamValor, 8000);
});

test('margem na meta ou acima é ok', () => {
  const naMeta = avaliarMargem({ margemPct: 20, receitaRecebida: 100000, custoTotal: 80000 });
  assert.equal(naMeta.status, 'ok');
  assert.equal(naMeta.faltamPp, null);

  const acima = avaliarMargem({ margemPct: 35.4, receitaRecebida: 100000, custoTotal: 64600 });
  assert.equal(acima.status, 'ok');
});

test('meta customizada muda a régua e volta no retorno', () => {
  const r = avaliarMargem({ margemPct: 12, receitaRecebida: 100000, custoTotal: 88000, metaPct: 10 });
  assert.equal(r.status, 'ok', 'com meta de 10%, 12% está acima');
  assert.equal(r.metaPct, 10);
});

test('META_MARGEM_PCT é exportada (fim do 20 mágico espalhado na view)', () => {
  assert.equal(META_MARGEM_PCT, 20);
  const r = avaliarMargem({ margemPct: 5, receitaRecebida: 10, custoTotal: 5 });
  assert.equal(r.metaPct, META_MARGEM_PCT);
});
