'use strict';
/**
 * Regras puras de Composição de custos unitários (lib/composicao.js).
 * BR-COMP-001 (custo unitário = Σ coef×valorUnit) e BR-COMP-002 (resumo por tipo
 * que fecha com o total). Sem I/O — só a matemática monetária.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const money = require('../lib/money');
const {
  custoUnitario,
  resumoPorTipo,
  normalizaItens,
  TIPO_PADRAO,
} = require('../lib/composicao');

// ── BR-COMP-001: custoUnitario ───────────────────────────────────────────────
test('BR-COMP-001: custoUnitario soma coef × valorUnit de cada insumo', () => {
  const itens = [
    { tipo: 'mo', descricao: 'Pedreiro', coef: 2, valorUnit: 10 }, // 20
    { tipo: 'material', descricao: 'Cimento', coef: 0.5, valorUnit: 30 }, // 15
    { tipo: 'equipamento', descricao: 'Betoneira', coef: 1, valorUnit: 5 }, // 5
  ];
  assert.equal(custoUnitario(itens), 40);
});

test('BR-COMP-001: entrada vazia/inválida → custo 0', () => {
  assert.equal(custoUnitario([]), 0);
  assert.equal(custoUnitario(null), 0);
  assert.equal(custoUnitario(undefined), 0);
});

test('BR-COMP-001: soma em centavos não acumula drift de float', () => {
  // Soma ingênua de 0.1+0.1+0.1 daria 0.30000000000000004.
  const itens = [
    { tipo: 'material', coef: 0.1, valorUnit: 1 },
    { tipo: 'material', coef: 0.1, valorUnit: 1 },
    { tipo: 'material', coef: 0.1, valorUnit: 1 },
  ];
  assert.equal(custoUnitario(itens), 0.3);
});

// ── BR-COMP-002: resumoPorTipo ───────────────────────────────────────────────
test('BR-COMP-002: resumoPorTipo reparte o custo em mo/material/equipamento', () => {
  const itens = [
    { tipo: 'mo', coef: 2, valorUnit: 10 }, // 20
    { tipo: 'mo', coef: 1, valorUnit: 5 }, // 5
    { tipo: 'material', coef: 3, valorUnit: 4 }, // 12
    { tipo: 'equipamento', coef: 1, valorUnit: 8 }, // 8
  ];
  assert.deepEqual(resumoPorTipo(itens), { mo: 25, material: 12, equipamento: 8 });
});

test('BR-COMP-002: a soma das três partes reconstitui o custo unitário', () => {
  const itens = [
    { tipo: 'mo', coef: 1.5, valorUnit: 33.33 },
    { tipo: 'material', coef: 0.7, valorUnit: 12.5 },
    { tipo: 'equipamento', coef: 2, valorUnit: 9.99 },
  ];
  const r = resumoPorTipo(itens);
  assert.equal(money.round2(r.mo + r.material + r.equipamento), custoUnitario(itens));
});

test('BR-COMP-002: tipo desconhecido é contabilizado como material no resumo', () => {
  const itens = [{ tipo: 'xpto', coef: 2, valorUnit: 5 }]; // 10 → cai em material
  assert.deepEqual(resumoPorTipo(itens), { mo: 0, material: 10, equipamento: 0 });
});

// ── normalizaItens ───────────────────────────────────────────────────────────
test('BR-COMP-002: normalizaItens: tipo desconhecido vira TIPO_PADRAO; campos coeridos', () => {
  const out = normalizaItens([
    { tipo: 'xpto', descricao: 'algo', coef: '2.5', valorUnit: '10' },
    {},
    'lixo',
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].tipo, TIPO_PADRAO);
  assert.equal(out[0].descricao, 'algo');
  assert.equal(out[0].coef, 2.5);
  assert.equal(out[0].valorUnit, 10);
  // objeto vazio → insumo zerado com tipo padrão
  assert.equal(out[1].tipo, TIPO_PADRAO);
  assert.equal(out[1].descricao, '');
  assert.equal(out[1].coef, 0);
  assert.equal(out[1].valorUnit, 0);
  // não-objeto ('lixo') também vira insumo zerado
  assert.equal(out[2].coef, 0);
});

test('normalizaItens: entrada não-array → []', () => {
  assert.deepEqual(normalizaItens(null), []);
  assert.deepEqual(normalizaItens(undefined), []);
  assert.deepEqual(normalizaItens('x'), []);
});
