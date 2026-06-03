'use strict';
/**
 * @file Testes do cálculo de Homem-Hora do RDO (lib/rdo-hh).
 * Funções puras — não tocam no banco. Cobrem refeição, virada de madrugada,
 * múltiplos blocos e totalização.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const hh = require('../lib/rdo-hh');

test('duracaoLiquidaHoras: turno diurno simples', () => {
  assert.strictEqual(hh.duracaoLiquidaHoras('07:00', '16:00'), 9);
});

test('duracaoLiquidaHoras: vira a madrugada (22:00→06:00 = 8h)', () => {
  assert.strictEqual(hh.duracaoLiquidaHoras('22:00', '06:00'), 8);
});

test('duracaoLiquidaHoras: noturno 17:00→03:00 = 10h', () => {
  assert.strictEqual(hh.duracaoLiquidaHoras('17:00', '03:00'), 10);
});

test('duracaoLiquidaHoras: hora inválida → 0', () => {
  assert.strictEqual(hh.duracaoLiquidaHoras('', '16:00'), 0);
  assert.strictEqual(hh.duracaoLiquidaHoras('25:00', '26:00'), 0);
});

test('horasDoTurno: desconta refeição entre blocos (8h)', () => {
  assert.strictEqual(hh.horasDoTurno('07:00 às 11:30 /12:30 às 16:00'), 8);
});

test('horasDoTurno: aceita acento errado "ás" e bloco único', () => {
  assert.strictEqual(hh.horasDoTurno('17:00 ás 02:00'), 9);
});

test('horasDoTurno: turno estendido 07:00→20:00 com refeição = 12h', () => {
  assert.strictEqual(hh.horasDoTurno('07:00 às 11:30 /12:30 às 20:00'), 12);
});

test('homemHora: efetivo × horas', () => {
  assert.strictEqual(hh.homemHora(7, 8), 56);
  assert.strictEqual(hh.homemHora(0, 8), 0);
});

test('totalHomemHora: soma por horaTotalHH pré-calculado', () => {
  const det = [{ horaTotalHH: 56 }, { horaTotalHH: 24 }];
  assert.strictEqual(hh.totalHomemHora(det), 80);
});

test('totalHomemHora: soma recalculando de efetivo × qtdHoras', () => {
  const det = [{ efetivo: 7, qtdHoras: 8 }, { efetivo: 3, qtdHoras: 8 }];
  assert.strictEqual(hh.totalHomemHora(det), 80);
});

test('normalizarLinha: deriva horas de horaTrabalho e calcula HH', () => {
  const l = hh.normalizarLinha({ funcao: 'Armador', horaTrabalho: '07:00 às 11:30 /12:30 às 16:00', efetivo: 7 });
  assert.strictEqual(l.qtdHoras, 8);
  assert.strictEqual(l.horaTotalHH, 56);
  assert.strictEqual(l.funcao, 'Armador');
});

test('normalizarLinha: usa qtdHoras informado quando não há horaTrabalho', () => {
  const l = hh.normalizarLinha({ funcao: 'Servente', qtdHoras: 9, efetivo: 2 });
  assert.strictEqual(l.qtdHoras, 9);
  assert.strictEqual(l.horaTotalHH, 18);
});

test('normalizarLinha: início/fim + refeição (07:00–16:00, ref 60min = 8h)', () => {
  const l = hh.normalizarLinha({ funcao: 'Armador', horaIni: '07:00', horaFim: '16:00', refeicaoMin: 60, efetivo: 7 });
  assert.strictEqual(l.qtdHoras, 8);
  assert.strictEqual(l.horaTotalHH, 56);
  assert.strictEqual(l.horaTrabalho, '07:00 às 16:00 (ref. 60min)');
});

test('normalizarLinha: início/fim virando a madrugada (17:00–03:00 = 10h, sem refeição)', () => {
  const l = hh.normalizarLinha({ funcao: 'Servente', horaIni: '17:00', horaFim: '03:00', efetivo: 2 });
  assert.strictEqual(l.qtdHoras, 10);
  assert.strictEqual(l.horaTotalHH, 20);
});
