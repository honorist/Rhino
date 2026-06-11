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
  assert.deepEqual(
    r.areas.map((a) => a.id),
    ['rh', 'obras', 'financeiro', 'frota']
  );
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

// ─── Área RH ──────────────────────────────────────────────────────────────────

test('RH — candidato parado no funil entra com updatedAt como base', () => {
  const candidatos = [
    {
      id: 'c1',
      vagaId: 'v1',
      nome: 'João',
      status: 'contatado',
      antecedentesStatus: 'pendente',
      documentos: {},
      updatedAt: '2026-06-01T10:00:00Z',
    }, // 10d
    {
      id: 'c2',
      vagaId: 'v1',
      nome: 'Ana',
      status: 'aprovado',
      documentos: {},
      updatedAt: '2026-05-01T10:00:00Z',
    }, // aprovado → fora
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, candidatos });
  const rh = r.areas.find((a) => a.id === 'rh');
  assert.equal(rh.pendencias.length, 1);
  assert.match(rh.pendencias[0].titulo, /João/);
  assert.equal(rh.pendencias[0].diasParado, 10);
  assert.equal(rh.cor, 'vermelho');
});

test('RH — dedup: candidato aguardando documentos gera UMA pendência (a de docs)', () => {
  const candidatos = [
    {
      id: 'c1',
      vagaId: 'v1',
      nome: 'Bia',
      status: 'interessado',
      antecedentesStatus: 'ok',
      documentos: { rg: { filename: 'rg.pdf' } }, // faltam cpf/residencia/ctps
      updatedAt: '2026-06-05T10:00:00Z', // 6d
    },
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, candidatos });
  const rh = r.areas.find((a) => a.id === 'rh');
  assert.equal(rh.pendencias.length, 1);
  assert.match(rh.pendencias[0].titulo, /aguardando documentos/);
});

test('RH — vaga aberta sem candidato em andamento entra; com candidato não', () => {
  const solicitacoes = [
    { id: 's1', status: 'aberta', createdAt: '2026-06-01T08:00:00Z' }, // 10d, sem candidato
    { id: 's2', status: 'aberta', createdAt: '2026-06-01T08:00:00Z' }, // tem candidato → fora
    { id: 's3', status: 'preenchida', createdAt: '2026-01-01T08:00:00Z' }, // fechada → fora
  ];
  const vagas = [
    { id: 'v1', solicitacaoId: 's1', cargo: 'Pedreiro' },
    { id: 'v2', solicitacaoId: 's2', cargo: 'Mestre' },
  ];
  const candidatos = [
    {
      id: 'c1',
      vagaId: 'v2',
      nome: 'Ze',
      status: 'contatado',
      documentos: {},
      updatedAt: '2026-06-10T08:00:00Z',
    }, // 1d → não vira pendência própria
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, solicitacoes, vagas, candidatos });
  const rh = r.areas.find((a) => a.id === 'rh');
  assert.equal(rh.pendencias.length, 1);
  assert.match(rh.pendencias[0].titulo, /Pedreiro/);
});

test('RH — folha vencida agrega por competência', () => {
  // competência 2026-04 → saldo venceu ~2026-05-07 (>7d atrás) → vermelho
  const folha = [
    { competencia: '2026-04', valorVale: 0, valePago: false, saldoPago: false },
    { competencia: '2026-04', valorVale: 500, valePago: false, saldoPago: true },
    { competencia: '2026-04', valorVale: 0, valePago: false, saldoPago: true }, // sem vale e saldo pago → ok
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, folha });
  const rh = r.areas.find((a) => a.id === 'rh');
  assert.equal(rh.pendencias.length, 1);
  assert.match(rh.pendencias[0].titulo, /Folha 2026-04: 2 pagamento/);
  assert.equal(rh.cor, 'vermelho');
});

// ─── Área Obras ───────────────────────────────────────────────────────────────

test('Obras — NF não emitida com prazo vencido entra; emitida em dia não', () => {
  const nfs = [
    { numero: 132, emitida: false, dataLimite: '2026-06-01' }, // 10d vencida
    { numero: 133, emitida: false, dataLimite: '2026-06-20' }, // prazo futuro → fora
    { numero: 134, emitida: true, dataEmissaoReal: '2026-06-10', prazoRecebimento: 30 }, // em dia → fora
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, nfs });
  const obras = r.areas.find((a) => a.id === 'obras');
  assert.equal(obras.pendencias.length, 1);
  assert.match(obras.pendencias[0].titulo, /NF 132 não emitida/);
  assert.equal(obras.pendencias[0].diasParado, 10);
});

test('Obras — NF emitida com recebimento previsto vencido entra', () => {
  const nfs = [
    // emitida 2026-04-30 + 30 dias = previsto 2026-05-30 → 12d vencido
    { numero: 140, emitida: true, dataEmissaoReal: '2026-04-30', prazoRecebimento: 30 },
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, nfs });
  const obras = r.areas.find((a) => a.id === 'obras');
  assert.equal(obras.pendencias.length, 1);
  assert.match(obras.pendencias[0].titulo, /NF 140 — recebimento previsto vencido/);
  assert.equal(obras.pendencias[0].diasParado, 12);
});

test('Obras — obra ativa sem RDO há ≥3 dias úteis entra (dias parado = dias úteis)', () => {
  const contratos = [
    { id: 'ct1', name: 'Obra Sul', status: 'ativo', createdAt: '2026-01-01T08:00:00Z' },
    { id: 'ct2', name: 'Obra Norte', status: 'ativo', createdAt: '2026-01-01T08:00:00Z' },
    { id: 'ct3', name: 'Obra Encerrada', status: 'encerrado', createdAt: '2026-01-01T08:00:00Z' },
  ];
  const ultimoRdoPorContrato = {
    ct1: '2026-06-03', // vários dias úteis sem RDO até 2026-06-11
    ct2: '2026-06-10', // ontem → em dia
  };
  const r = p.calcularCobranca({ hojeISO: HOJE, contratos, ultimoRdoPorContrato });
  const obras = r.areas.find((a) => a.id === 'obras');
  assert.equal(obras.pendencias.length, 1);
  assert.match(obras.pendencias[0].titulo, /Obra Sul sem RDO/);
  assert.ok(obras.pendencias[0].diasParado >= 3);
  assert.equal(obras.pendencias[0].href, '#/contratos/ct1');
});

test('Obras — obra ativa que NUNCA fez RDO usa createdAt como base', () => {
  const contratos = [{ id: 'ct9', name: 'Obra Nova', status: 'ativo', createdAt: '2026-05-01T08:00:00Z' }];
  const r = p.calcularCobranca({ hojeISO: HOJE, contratos, ultimoRdoPorContrato: {} });
  const obras = r.areas.find((a) => a.id === 'obras');
  assert.equal(obras.pendencias.length, 1);
  assert.match(obras.pendencias[0].titulo, /Obra Nova sem RDO/);
});
