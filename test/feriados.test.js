'use strict';
// node --test test/feriados.test.js  (sem servidor, sem DB)
//
// lib/feriados.js é a base de TODO cálculo de prazo do sistema: vencimento de
// NF, 5º dia útil de contas a pagar / folha de pagamento e aderência de RDO.
// Uma regressão aqui corrompe datas silenciosamente — daí a cobertura ampla.
//
// Datas-âncora: 2026-05-22 é uma sexta-feira.
//   seg 18/05 · ter 19 · qua 20 · qui 21 · sex 22 · sáb 23 · dom 24 · seg 25

const { test } = require('node:test');
const assert = require('node:assert/strict');
const feriados = require('../lib/feriados');

// ─── easterDate ──────────────────────────────────────────────────────────────
// Páscoa (algoritmo de Gauss/Meeus). Datas conferidas no calendário litúrgico.

test('easterDate — Páscoa cai na data correta (2024-2027)', () => {
  assert.equal(feriados.toISO(feriados.easterDate(2024)), '2024-03-31');
  assert.equal(feriados.toISO(feriados.easterDate(2025)), '2025-04-20');
  assert.equal(feriados.toISO(feriados.easterDate(2026)), '2026-04-05');
  assert.equal(feriados.toISO(feriados.easterDate(2027)), '2027-03-28');
});

// ─── feriadosDoAno ───────────────────────────────────────────────────────────

test('feriadosDoAno — inclui todos os feriados fixos nacionais', () => {
  const f = feriados.feriadosDoAno(2026);
  for (const dia of ['2026-01-01', '2026-04-21', '2026-05-01', '2026-09-07',
                     '2026-10-12', '2026-11-02', '2026-11-15', '2026-12-25']) {
    assert.ok(f.has(dia), `esperava ${dia} no conjunto de feriados`);
  }
});

test('feriadosDoAno — inclui Consciência Negra (federal desde 2024)', () => {
  assert.ok(feriados.feriadosDoAno(2026).has('2026-11-20'));
});

test('feriadosDoAno — feriados móveis derivados da Páscoa (2026)', () => {
  const f = feriados.feriadosDoAno(2026);
  assert.ok(f.has('2026-02-16'), 'Segunda de Carnaval');
  assert.ok(f.has('2026-02-17'), 'Terça de Carnaval');
  assert.ok(f.has('2026-04-03'), 'Sexta-Feira Santa');
  assert.ok(f.has('2026-06-04'), 'Corpus Christi');
});

test('feriadosDoAno — resultado é cacheado (mesma referência)', () => {
  assert.equal(feriados.feriadosDoAno(2026), feriados.feriadosDoAno(2026));
});

// ─── isFeriado ───────────────────────────────────────────────────────────────

test('isFeriado — reconhece feriado fixo e móvel', () => {
  assert.equal(feriados.isFeriado('2026-12-25'), true); // Natal
  assert.equal(feriados.isFeriado('2026-04-03'), true); // Sexta-Feira Santa
});

test('isFeriado — dia comum não é feriado', () => {
  assert.equal(feriados.isFeriado('2026-05-20'), false);
});

test('isFeriado — domingo de Páscoa NÃO é feriado nacional', () => {
  assert.equal(feriados.isFeriado('2026-04-05'), false);
});

test('isFeriado — input inválido retorna false', () => {
  assert.equal(feriados.isFeriado(null), false);
  assert.equal(feriados.isFeriado('xx'), false);
});

// ─── isDiaUtil ───────────────────────────────────────────────────────────────

test('isDiaUtil — dia de semana comum é útil', () => {
  assert.equal(feriados.isDiaUtil('2026-05-20'), true); // quarta
  assert.equal(feriados.isDiaUtil('2026-05-22'), true); // sexta
});

test('isDiaUtil — fim de semana não é útil', () => {
  assert.equal(feriados.isDiaUtil('2026-05-23'), false); // sábado
  assert.equal(feriados.isDiaUtil('2026-05-24'), false); // domingo
});

test('isDiaUtil — feriado não é útil', () => {
  assert.equal(feriados.isDiaUtil('2026-04-21'), false); // Tiradentes
  assert.equal(feriados.isDiaUtil('2026-12-25'), false); // Natal
});

test('isDiaUtil — input inválido retorna false', () => {
  assert.equal(feriados.isDiaUtil(null), false);
});

// ─── ultimoDiaUtilAnterior ───────────────────────────────────────────────────

test('ultimoDiaUtilAnterior — segunda volta para a sexta anterior', () => {
  assert.equal(feriados.ultimoDiaUtilAnterior('2026-05-25'), '2026-05-22');
});

test('ultimoDiaUtilAnterior — pula feriado', () => {
  // 22/04 (qua) → recua: 21/04 Tiradentes (pula) → 20/04 (seg, útil)
  assert.equal(feriados.ultimoDiaUtilAnterior('2026-04-22'), '2026-04-20');
});

test('ultimoDiaUtilAnterior — é sempre ANTERIOR, nunca a própria data', () => {
  assert.equal(feriados.ultimoDiaUtilAnterior('2026-05-22'), '2026-05-21');
});

// ─── diasUteisEntre ──────────────────────────────────────────────────────────

test('diasUteisEntre — `from` exclusivo, `to` inclusivo', () => {
  // seg(excl) → sex(incl): ter+qua+qui+sex = 4
  assert.equal(feriados.diasUteisEntre('2026-05-18', '2026-05-22'), 4);
});

test('diasUteisEntre — pula fim de semana', () => {
  // sex(excl) → seg(incl): sáb e dom não contam, só a segunda = 1
  assert.equal(feriados.diasUteisEntre('2026-05-22', '2026-05-25'), 1);
});

test('diasUteisEntre — pula feriado dentro do intervalo', () => {
  // 20/04(excl) → 22/04(incl): 21/04 Tiradentes não conta, 22/04 sim = 1
  assert.equal(feriados.diasUteisEntre('2026-04-20', '2026-04-22'), 1);
});

test('diasUteisEntre — intervalo nulo ou invertido retorna 0', () => {
  assert.equal(feriados.diasUteisEntre('2026-05-22', '2026-05-22'), 0);
  assert.equal(feriados.diasUteisEntre('2026-05-25', '2026-05-22'), 0);
});

// ─── ultimosNDiasUteis ───────────────────────────────────────────────────────

test('ultimosNDiasUteis — retorna N dias em ordem decrescente', () => {
  assert.deepEqual(
    feriados.ultimosNDiasUteis(3, '2026-05-22'),
    ['2026-05-22', '2026-05-21', '2026-05-20'],
  );
});

test('ultimosNDiasUteis — pula fim de semana ao recuar', () => {
  // a partir da segunda 25/05: a própria segunda + a sexta anterior
  assert.deepEqual(
    feriados.ultimosNDiasUteis(2, '2026-05-25'),
    ['2026-05-25', '2026-05-22'],
  );
});

test('ultimosNDiasUteis — sempre retorna exatamente N itens', () => {
  assert.equal(feriados.ultimosNDiasUteis(10, '2026-05-22').length, 10);
});

// ─── parseISO / toISO ────────────────────────────────────────────────────────

test('parseISO — converte string ISO em Date UTC', () => {
  assert.equal(feriados.toISO(feriados.parseISO('2026-05-22')), '2026-05-22');
});

test('parseISO — aceita ISO com hora (ignora o tempo)', () => {
  assert.equal(feriados.toISO(feriados.parseISO('2026-05-22T13:45:00Z')), '2026-05-22');
});

test('parseISO — input inválido retorna null', () => {
  assert.equal(feriados.parseISO(null), null);
  assert.equal(feriados.parseISO(''), null);
  assert.equal(feriados.parseISO('22/05/2026'), null);
  assert.equal(feriados.parseISO(undefined), null);
});

test('toISO — formata Date como YYYY-MM-DD', () => {
  assert.equal(feriados.toISO(new Date(Date.UTC(2026, 4, 22))), '2026-05-22');
});
