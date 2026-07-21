'use strict';
/**
 * Ponto / banco de horas (item 6). Um arquivo, duas camadas:
 *
 *  1. Regras puras (lib/ponto.js) — um teste por BR-PONTO: cálculo de horas com
 *     virada de madrugada e desconto de intervalo, saldo do dia, banco de horas
 *     e resumo do período.
 *  2. Handler (handlers/ponto.js) com `repos` DUBLADO — nada toca o Postgres:
 *     valida o colaborador, DERIVA horas_trabalhadas no servidor, garante o
 *     ownership do ponto e devolve o envelope { pontos, resumo }.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const ponto = require('../lib/ponto');
const repos = require('../db/repos');
const h = require('../handlers/ponto');

// ═══════════ 1. Regras puras (lib/ponto.js) ═══════════

// ── BR-PONTO-001: horas trabalhadas ─────────────────────────────────────────
test('BR-PONTO-001: horas = duração menos o intervalo', () => {
  // 07:00→16:00 = 9h; 60min de refeição → 8h.
  assert.equal(ponto.calcHorasTrabalhadas('07:00', '16:00', 60), 8);
});

test('BR-PONTO-001: turno vira a madrugada (saída ≤ entrada → +24h)', () => {
  // 22:00→06:00 = 8h; sem intervalo.
  assert.equal(ponto.calcHorasTrabalhadas('22:00', '06:00', 0), 8);
});

test('BR-PONTO-001: sem entrada ou sem saída → 0', () => {
  assert.equal(ponto.calcHorasTrabalhadas('', '16:00', 0), 0);
  assert.equal(ponto.calcHorasTrabalhadas('07:00', '', 0), 0);
});

test('BR-PONTO-001: intervalo maior que a jornada não gera horas negativas', () => {
  // 08:00→09:00 = 1h; intervalo 120min = 2h → max(0, -1) = 0.
  assert.equal(ponto.calcHorasTrabalhadas('08:00', '09:00', 120), 0);
});

test('BR-PONTO-001: arredonda a 2 casas', () => {
  // 07:00→08:15 = 1.25h; 30min = 0.5h → 0.75.
  assert.equal(ponto.calcHorasTrabalhadas('07:00', '08:15', 30), 0.75);
});

// ── BR-PONTO-002: saldo do dia ──────────────────────────────────────────────
test('BR-PONTO-002: saldo positivo (hora extra) e negativo (hora devida)', () => {
  assert.equal(ponto.saldoDia(9, 8), 1);
  assert.equal(ponto.saldoDia(6, 8), -2);
});

test('BR-PONTO-002: jornada ausente usa o padrão de 8h', () => {
  assert.equal(ponto.saldoDia(10), 2);
});

// ── BR-PONTO-003: banco de horas e resumo ───────────────────────────────────
test('BR-PONTO-003: saldoBancoHoras soma os saldos diários', () => {
  const pontos = [
    { horasTrabalhadas: 9, jornadaPrevista: 8 }, // +1
    { horasTrabalhadas: 7, jornadaPrevista: 8 }, // -1
    { horasTrabalhadas: 10, jornadaPrevista: 8 }, // +2
  ];
  assert.equal(ponto.saldoBancoHoras(pontos), 2);
});

test('BR-PONTO-003: resumo devolve dias, horas trabalhadas e saldo', () => {
  const pontos = [
    { horasTrabalhadas: 8, jornadaPrevista: 8 },
    { horasTrabalhadas: 9, jornadaPrevista: 8 },
  ];
  assert.deepEqual(ponto.resumo(pontos), { dias: 2, horasTrabalhadas: 17, saldo: 1 });
});

test('BR-PONTO-003: lista vazia devolve zeros coerentes', () => {
  assert.deepEqual(ponto.resumo([]), { dias: 0, horasTrabalhadas: 0, saldo: 0 });
});

// ═══════════ 2. Handler (handlers/ponto.js) — repos dublados ═══════════

// Resposta HTTP falsa: guarda status e body sem abrir socket.
function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) {
      res.status = s;
    },
    end(payload) {
      res.body = payload ? JSON.parse(payload) : null;
    },
  };
  return res;
}

const orig = { recursos: repos.recursos, pontos: repos.pontos };
let store;

beforeEach(() => {
  store = {
    pontos: [],
    created: null,
    updates: [],
    removed: [],
    byId: {
      pt1: {
        id: 'pt1', recursoId: 'R1', data: '2026-07-10',
        entrada: '07:00', saida: '16:00', intervaloMin: 60,
        horasTrabalhadas: 8, jornadaPrevista: 8, observacoes: '',
      },
      ptX: {
        id: 'ptX', recursoId: 'R2', data: '2026-07-10',
        entrada: null, saida: null, intervaloMin: 0,
        horasTrabalhadas: 0, jornadaPrevista: 8, observacoes: '',
      },
    },
  };
  // Só R1 existe.
  repos.recursos = { findById: async (id) => (id === 'R1' ? { id: 'R1', nome: 'Fulano' } : null) };
  repos.pontos = {
    findAll: async () => store.pontos,
    findById: async (id) => store.byId[id] || null,
    create: async (data) => {
      store.created = data;
      return { ...data };
    },
    updateById: async (id, patch) => {
      store.updates.push({ id, patch });
      return { id, ...patch };
    },
    removeById: async (id) => {
      store.removed.push(id);
      return true;
    },
  };
});

function restore() {
  Object.assign(repos, { recursos: orig.recursos, pontos: orig.pontos });
}

// ── POST deriva horas no servidor ───────────────────────────────────────────
test('POST deriva horasTrabalhadas no servidor a partir de entrada/saída', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostPonto('R1', { data: '2026-07-11', entrada: '07:00', saida: '17:00', intervaloMin: 60 }, res);
  assert.equal(res.status, 200);
  assert.equal(store.created.recursoId, 'R1');
  // 07:00→17:00 = 10h − 60min = 9h.
  assert.equal(store.created.horasTrabalhadas, 9);
});

test('POST ignora horasTrabalhadas do cliente quando há entrada e saída', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostPonto('R1', { data: '2026-07-11', entrada: '08:00', saida: '12:00', horasTrabalhadas: 99 }, res);
  assert.equal(store.created.horasTrabalhadas, 4, 'derivada de 08:00→12:00, não os 99 do cliente');
});

test('POST sem entrada/saída respeita horasTrabalhadas informado', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostPonto('R1', { data: '2026-07-11', horasTrabalhadas: 6 }, res);
  assert.equal(store.created.horasTrabalhadas, 6);
});

test('POST sem data responde 400 e não cria', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostPonto('R1', { entrada: '07:00', saida: '16:00' }, res);
  assert.equal(res.status, 400);
  assert.equal(store.created, null);
});

test('POST em colaborador inexistente responde 404 e não cria', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostPonto('SUMIU', { data: '2026-07-11' }, res);
  assert.equal(res.status, 404);
  assert.equal(store.created, null);
});

// ── PUT recalcula / preserva ────────────────────────────────────────────────
test('PUT recalcula horasTrabalhadas ao mudar a saída', async (t) => {
  t.after(restore);
  const res = fakeRes();
  // pt1: 07:00→16:00 int60 = 8h. Muda saída p/ 18:00 → 11h − 60min = 10h.
  await h.handlePutPonto('R1', 'pt1', { saida: '18:00' }, res);
  assert.equal(res.status, 200);
  const upd = store.updates.find((u) => u.id === 'pt1');
  assert.ok(upd, 'chamou updateById para pt1');
  assert.equal(upd.patch.horasTrabalhadas, 10);
});

test('PUT que só muda observações preserva as horas (não recalcula)', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutPonto('R1', 'pt1', { observacoes: 'Atestado parcial' }, res);
  const upd = store.updates.find((u) => u.id === 'pt1');
  assert.equal(upd.patch.observacoes, 'Atestado parcial');
  assert.equal(upd.patch.horasTrabalhadas, undefined, 'sem mexer no cálculo, não regrava horas');
});

test('PUT em ponto de outro colaborador responde 404 e não escreve', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutPonto('R1', 'ptX', { observacoes: 'x' }, res);
  assert.equal(res.status, 404);
  assert.equal(store.updates.length, 0);
});

test('DELETE em ponto de outro colaborador responde 404 e não remove', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleDeletePonto('R1', 'ptX', res);
  assert.equal(res.status, 404);
  assert.equal(store.removed.length, 0);
});

// ── LIST: envelope + filtro de competência ──────────────────────────────────
test('LIST devolve envelope { pontos, resumo }', async (t) => {
  t.after(restore);
  store.pontos = [
    { id: 'a', recursoId: 'R1', data: '2026-07-10', horasTrabalhadas: 9, jornadaPrevista: 8 },
    { id: 'b', recursoId: 'R1', data: '2026-07-11', horasTrabalhadas: 8, jornadaPrevista: 8 },
  ];
  const res = fakeRes();
  await h.handleListPonto('R1', res);
  assert.equal(res.status, 200);
  assert.equal(res.body.resumo.dias, 2);
  assert.equal(res.body.resumo.horasTrabalhadas, 17);
  assert.equal(res.body.resumo.saldo, 1);
});

test('LIST filtra pela competência YYYY-MM', async (t) => {
  t.after(restore);
  store.pontos = [
    { id: 'a', recursoId: 'R1', data: '2026-07-31', horasTrabalhadas: 8, jornadaPrevista: 8 },
    { id: 'b', recursoId: 'R1', data: '2026-08-01', horasTrabalhadas: 8, jornadaPrevista: 8 },
  ];
  const res = fakeRes();
  await h.handleListPonto('R1', res, '2026-07');
  assert.equal(res.body.pontos.length, 1);
  assert.equal(res.body.pontos[0].id, 'a');
  assert.equal(res.body.resumo.dias, 1);
});

test('LIST em colaborador inexistente responde 404', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleListPonto('SUMIU', res);
  assert.equal(res.status, 404);
});
