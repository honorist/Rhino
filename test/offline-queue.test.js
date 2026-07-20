'use strict';
// node --test test/offline-queue.test.js  (puro: sem IndexedDB, sem rede, sem DOM)
//
// Regras da fila offline do RDO (js/lib/offline-queue.js). O arquivo é um IIFE de
// browser (self.RhinoOfflineQueue = ...), então é carregado num vm com stub mínimo
// de window — mesmo caminho de test/paginacao.test.js.
//
// Contexto de negócio: o encarregado preenche o RDO na obra, onde falta sinal. Se
// a fila errar, ou o trabalho de campo se perde, ou um lançamento duplica.
//
//  BR-OQ-001 só mutação de /api/ entra na fila (GET, estático e auth ficam fora)
//  BR-OQ-002 online e sem falha de rede NÃO enfileira (caminho online intacto)
//  BR-OQ-003 2xx sai da fila como sucesso
//  BR-OQ-004 4xx de regra de negócio SAI da fila e notifica (retry não resolve)
//  BR-OQ-005 5xx e 408/425/429 voltam pra fila (não é culpa do dado)
//  BR-OQ-006 falha de rede volta pra fila
//  BR-OQ-007 tentativas esgotadas param o retry e viram notificação
//  BR-OQ-008 backoff é exponencial, monotônico e limitado pelo teto
//  BR-OQ-009 a ordem de enfileiramento é a ordem de envio
//  BR-OQ-010 a Idempotency-Key é estável por item e ausente em multipart

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function carregarFila() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'lib', 'offline-queue.js'), 'utf8');
  const janela = { addEventListener() {} };
  const sandbox = {
    window: janela,
    self: janela,
    URL,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'offline-queue.js' });
  return janela.RhinoOfflineQueue;
}

const Q = carregarFila();
const mesmoRealm = (a) => [...a];

test('o módulo expõe as regras usadas pela fila', () => {
  for (const fn of [
    'shouldQueue', 'classifyOutcome', 'backoffDelay', 'nextAttemptAt', 'isDue',
    'sortQueue', 'newIdempotencyKey', 'shouldAttachIdempotencyKey',
    'queueSummary', 'describeQueue', 'isQueueableUrl', 'isMutationMethod',
  ]) {
    assert.equal(typeof Q[fn], 'function', `${fn} deveria existir`);
  }
});

// ─── shouldQueue (BR-OQ-001 / BR-OQ-002) ─────────────────────────────────────

test('shouldQueue — BR-OQ-001: mutação de /api/ offline entra na fila', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post', 'put']) {
    assert.equal(
      Q.shouldQueue({ method, url: '/api/contracts/7/rdos', online: false }),
      true,
      `${method} offline deveria enfileirar — senão o RDO da obra se perde`
    );
  }
});

test('shouldQueue — BR-OQ-001: GET nunca entra na fila', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
    assert.equal(
      Q.shouldQueue({ method, url: '/api/contracts', online: false }),
      false,
      `${method} é leitura — reenviar depois não faz sentido`
    );
  }
});

test('shouldQueue — BR-OQ-001: fora de /api/ não entra na fila', () => {
  for (const url of ['/js/app.js', '/index.html', '/apix/y', '', null, undefined, 42]) {
    assert.equal(
      Q.shouldQueue({ method: 'POST', url, online: false }),
      false,
      `${JSON.stringify(url)} não é API do Rhino`
    );
  }
});

test('shouldQueue — BR-OQ-001: API de OUTRA origem não entra na fila', () => {
  // Reenviar horas depois um POST para um terceiro (gateway de pagamento,
  // webhook) é efeito colateral que o app não controla.
  assert.equal(
    Q.shouldQueue({ method: 'POST', url: 'https://outro.com/api/x', online: false, origin: 'https://rhino.app' }),
    false,
    'só a API do próprio app pode ser reenviada'
  );
  // A mesma origem, escrita de forma absoluta, continua valendo.
  assert.equal(
    Q.shouldQueue({ method: 'POST', url: 'https://rhino.app/api/contracts/7/rdos', online: false, origin: 'https://rhino.app' }),
    true
  );
  // Sem origin declarado, URL absoluta não passa (falha fechada).
  assert.equal(
    Q.shouldQueue({ method: 'POST', url: 'https://rhino.app/api/contracts/7/rdos', online: false }),
    false
  );
});

test('shouldQueue — BR-OQ-001: autenticação NUNCA é enfileirada', () => {
  for (const url of ['/api/auth/login', '/api/auth/logout', '/api/login', '/api/logout']) {
    assert.equal(
      Q.shouldQueue({ method: 'POST', url, online: false }),
      false,
      `${url} enfileirado viraria replay de credencial horas depois`
    );
  }
  // ...mas o resto da API sim (guarda contra um regex ganancioso demais)
  assert.equal(Q.shouldQueue({ method: 'POST', url: '/api/authorizacoes', online: false }), true);
});

test('shouldQueue — BR-OQ-002: online e sem falha de rede NÃO enfileira', () => {
  assert.equal(
    Q.shouldQueue({ method: 'POST', url: '/api/contracts/7/rdos', online: true, networkError: false }),
    false,
    'com sinal o caminho tem que ser o de sempre — a fila não pode interferir'
  );
});

test('shouldQueue — BR-OQ-002: online mas com falha de rede ENFILEIRA', () => {
  // navigator.onLine mente em portal cativo / wi-fi da obra sem saída.
  assert.equal(
    Q.shouldQueue({ method: 'POST', url: '/api/contracts/7/rdos', online: true, networkError: true }),
    true,
    'navigator.onLine=true não prova que há internet — o fetch que falhou prova o contrário'
  );
});

// ─── classifyOutcome ─────────────────────────────────────────────────────────

test('classifyOutcome — BR-OQ-003: 2xx encerra o item com sucesso', () => {
  for (const status of [200, 201, 202, 204, 304]) {
    const r = Q.classifyOutcome({ status, attempts: 1 });
    assert.equal(r.action, 'ok', `status ${status} deveria ser sucesso`);
    assert.equal(r.notify, false);
  }
});

test('classifyOutcome — BR-OQ-004: 4xx de regra SAI da fila e notifica', () => {
  for (const status of [400, 404, 409, 422]) {
    const r = Q.classifyOutcome({ status, attempts: 1 });
    assert.equal(r.action, 'drop', `status ${status} não pode ficar retentando para sempre`);
    assert.equal(r.notify, true, 'o usuário precisa saber que o registro foi recusado');
    assert.equal(r.reason, 'regra');
    assert.ok(r.message.length > 0, 'drop sem mensagem deixa o usuário no escuro');
  }
});

test('classifyOutcome — BR-OQ-004: 401/403 sai da fila com aviso de sessão', () => {
  for (const status of [401, 403]) {
    const r = Q.classifyOutcome({ status, attempts: 1 });
    assert.equal(r.action, 'drop', 'reenviar não recupera sessão expirada');
    assert.equal(r.reason, 'auth');
    assert.equal(r.notify, true);
  }
});

test('classifyOutcome — BR-OQ-005: 5xx volta pra fila', () => {
  for (const status of [500, 502, 503, 504]) {
    const r = Q.classifyOutcome({ status, attempts: 1 });
    assert.equal(r.action, 'retry', `status ${status} é falha do servidor, não do dado`);
    assert.equal(r.notify, false, 'erro transitório não deve incomodar o encarregado');
  }
});

test('classifyOutcome — BR-OQ-005: 408/425/429 são os 4xx que merecem retry', () => {
  for (const status of [408, 425, 429]) {
    const r = Q.classifyOutcome({ status, attempts: 1 });
    assert.equal(r.action, 'retry', `status ${status} é transitório apesar de 4xx`);
    assert.equal(r.reason, 'transitorio');
  }
});

test('classifyOutcome — BR-OQ-006: falha de rede volta pra fila', () => {
  const r = Q.classifyOutcome({ networkError: true, attempts: 1 });
  assert.equal(r.action, 'retry');
  assert.equal(r.reason, 'rede');
});

test('classifyOutcome — resposta sem status é tratada como falha de rede', () => {
  for (const o of [{}, { status: null }, { status: undefined }, { status: NaN }]) {
    const r = Q.classifyOutcome({ ...o, attempts: 1 });
    assert.equal(r.action, 'retry', 'sem resposta HTTP = não chegou = tenta de novo');
  }
});

test('classifyOutcome — BR-OQ-007: tentativas esgotadas param o retry e notificam', () => {
  const max = Q.MAX_ATTEMPTS;
  const antes = Q.classifyOutcome({ networkError: true, attempts: max - 1, maxAttempts: max });
  assert.equal(antes.action, 'retry', 'ainda há tentativa sobrando');

  const noLimite = Q.classifyOutcome({ networkError: true, attempts: max, maxAttempts: max });
  assert.equal(noLimite.action, 'drop', 'no limite tem que parar');
  assert.equal(noLimite.reason, 'esgotado');
  assert.equal(noLimite.notify, true, 'desistir em silêncio perde o trabalho da obra sem avisar');

  const passou = Q.classifyOutcome({ status: 500, attempts: max + 3, maxAttempts: max });
  assert.equal(passou.action, 'drop');
});

test('classifyOutcome — sucesso não é afetado pelo esgotamento de tentativas', () => {
  const r = Q.classifyOutcome({ status: 200, attempts: 99, maxAttempts: 5 });
  assert.equal(r.action, 'ok', 'chegou é chegou, mesmo na última tentativa');
});

// ─── backoffDelay (BR-OQ-008) ────────────────────────────────────────────────

test('backoffDelay — BR-OQ-008: cresce exponencialmente', () => {
  const opts = { base: 1000, max: 10 * 60 * 1000, jitter: 0 };
  assert.equal(Q.backoffDelay(1, opts), 1000);
  assert.equal(Q.backoffDelay(2, opts), 2000);
  assert.equal(Q.backoffDelay(3, opts), 4000);
  assert.equal(Q.backoffDelay(4, opts), 8000);
});

test('backoffDelay — BR-OQ-008: nunca diminui ao aumentar a tentativa', () => {
  const opts = { base: 500, max: 60_000, jitter: 0 };
  let anterior = -1;
  for (let n = 1; n <= 30; n++) {
    const d = Q.backoffDelay(n, opts);
    assert.ok(d >= anterior, `tentativa ${n} esperou MENOS que a anterior (${d} < ${anterior})`);
    anterior = d;
  }
});

test('backoffDelay — BR-OQ-008: respeita o teto mesmo com jitter no máximo', () => {
  const max = 30_000;
  for (const jitter of [0, 0.5, 1, 2, -1]) {
    for (const n of [1, 5, 10, 50, 1000, Infinity]) {
      const d = Q.backoffDelay(n, { base: 2000, max, jitter });
      assert.ok(d <= max, `tentativa ${n} (jitter ${jitter}) estourou o teto: ${d} > ${max}`);
      assert.ok(d > 0 && Number.isFinite(d), `espera inválida: ${d}`);
    }
  }
});

test('backoffDelay — o jitter só adiciona, nunca antecipa o reenvio', () => {
  const opts = { base: 1000, max: 600_000 };
  const semJitter = Q.backoffDelay(3, { ...opts, jitter: 0 });
  const comJitter = Q.backoffDelay(3, { ...opts, jitter: 1 });
  assert.ok(comJitter >= semJitter, 'jitter negativo bateria todos os celulares no servidor juntos');
  assert.ok(comJitter <= semJitter * 1.5, 'jitter exagerado atrasa demais o RDO');
});

test('backoffDelay — tentativa inválida cai na espera base', () => {
  const opts = { base: 1500, max: 60_000, jitter: 0 };
  for (const n of [0, -3, null, undefined, NaN, 'abc']) {
    assert.equal(Q.backoffDelay(n, opts), 1500, `tentativa ${JSON.stringify(n)} deveria usar a base`);
  }
});

test('backoffDelay — sem opts usa as constantes do módulo', () => {
  assert.equal(Q.backoffDelay(1), Q.BASE_DELAY_MS);
  assert.ok(Q.backoffDelay(99) <= Q.MAX_DELAY_MS);
});

test('nextAttemptAt / isDue — item só é reenviado depois da espera', () => {
  const agora = 1_000_000;
  const quando = Q.nextAttemptAt(2, agora, { base: 1000, max: 60_000, jitter: 0 });
  assert.equal(quando, agora + 2000);

  assert.equal(Q.isDue({ nextAttemptAt: quando }, agora), false, 'não pode reenviar antes da hora');
  assert.equal(Q.isDue({ nextAttemptAt: quando }, quando), true, 'na hora exata já pode');
  assert.equal(Q.isDue({ nextAttemptAt: quando }, quando + 1), true);
  assert.equal(Q.isDue({}, agora), true, 'item novo, sem espera marcada, é elegível na hora');
});

// ─── sortQueue (BR-OQ-009) ───────────────────────────────────────────────────

test('sortQueue — BR-OQ-009: reenvia na ordem de enfileiramento', () => {
  const fora = [
    { seq: 3, url: '/api/contracts/7/rdos/9/fotos' },
    { seq: 1, url: '/api/contracts/7/rdos' },
    { seq: 2, url: '/api/contracts/7/rdos/9' },
  ];
  const ordenada = Q.sortQueue(fora);
  assert.deepEqual(
    mesmoRealm(ordenada).map((i) => i.seq),
    [1, 2, 3],
    'a foto não pode chegar antes do RDO que a contém'
  );
  // não muta a entrada
  assert.equal(fora[0].seq, 3, 'sortQueue não pode reordenar o array do chamador');
});

test('sortQueue — desempata por timestamp quando não há seq', () => {
  const r = Q.sortQueue([{ ts: 30 }, { ts: 10 }, { ts: 20 }]);
  assert.deepEqual(mesmoRealm(r).map((i) => i.ts), [10, 20, 30]);
});

test('sortQueue — entrada inválida devolve lista vazia', () => {
  for (const v of [null, undefined, 'texto', 42, {}]) {
    assert.deepEqual(mesmoRealm(Q.sortQueue(v)), []);
  }
});

// ─── Idempotência (BR-OQ-010) ────────────────────────────────────────────────

test('newIdempotencyKey — chave hex de tamanho fixo e determinística dado o rand', () => {
  let i = 0;
  const rand = () => [0.1, 0.2, 0.3, 0.4][i++ % 4];
  const a = Q.newIdempotencyKey(rand);
  i = 0;
  const b = Q.newIdempotencyKey(rand);
  assert.equal(a, b, 'mesmo rand tem que dar a mesma chave (função pura)');
  assert.match(a, /^[0-9a-f]{32}$/, 'a chave precisa ser hex estável para o hash do servidor');
});

test('newIdempotencyKey — rands diferentes geram chaves diferentes', () => {
  const a = Q.newIdempotencyKey(() => 0.123456);
  const b = Q.newIdempotencyKey(() => 0.654321);
  assert.notEqual(a, b, 'dois lançamentos distintos não podem compartilhar chave');
});

test('shouldAttachIdempotencyKey — BR-OQ-010: JSON leva chave, multipart não', () => {
  const base = { method: 'POST', url: '/api/contracts/7/rdos' };
  assert.equal(Q.shouldAttachIdempotencyKey({ ...base, bodyKind: 'json' }), true);
  assert.equal(Q.shouldAttachIdempotencyKey({ ...base, bodyKind: 'none' }), true);
  // O servidor faz hash do corpo; com multipart o hash não é estável e o replay
  // legítimo tomaria 422 "Idempotency-Key já usada com um corpo diferente".
  assert.equal(Q.shouldAttachIdempotencyKey({ ...base, bodyKind: 'formdata' }), false);
  assert.equal(Q.shouldAttachIdempotencyKey({ ...base, bodyKind: 'binary' }), false);
});

test('shouldAttachIdempotencyKey — GET e rota de fora nunca levam chave', () => {
  assert.equal(Q.shouldAttachIdempotencyKey({ method: 'GET', url: '/api/contracts', bodyKind: 'none' }), false);
  assert.equal(Q.shouldAttachIdempotencyKey({ method: 'POST', url: '/js/app.js', bodyKind: 'json' }), false);
  assert.equal(Q.shouldAttachIdempotencyKey({ method: 'POST', url: '/api/auth/login', bodyKind: 'json' }), false);
});

// ─── Resumo para a UI ────────────────────────────────────────────────────────

test('queueSummary — separa pendentes de itens que já falharam', () => {
  const r = Q.queueSummary([{ ultimoErro: null }, { ultimoErro: 'timeout' }, {}]);
  assert.equal(r.total, 3);
  assert.equal(r.comErro, 1);
  assert.equal(r.pendentes, 2);
  assert.deepEqual({ ...Q.queueSummary(null) }, { total: 0, comErro: 0, pendentes: 0 });
});

test('describeQueue — texto em pt-BR, singular/plural, e vazio quando não há fila', () => {
  assert.equal(Q.describeQueue(0), '');
  assert.equal(Q.describeQueue(null), '');
  assert.equal(Q.describeQueue(-2), '');
  assert.equal(Q.describeQueue(1), '1 registro aguardando envio');
  assert.equal(Q.describeQueue(3), '3 registros aguardando envio');
});

// ─── Cenário completo: RDO preenchido na obra sem sinal ──────────────────────

test('cenário — RDO offline: enfileira, tenta com backoff e sincroniza ao voltar o sinal', () => {
  const req = { method: 'POST', url: '/api/contracts/7/rdos', online: false };
  assert.equal(Q.shouldQueue(req), true);

  // Duas tentativas sem sinal → continua na fila, esperando cada vez mais.
  const d1 = Q.backoffDelay(1, { jitter: 0 });
  const d2 = Q.backoffDelay(2, { jitter: 0 });
  assert.equal(Q.classifyOutcome({ networkError: true, attempts: 1 }).action, 'retry');
  assert.equal(Q.classifyOutcome({ networkError: true, attempts: 2 }).action, 'retry');
  assert.ok(d2 > d1);

  // Voltou o sinal, o servidor aceita → sai da fila.
  assert.equal(Q.classifyOutcome({ status: 201, attempts: 3 }).action, 'ok');
});

test('cenário — RDO recusado por regra: sai da fila e vira notificação, sem loop', () => {
  const r = Q.classifyOutcome({ status: 422, attempts: 1 });
  assert.equal(r.action, 'drop');
  assert.equal(r.notify, true);
  // Repetir a mesma classificação nunca vira retry (garante que não há loop).
  for (let n = 1; n <= 10; n++) {
    assert.equal(Q.classifyOutcome({ status: 422, attempts: n }).action, 'drop');
  }
});
