'use strict';
/**
 * DRE realizado por obra (lib/dre.js) — um teste por regra BR-DRE, base caixa.
 * É a conta que a diretoria olha (margem por obra); um erro aqui distorce a
 * leitura de resultado de todas as obras.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeDreRealizado, bucketDeCategoria } = require('../lib/dre');

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
