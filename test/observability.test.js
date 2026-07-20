'use strict';
// node --test test/observability.test.js  (puro: sem rede, sem DB)
//
// Regras de lib/observability.js:
//  BR-OBS-001 segredo/PII nunca sai da máquina no payload do evento
//  BR-OBS-002 erro em laço não vira enxurrada de eventos (throttle por fingerprint)
//  BR-OBS-003 fingerprint agrupa o MESMO erro e separa erros diferentes
//  BR-OBS-004 emitir evento nunca lança (não pode derrubar o request)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const obs = require('../lib/observability');

// ─── BR-OBS-001: redação ─────────────────────────────────────────────────────

test('redact — mascara senha, token, cookie, api key, cpf e hash', () => {
  const entrada = {
    password: 'hunter2',
    senha: 'segredo',
    token: 'abc.def',
    authorization: 'Bearer xyz',
    cookie: 'rhino_sid=123',
    apiKey: 'sk-1',
    api_key: 'sk-2',
    passwordHash: '$2a$10$...',
    cpf: '123.456.789-00',
    clientSecret: 'shh',
  };
  const saida = obs.redact(entrada);
  for (const k of Object.keys(entrada)) {
    assert.equal(saida[k], obs.REDACTED, `${k} deveria estar mascarado`);
  }
});

test('redact — preserva campos inofensivos (o evento precisa ser útil)', () => {
  const saida = obs.redact({ metodo: 'POST', rota: '/api/contracts', status: 500, userId: 'u1' });
  assert.deepEqual(saida, { metodo: 'POST', rota: '/api/contracts', status: 500, userId: 'u1' });
});

test('redact — alcança segredo aninhado, dentro de array e não muta a entrada', () => {
  const entrada = { body: { user: { nome: 'Ana', senha: 'x' } }, itens: [{ token: 't' }] };
  const saida = obs.redact(entrada);
  assert.equal(saida.body.user.nome, 'Ana');
  assert.equal(saida.body.user.senha, obs.REDACTED);
  assert.equal(saida.itens[0].token, obs.REDACTED);
  assert.equal(entrada.body.user.senha, 'x', 'a entrada não pode ser mutada');
});

test('redact — corta string gigante e para em profundidade excessiva', () => {
  const longa = 'a'.repeat(5000);
  assert.ok(String(obs.redact(longa)).length < 2100);

  let profundo = { v: 'fundo' };
  for (let i = 0; i < 10; i++) profundo = { nivel: profundo };
  assert.doesNotThrow(() => JSON.stringify(obs.redact(profundo)));
});

test('redact — não quebra com null, undefined e tipos exóticos', () => {
  assert.equal(obs.redact(null), null);
  assert.equal(obs.redact(undefined), undefined);
  assert.equal(obs.redact(10), 10);
  assert.equal(obs.redact(true), true);
  const err = obs.redact(new Error('falhou'));
  assert.equal(err.message, 'falhou');
  assert.equal(err.name, 'Error');
});

// ─── BR-OBS-003: fingerprint ─────────────────────────────────────────────────

// O fingerprint inclui o 1º frame do stack (com linha), de propósito: o que o
// throttle precisa suprimir é o MESMO erro repetindo do MESMO ponto do código.
// Dois bugs distintos que por acaso têm a mesma mensagem não podem ser fundidos.
// Por isso os erros abaixo nascem todos desta mesma fábrica — que é o cenário
// real (um ponto de falha disparando em laço), e não de linhas diferentes.
function erroDaMesmaOrigem(msg) {
  return new Error(msg);
}

test('fingerprint — mesmo erro, mesma origem, agrupa; mensagem diferente separa', () => {
  const a = erroDaMesmaOrigem('conexão recusada');
  const b = erroDaMesmaOrigem('conexão recusada');
  const c = erroDaMesmaOrigem('outra coisa');
  assert.equal(obs.fingerprint(a), obs.fingerprint(b));
  assert.notEqual(obs.fingerprint(a), obs.fingerprint(c));
});

test('fingerprint — ignora dígitos variáveis (senão nunca agruparia nada)', () => {
  assert.equal(
    obs.fingerprint(erroDaMesmaOrigem('contrato 123 não encontrado')),
    obs.fingerprint(erroDaMesmaOrigem('contrato 987 não encontrado'))
  );
});

test('fingerprint — mesma mensagem vinda de origens diferentes NÃO agrupa', () => {
  const daFabrica = erroDaMesmaOrigem('falha genérica');
  const daqui = new Error('falha genérica');
  assert.notEqual(
    obs.fingerprint(daFabrica),
    obs.fingerprint(daqui),
    'dois pontos de falha distintos não podem ser suprimidos como se fossem um'
  );
});

test('fingerprint — aceita string e valor vazio sem lançar', () => {
  assert.equal(typeof obs.fingerprint('erro solto'), 'string');
  assert.equal(obs.fingerprint(null), 'unknown');
  assert.equal(obs.fingerprint(undefined), 'unknown');
});

// ─── BR-OBS-002: throttle (relógio injetado) ─────────────────────────────────

test('throttle — deixa passar até o teto e suprime o excedente na janela', () => {
  const t = obs.createThrottle({ windowMs: 1000, maxPerKey: 3 });
  const t0 = 1_000_000;
  assert.equal(t('k', t0).send, true);
  assert.equal(t('k', t0 + 1).send, true);
  assert.equal(t('k', t0 + 2).send, true);
  assert.equal(t('k', t0 + 3).send, false, '4º na janela deve ser suprimido');
  assert.equal(t('k', t0 + 999).send, false);
});

test('throttle — nova janela reabre e informa quantos foram suprimidos', () => {
  const t = obs.createThrottle({ windowMs: 1000, maxPerKey: 2 });
  const t0 = 5_000_000;
  t('k', t0);
  t('k', t0 + 1);
  t('k', t0 + 2); // suprimido
  t('k', t0 + 3); // suprimido
  const novo = t('k', t0 + 1500);
  assert.equal(novo.send, true);
  assert.equal(novo.suprimidos, 2, 'a janela nova reporta os 2 engolidos');
});

test('throttle — chaves distintas não competem entre si', () => {
  const t = obs.createThrottle({ windowMs: 1000, maxPerKey: 1 });
  const t0 = 9_000_000;
  assert.equal(t('a', t0).send, true);
  assert.equal(t('b', t0).send, true, 'erro novo não pode ser engolido por outro em laço');
  assert.equal(t('a', t0).send, false);
});

test('throttle — não cresce sem limite com chaves infinitas', () => {
  const t = obs.createThrottle({ windowMs: 10, maxPerKey: 1, maxKeys: 20 });
  let agora = 1;
  for (let i = 0; i < 500; i++) {
    agora += 20; // cada iteração já expira as janelas anteriores
    t(`chave-${i}`, agora);
  }
  assert.equal(t('final', agora).send, true);
});

// ─── BR-OBS-004: nunca lança ─────────────────────────────────────────────────

test('captureError / captureMessage — não lançam, mesmo com entrada hostil', () => {
  const anterior = process.env.OBSERVABILITY_SINK;
  process.env.OBSERVABILITY_SINK = 'noop';
  try {
    assert.doesNotThrow(() => obs.captureError(new Error('x'), { rota: '/api/x' }));
    assert.doesNotThrow(() => obs.captureError('erro em string'));
    assert.doesNotThrow(() => obs.captureError(null));
    assert.doesNotThrow(() => obs.captureError(undefined, undefined));
    assert.doesNotThrow(() => obs.captureMessage('oi', 'info'));

    // Referência circular: JSON.stringify lançaria — emit tem que segurar.
    const circular = { nome: 'c' };
    circular.self = circular;
    assert.doesNotThrow(() => obs.captureError(new Error('circular'), circular));
  } finally {
    if (anterior === undefined) delete process.env.OBSERVABILITY_SINK;
    else process.env.OBSERVABILITY_SINK = anterior;
  }
});

test('sinkAtivoNome — respeita a env var e recusa sink inválido', () => {
  const anterior = process.env.OBSERVABILITY_SINK;
  try {
    process.env.OBSERVABILITY_SINK = 'webhook';
    assert.equal(obs.sinkAtivoNome(), 'webhook');
    process.env.OBSERVABILITY_SINK = 'inexistente';
    assert.notEqual(obs.sinkAtivoNome(), 'inexistente', 'sink inválido não pode ser aceito');
  } finally {
    if (anterior === undefined) delete process.env.OBSERVABILITY_SINK;
    else process.env.OBSERVABILITY_SINK = anterior;
  }
});
