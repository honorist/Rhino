'use strict';
/**
 * Regras puras de Equipamentos (lib/equipamento.js). Um teste por regra
 * (BR-EQP-001..003). A orquestração HTTP do handler não é coberta aqui.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const eqp = require('../lib/equipamento');

// ── BR-EQP-001: Custo de locação acumulado ──────────────────────────────────
test('BR-EQP-001: custoLocacaoAcumulado: meses corridos (mês=30 dias) × valor até a referência', () => {
  // 60 dias / 30 = 2 meses × 1000 = 2000 (fim ainda no futuro → usa a referência).
  assert.equal(eqp.custoLocacaoAcumulado('2026-01-01', '2026-12-31', 1000, '2026-03-02'), 2000);
  // 15 dias / 30 = 0,5 mês × 1000 = 500 (fração).
  assert.equal(eqp.custoLocacaoAcumulado('2026-01-01', null, 1000, '2026-01-16'), 500);
});

test('BR-EQP-001: custoLocacaoAcumulado: para no fim da locação, não projeta além dele', () => {
  // Locação encerra em 31/01 (30 dias) mesmo que a referência seja bem depois.
  assert.equal(eqp.custoLocacaoAcumulado('2026-01-01', '2026-01-31', 1000, '2026-06-01'), 1000);
});

test('BR-EQP-001: custoLocacaoAcumulado: início ausente, fim ≤ início ou datas inválidas → 0', () => {
  assert.equal(eqp.custoLocacaoAcumulado(null, '2026-02-01', 1000, '2026-02-01'), 0);
  assert.equal(eqp.custoLocacaoAcumulado('2026-02-01', null, 1000, '2026-01-01'), 0); // ref antes do início
  assert.equal(eqp.custoLocacaoAcumulado('2026-02-01', '2026-02-01', 1000, '2026-02-01'), 0); // 0 dias
  assert.equal(eqp.custoLocacaoAcumulado('xx', 'yy', 1000, 'zz'), 0);
});

test('BR-EQP-001: custoLocacaoAcumulado: arredonda a 2 casas', () => {
  // 10 dias / 30 = 0,3333… mês × 100 = 33,333… → 33,33.
  assert.equal(eqp.custoLocacaoAcumulado('2026-01-01', null, 100, '2026-01-11'), 33.33);
});

// ── BR-EQP-002: Resumo do parque ────────────────────────────────────────────
test('BR-EQP-002: resumo: próprios vs locados, por status e custo mensal só dos locados', () => {
  const lista = [
    { propriedade: 'proprio', status: 'disponivel', valorLocacaoMensal: 999 }, // não conta no custo
    { propriedade: 'locado', status: 'em_uso', valorLocacaoMensal: 1500 },
    { propriedade: 'locado', status: 'manutencao', valorLocacaoMensal: 500 },
    { propriedade: 'locado', status: 'devolvido', valorLocacaoMensal: 0 },
  ];
  const r = eqp.resumo(lista);
  assert.equal(r.total, 4);
  assert.equal(r.proprios, 1);
  assert.equal(r.locados, 3);
  assert.equal(r.porStatus.disponivel, 1);
  assert.equal(r.porStatus.em_uso, 1);
  assert.equal(r.porStatus.manutencao, 1);
  assert.equal(r.porStatus.devolvido, 1);
  // Custo mensal soma só os locados (1500 + 500 + 0); o próprio (999) é ignorado.
  assert.equal(r.custoLocacaoMensal, 2000);
});

test('BR-EQP-002: resumo: entrada vazia/ inválida devolve zeros', () => {
  const r = eqp.resumo(null);
  assert.equal(r.total, 0);
  assert.equal(r.proprios, 0);
  assert.equal(r.locados, 0);
  assert.equal(r.custoLocacaoMensal, 0);
  assert.equal(r.porStatus.disponivel, 0);
});

// ── BR-EQP-003: Alerta de devolução ─────────────────────────────────────────
test('BR-EQP-003: alertaDevolucao: pega ativas vencidas e vencendo (≤15 dias), ignora o resto', () => {
  const ref = '2026-03-01';
  const locacoes = [
    { id: 'a', status: 'ativa', dataFim: '2026-02-20' }, // vencida (−9)
    { id: 'b', status: 'ativa', dataFim: '2026-03-10' }, // vencendo (+9)
    { id: 'c', status: 'ativa', dataFim: '2026-05-01' }, // longe → não alerta
    { id: 'd', status: 'encerrada', dataFim: '2026-02-01' }, // não ativa → ignora
    { id: 'e', status: 'ativa', dataFim: null }, // sem prazo → ignora
  ];
  const al = eqp.alertaDevolucao(locacoes, ref);
  assert.equal(al.length, 2);
  // Ordenado por criticidade: a vencida (−9) antes da vencendo (+9).
  assert.equal(al[0].id, 'a');
  assert.equal(al[0].situacao, 'vencida');
  assert.equal(al[0].diasRestantes, -9);
  assert.equal(al[1].id, 'b');
  assert.equal(al[1].situacao, 'vencendo');
  assert.equal(al[1].diasRestantes, 9);
});

test('BR-EQP-003: alertaDevolucao: exatamente 15 dias ainda alerta; 16 já não', () => {
  const ref = '2026-03-01';
  const al = eqp.alertaDevolucao(
    [
      { id: 'q15', status: 'ativa', dataFim: '2026-03-16' }, // +15 → vencendo
      { id: 'q16', status: 'ativa', dataFim: '2026-03-17' }, // +16 → não
    ],
    ref
  );
  assert.equal(al.length, 1);
  assert.equal(al[0].id, 'q15');
});

test('BR-EQP-003: alertaDevolucao: entrada vazia/ inválida devolve lista vazia', () => {
  assert.deepEqual(eqp.alertaDevolucao(null, '2026-03-01'), []);
  assert.deepEqual(eqp.alertaDevolucao([{ status: 'ativa', dataFim: 'xx' }], '2026-03-01'), []);
});

// ── Normalização de vocabulário ─────────────────────────────────────────────
test('normalizações caem no default para valores desconhecidos', () => {
  assert.equal(eqp.normalizarPropriedade('xpto'), 'proprio');
  assert.equal(eqp.normalizarPropriedade('locado'), 'locado');
  assert.equal(eqp.normalizarStatus('xpto'), 'disponivel');
  assert.equal(eqp.normalizarStatus('em_uso'), 'em_uso');
  assert.equal(eqp.normalizarStatusLocacao('xpto'), 'ativa');
  assert.equal(eqp.normalizarStatusLocacao('encerrada'), 'encerrada');
});
