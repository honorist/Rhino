'use strict';
// node --test test/pendencias.test.js  (sem servidor, sem DB)
//
// Regra: painel "Cobrança por área" — pendências por área com semáforo
// por dias parado (≥7 vermelho, 3–6 amarelo, <3 não entra).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const p = require('../lib/pendencias');

const HOJE = '2026-06-11'; // quinta-feira

test('calcularCobranca — entrada vazia devolve 4 áreas verdes', () => {
  const r = p.calcularCobranca({ hojeISO: HOJE });
  assert.equal(r.areas.length, 4);
  assert.deepEqual(r.areas.map((a) => a.id), ['rh', 'obras', 'financeiro', 'frota']);
  for (const a of r.areas) {
    assert.equal(a.cor, 'verde');
    assert.deepEqual(a.pendencias, []);
  }
});

test('calcularCobranca — entrada null não quebra', () => {
  const r = p.calcularCobranca(null);
  assert.equal(r.areas.length, 4);
  assert.ok(r.areas.every((a) => a.cor === 'verde'));
});

test('diasCorridos — conta dias entre datas ISO', () => {
  assert.equal(p.diasCorridos('2026-06-01', HOJE), 10);
  assert.equal(p.diasCorridos(HOJE, HOJE), 0);
  assert.equal(p.diasCorridos('2026-06-04T15:30:00.000Z', HOJE), 7); // aceita timestamp
  assert.equal(p.diasCorridos(null, HOJE), null);
  assert.equal(p.diasCorridos('lixo', HOJE), null);
});

test('vencimentoSaldoFolha — 5º dia útil do mês seguinte (sábado conta, domingo não)', () => {
  // Maio/2026 → junho/2026: 1=seg(út1) 2=ter(út2) 3=qua(út3) 4=qui[Corpus Christi,
  // feriado nacional] 5=sex(út4) 6=sáb(út5) → 2026-06-06
  assert.equal(p.vencimentoSaldoFolha('2026-05'), '2026-06-06');
  assert.equal(p.vencimentoSaldoFolha('inválida'), null);
  // Year rollover: dez/2026 → jan/2027. Jan 1 = Confraternização (feriado),
  // então: 2=sáb(út1) 3=dom(não) 4=seg(út2) 5=ter(út3) 6=qua(út4) 7=qui(út5)
  assert.equal(p.vencimentoSaldoFolha('2026-12'), '2027-01-07');
});

test('semáforo — limiares exatos: 7 dias = vermelho, 3 = amarelo, <3 não entra', () => {
  // contas vencidas: 7, 3 e 2 dias atrás
  const contas = [
    { descricao: 'A', dataVencimento: '2026-06-04', status: 'pendente' }, // 7d → vermelho
    { descricao: 'B', dataVencimento: '2026-06-08', status: 'pendente' }, // 3d → entra
    { descricao: 'C', dataVencimento: '2026-06-09', status: 'pendente' }, // 2d → NÃO entra
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, contas });
  const fin = r.areas.find((a) => a.id === 'financeiro');
  assert.equal(fin.cor, 'vermelho');
  assert.equal(fin.pendencias.length, 2);
  // ordenado da mais antiga para a mais nova
  assert.equal(fin.pendencias[0].diasParado, 7);
  assert.equal(fin.pendencias[1].diasParado, 3);
});

test('semáforo — só pendências de 3–6 dias = amarelo', () => {
  const contas = [{ descricao: 'B', dataVencimento: '2026-06-07', status: 'pendente' }]; // 4d
  const r = p.calcularCobranca({ hojeISO: HOJE, contas });
  assert.equal(r.areas.find((a) => a.id === 'financeiro').cor, 'amarelo');
});
