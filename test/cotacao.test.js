'use strict';
/**
 * Regras puras de cotações (lib/cotacao.js). Um teste por regra (BR-COT-001..005).
 * Cada assert falharia se a regra estivesse errada (mutação-verificado).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const cot = require('../lib/cotacao');

// Fixture comum: 2 itens, 3 fornecedores (matriz esparsa).
//   i1 (100 un): fA=10, fB=12
//   i2 ( 50 un): fA=20, fB=18, fC=22
const ITENS = [
  { id: 'i1', descricao: 'Cabo 2,5mm', unidade: 'm', quantidade: 100 },
  { id: 'i2', descricao: 'Eletroduto', unidade: 'm', quantidade: 50 },
];
const PRECOS = [
  { id: 'p1', itemId: 'i1', fornecedorId: 'fA', precoUnit: 10 },
  { id: 'p2', itemId: 'i1', fornecedorId: 'fB', precoUnit: 12 },
  { id: 'p3', itemId: 'i2', fornecedorId: 'fA', precoUnit: 20 },
  { id: 'p4', itemId: 'i2', fornecedorId: 'fB', precoUnit: 18 },
  { id: 'p5', itemId: 'i2', fornecedorId: 'fC', precoUnit: 22 },
];

// ── BR-COT-001: mapa (matriz item×fornecedor com subtotal) ───────────────────
test('BR-COT-001: mapa: colunas na ordem de aparição e subtotal = qtd × preço', () => {
  const m = cot.mapa(ITENS, PRECOS);
  assert.deepEqual(m.fornecedorIds, ['fA', 'fB', 'fC']);
  assert.equal(m.linhas.length, 2);

  const l1 = m.linhas[0];
  assert.equal(l1.itemId, 'i1');
  assert.equal(l1.quantidade, 100);
  assert.equal(l1.celulas.fA.precoUnit, 10);
  assert.equal(l1.celulas.fA.subtotal, 1000); // 100 × 10
  assert.equal(l1.celulas.fB.subtotal, 1200); // 100 × 12
  assert.equal(l1.celulas.fC, undefined);     // fC não cotou i1

  const l2 = m.linhas[1];
  assert.equal(l2.celulas.fB.subtotal, 900);  // 50 × 18
  assert.equal(l2.celulas.fC.subtotal, 1100); // 50 × 22
});

test('BR-COT-001: mapa: célula com preço 0 é ignorada (não vira coluna nem cél.)', () => {
  const m = cot.mapa(
    [{ id: 'i1', descricao: 'x', quantidade: 5 }],
    [
      { itemId: 'i1', fornecedorId: 'fA', precoUnit: 0 },
      { itemId: 'i1', fornecedorId: 'fB', precoUnit: 3 },
    ]
  );
  assert.deepEqual(m.fornecedorIds, ['fB']); // fA (preço 0) fora
  assert.equal(m.linhas[0].celulas.fA, undefined);
  assert.equal(m.linhas[0].celulas.fB.subtotal, 15);
});

// ── BR-COT-002: melhorPorItem (vencedor = menor preço > 0) ───────────────────
test('BR-COT-002: melhorPorItem: elege o menor preço positivo por item', () => {
  const best = cot.melhorPorItem(ITENS, PRECOS);
  const b1 = best.find((b) => b.itemId === 'i1');
  const b2 = best.find((b) => b.itemId === 'i2');
  assert.equal(b1.fornecedorId, 'fA'); // min(10,12) = 10
  assert.equal(b1.precoUnit, 10);
  assert.equal(b1.subtotal, 1000);
  assert.equal(b2.fornecedorId, 'fB'); // min(20,18,22) = 18
  assert.equal(b2.precoUnit, 18);
  assert.equal(b2.subtotal, 900);
});

test('BR-COT-002: melhorPorItem: item sem preço válido não tem vencedor', () => {
  const best = cot.melhorPorItem(
    [{ id: 'i9', descricao: 'sem cotação', quantidade: 3 }],
    [{ itemId: 'i9', fornecedorId: 'fA', precoUnit: 0 }] // só preço 0 → inválido
  );
  assert.equal(best[0].fornecedorId, null);
  assert.equal(best[0].precoUnit, 0);
  assert.equal(best[0].subtotal, 0);
});

test('BR-COT-002: melhorPorItem: empate mantém o primeiro fornecedor', () => {
  const best = cot.melhorPorItem(
    [{ id: 'i1', descricao: 'x', quantidade: 1 }],
    [
      { itemId: 'i1', fornecedorId: 'fA', precoUnit: 7 },
      { itemId: 'i1', fornecedorId: 'fB', precoUnit: 7 },
    ]
  );
  assert.equal(best[0].fornecedorId, 'fA');
});

// ── BR-COT-003: totaisPorFornecedor ──────────────────────────────────────────
test('BR-COT-003: totaisPorFornecedor: soma subtotais e conta itens, ordenado asc', () => {
  const tot = cot.totaisPorFornecedor(ITENS, PRECOS);
  // fA = 1000+1000 = 2000; fB = 1200+900 = 2100; fC = 1100
  const byId = Object.fromEntries(tot.map((t) => [t.fornecedorId, t]));
  assert.equal(byId.fA.total, 2000);
  assert.equal(byId.fA.itensCotados, 2);
  assert.equal(byId.fB.total, 2100);
  assert.equal(byId.fC.total, 1100);
  assert.equal(byId.fC.itensCotados, 1);
  // Ordenado do menor total ao maior: fC (1100) < fA (2000) < fB (2100).
  assert.deepEqual(tot.map((t) => t.fornecedorId), ['fC', 'fA', 'fB']);
});

// ── BR-COT-004: economia (média − menor) × qtd ───────────────────────────────
test('BR-COT-004: economia: (média − menor) por item e total', () => {
  const e = cot.economia(ITENS, PRECOS);
  const e1 = e.itens.find((x) => x.itemId === 'i1');
  const e2 = e.itens.find((x) => x.itemId === 'i2');
  // i1: preços [10,12] → média 11, menor 10, unit 1, total 1×100 = 100
  assert.equal(e1.media, 11);
  assert.equal(e1.menor, 10);
  assert.equal(e1.economiaUnit, 1);
  assert.equal(e1.economiaTotal, 100);
  // i2: preços [20,18,22] → média 20, menor 18, unit 2, total 2×50 = 100
  assert.equal(e2.media, 20);
  assert.equal(e2.menor, 18);
  assert.equal(e2.economiaTotal, 100);
  assert.equal(e.total, 200); // 100 + 100
});

test('BR-COT-004: economia: item com um único preço válido economiza 0', () => {
  const e = cot.economia(
    [{ id: 'i1', descricao: 'x', quantidade: 10 }],
    [{ itemId: 'i1', fornecedorId: 'fA', precoUnit: 5 }]
  );
  assert.equal(e.itens[0].media, 5);
  assert.equal(e.itens[0].menor, 5);
  assert.equal(e.itens[0].economiaUnit, 0);
  assert.equal(e.total, 0);
});

// ── BR-COT-005: totalOrdem ───────────────────────────────────────────────────
test('BR-COT-005: totalOrdem: Σ quantidade × precoUnit', () => {
  const total = cot.totalOrdem([
    { quantidade: 100, precoUnit: 10 }, // 1000
    { quantidade: 50, precoUnit: 18 },  // 900
  ]);
  assert.equal(total, 1900);
});

test('BR-COT-005: totalOrdem: entrada inválida devolve 0', () => {
  assert.equal(cot.totalOrdem(null), 0);
  assert.equal(cot.totalOrdem([]), 0);
});

// ── Normalização de status ───────────────────────────────────────────────────
test('normalizações de status caem no default para valores desconhecidos', () => {
  assert.equal(cot.normalizarStatusCotacao('xpto'), 'aberta');
  assert.equal(cot.normalizarStatusCotacao('fechada'), 'fechada');
  assert.equal(cot.normalizarStatusOrdem('xpto'), 'emitida');
  assert.equal(cot.normalizarStatusOrdem('recebida'), 'recebida');
});
