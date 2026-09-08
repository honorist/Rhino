'use strict';
/**
 * Avanço físico da obra — fonte única (lib/avanco-fisico.js).
 *
 * Por que este arquivo existe: "avanço físico" era calculado em 6 lugares que
 * não reconciliavam entre si — ponderado por peso no cronograma
 * (js/views/contrato/cronograma.js:61), média simples no data book
 * (lib/data-book.js:68-69), EV/BAC no EVM, avanço por quantidade medida na
 * Medição, e um "% executado" na Visão Geral que na verdade era % FATURADO.
 * A definição canônica é a ponderada por peso: é a única que responde "quanto
 * da obra foi executado fisicamente".
 *
 * Regras:
 *  - BR-AVANCO-001: ponderado por pesoPct quando Σ peso > 0.
 *  - BR-AVANCO-002: sem nenhum peso preenchido, cai na média simples de execPct
 *    (é o que o data book faz hoje — sem o fallback ele regrediria).
 *  - BR-AVANCO-003: sem atividades → pct null (NÃO 0). "0% executado" e "não
 *    medido" são coisas diferentes; confundir as duas é a raiz do pronto:false
 *    silencioso de lib/data-book.js:82-83.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { avancoFisicoPonderado } = require('../lib/avanco-fisico');

test('BR-AVANCO-001: pondera pelo peso de cada atividade', () => {
  // 70% do peso a 100% + 30% do peso a 0% = 70%.
  const r = avancoFisicoPonderado([
    { pesoPct: 70, execPct: 100 },
    { pesoPct: 30, execPct: 0 },
  ]);
  assert.equal(r.pct, 70);
  assert.equal(r.base, 'peso');
  assert.equal(r.totalPeso, 100);
  assert.equal(r.n, 2);
});

test('BR-AVANCO-001: peso é o que manda — não é média simples', () => {
  // Média simples daria 50%. Ponderado: a etapa pesada mal começou.
  const r = avancoFisicoPonderado([
    { pesoPct: 90, execPct: 10 },
    { pesoPct: 10, execPct: 90 },
  ]);
  assert.equal(r.pct, 18); // (90*10 + 10*90) / 100
  assert.equal(r.base, 'peso');
});

test('BR-AVANCO-001: peso parcial — atividade sem peso não distorce o total', () => {
  // Só a 1ª tem peso; ela sozinha responde por 100% da base ponderada.
  const r = avancoFisicoPonderado([
    { pesoPct: 50, execPct: 40 },
    { pesoPct: null, execPct: 100 },
    { execPct: 100 },
  ]);
  assert.equal(r.base, 'peso');
  assert.equal(r.totalPeso, 50);
  assert.equal(r.pct, 40);
});

test('BR-AVANCO-002: peso todo zerado cai na média simples', () => {
  const r = avancoFisicoPonderado([
    { pesoPct: 0, execPct: 100 },
    { pesoPct: 0, execPct: 50 },
  ]);
  assert.equal(r.base, 'media');
  assert.equal(r.pct, 75);
  assert.equal(r.totalPeso, 0);
});

test('BR-AVANCO-002: sem campo de peso nenhum também cai na média simples', () => {
  const r = avancoFisicoPonderado([{ execPct: 30 }, { execPct: 60 }]);
  assert.equal(r.base, 'media');
  assert.equal(r.pct, 45);
});

test('BR-AVANCO-003: sem atividades devolve null, não zero', () => {
  const r = avancoFisicoPonderado([]);
  assert.equal(r.pct, null, '"não medido" não pode virar "0% executado"');
  assert.equal(r.base, 'sem_dados');
  assert.equal(r.n, 0);
});

test('BR-AVANCO-003: lista undefined/null não lança e devolve sem_dados', () => {
  for (const entrada of [undefined, null, 'nada disso', 42]) {
    const r = avancoFisicoPonderado(entrada);
    assert.equal(r.pct, null);
    assert.equal(r.base, 'sem_dados');
  }
});

test('coerção: peso/exec como string (NUMERIC do Postgres) somam certo', () => {
  const r = avancoFisicoPonderado([
    { pesoPct: '70', execPct: '100' },
    { pesoPct: '30', execPct: '0' },
  ]);
  assert.equal(r.pct, 70);
  assert.equal(r.base, 'peso');
});

test('coerção: aceita snake_case (row cru do Postgres)', () => {
  const r = avancoFisicoPonderado([
    { peso_pct: 50, exec_pct: 80 },
    { peso_pct: 50, exec_pct: 20 },
  ]);
  assert.equal(r.pct, 50);
  assert.equal(r.base, 'peso');
});

test('coerção: valor não-numérico vira 0 em vez de NaN', () => {
  const r = avancoFisicoPonderado([
    { pesoPct: 100, execPct: 'quase pronto' },
  ]);
  assert.equal(r.pct, 0);
  assert.ok(!Number.isNaN(r.pct));
});

test('execPct acima de 100 é limitado a 100 (avanço físico não passa de pronto)', () => {
  const r = avancoFisicoPonderado([{ pesoPct: 100, execPct: 150 }]);
  assert.equal(r.pct, 100);
});

test('execPct negativo é limitado a 0', () => {
  const r = avancoFisicoPonderado([{ pesoPct: 100, execPct: -20 }]);
  assert.equal(r.pct, 0);
});

test('arredonda a 1 casa, igual ao data book', () => {
  // (1*33.333) / 1 = 33.333… → 33.3
  const r = avancoFisicoPonderado([{ pesoPct: 1, execPct: 33.333 }]);
  assert.equal(r.pct, 33.3);
});

test('atividade nula no meio da lista não derruba o cálculo', () => {
  const r = avancoFisicoPonderado([{ pesoPct: 50, execPct: 100 }, null, { pesoPct: 50, execPct: 0 }]);
  assert.equal(r.pct, 50);
});
