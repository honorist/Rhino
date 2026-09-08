'use strict';
/**
 * @file lib/dashboard-agregados.js — agregações puras (sem I/O) usadas pelos
 * dois gráficos novos do Dashboard consolidado: "Custo por categoria" e
 * "Receita por cliente". Mesmo agrupamento por `category` já usado por
 * contrato em js/views/contrato/charts.js#renderPizza, só que somando todos
 * os contratos.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { custoPorCategoria, receitaPorCliente } = require('../lib/dashboard-agregados');

// ---------------- custoPorCategoria ----------------

test('custoPorCategoria: soma só saídas, agrupadas por category', () => {
  const entries = [
    { type: 'saida', category: 'material', value: 1000 },
    { type: 'saida', category: 'material', value: 500 },
    { type: 'saida', category: 'mao_de_obra', value: 2000 },
    { type: 'entrada', category: 'material', value: 9999 }, // não entra
  ];
  assert.deepEqual(custoPorCategoria(entries), { material: 1500, mao_de_obra: 2000 });
});

test('custoPorCategoria: saída sem category cai em "outros"', () => {
  const entries = [{ type: 'saida', value: 300 }];
  assert.deepEqual(custoPorCategoria(entries), { outros: 300 });
});

test('custoPorCategoria: lista vazia/undefined devolve objeto vazio', () => {
  assert.deepEqual(custoPorCategoria([]), {});
  assert.deepEqual(custoPorCategoria(undefined), {});
});

// ---------------- receitaPorCliente ----------------

test('receitaPorCliente: soma só entradas, agrupadas pelo cliente do contrato', () => {
  const entries = [
    { type: 'entrada', contractId: 'ctr1', value: 1000 },
    { type: 'entrada', contractId: 'ctr1', value: 500 },
    { type: 'entrada', contractId: 'ctr2', value: 2000 },
    { type: 'saida', contractId: 'ctr1', value: 9999 }, // não entra
  ];
  const contracts = [
    { id: 'ctr1', client: 'Usiminas' },
    { id: 'ctr2', client: 'Vale' },
  ];
  assert.deepEqual(receitaPorCliente(entries, contracts), [
    { cliente: 'Vale', total: 2000 },
    { cliente: 'Usiminas', total: 1500 },
  ]);
});

test('receitaPorCliente: entrada sem contractId ou de contrato inexistente cai em "Sem contrato"', () => {
  const entries = [
    { type: 'entrada', contractId: null, value: 100 },
    { type: 'entrada', contractId: 'nao-existe', value: 200 },
  ];
  assert.deepEqual(receitaPorCliente(entries, [{ id: 'ctr1', client: 'Usiminas' }]), [
    { cliente: 'Sem contrato', total: 300 },
  ]);
});

test('receitaPorCliente: dois contratos do MESMO cliente somam juntos', () => {
  const entries = [
    { type: 'entrada', contractId: 'ctr1', value: 1000 },
    { type: 'entrada', contractId: 'ctr2', value: 500 },
  ];
  const contracts = [
    { id: 'ctr1', client: 'Usiminas' },
    { id: 'ctr2', client: 'Usiminas' },
  ];
  assert.deepEqual(receitaPorCliente(entries, contracts), [{ cliente: 'Usiminas', total: 1500 }]);
});

test('receitaPorCliente: ordena do maior pro menor total', () => {
  const entries = [
    { type: 'entrada', contractId: 'ctr1', value: 100 },
    { type: 'entrada', contractId: 'ctr2', value: 500 },
    { type: 'entrada', contractId: 'ctr3', value: 300 },
  ];
  const contracts = [
    { id: 'ctr1', client: 'A' },
    { id: 'ctr2', client: 'B' },
    { id: 'ctr3', client: 'C' },
  ];
  assert.deepEqual(
    receitaPorCliente(entries, contracts).map((r) => r.cliente),
    ['B', 'C', 'A']
  );
});

test('receitaPorCliente: lista vazia/undefined devolve array vazio', () => {
  assert.deepEqual(receitaPorCliente([], []), []);
  assert.deepEqual(receitaPorCliente(undefined, undefined), []);
});
