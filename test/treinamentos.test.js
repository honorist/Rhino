'use strict';
/**
 * Orquestração dos handlers da Matriz de treinamentos (handlers/treinamentos.js),
 * com `repos` dublado — nada toca o Postgres. As regras puras (status de
 * validade, bloqueio, resumo) são cobertas por test/treinamento.test.js; aqui
 * garanto o que o handler faz por cima:
 *  - POST calcula data_validade = data_realizacao + validade_meses quando não vem;
 *  - POST em recurso inexistente responde 404 e não cria;
 *  - treinamento de outro colaborador não pode ser editado/apagado (404, sem escrever);
 *  - PUT que muda validade_meses recalcula data_validade;
 *  - toda resposta é o envelope { treinamentos } com `statusValidade`.
 *
 * `repos.treinamentos` ainda não está no barrel; o TESTE injeta o dublê e o
 * handler o lê em runtime — funciona igual ao padrão do punch.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/treinamentos');

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

const orig = {
  recursos: repos.recursos,
  treinamentos: repos.treinamentos,
};

let store; // created/updates/removed + itens indexados por id (findById/findAll)

beforeEach(() => {
  store = {
    lista: [],
    created: null,
    updates: [],
    removed: [],
    byId: {
      t1: {
        id: 't1', recursoId: 'R1', nr: 'NR-10',
        dataRealizacao: '2026-01-10', validadeMeses: 24, dataValidade: '2028-01-10',
      },
      tX: {
        id: 'tX', recursoId: 'R2', nr: 'NR-35',
        dataRealizacao: '2026-01-10', validadeMeses: 24, dataValidade: '2028-01-10',
      },
    },
  };

  repos.recursos = { findById: async (id) => (id === 'R1' ? { id: 'R1', nome: 'Fulano' } : null) };
  repos.treinamentos = {
    findAll: async () => store.lista,
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
  Object.assign(repos, { recursos: orig.recursos, treinamentos: orig.treinamentos });
}

// ── 1. POST calcula data_validade a partir de realização + meses ─────────────
test('POST deriva data_validade = data_realizacao + validade_meses', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostTreinamento('R1', { nr: 'NR-35', dataRealizacao: '2026-03-15', validadeMeses: 24 }, res);
  assert.equal(res.status, 200);
  assert.equal(store.created.recursoId, 'R1');
  assert.equal(store.created.nr, 'NR-35');
  assert.equal(store.created.dataValidade, '2028-03-15', 'realização + 24 meses');
  assert.equal(store.created.validadeMeses, 24);
});

test('POST usa data_validade explícita quando enviada (não recalcula)', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostTreinamento('R1', { nr: 'NR-10', dataRealizacao: '2026-01-01', validadeMeses: 12, dataValidade: '2030-12-31' }, res);
  assert.equal(res.status, 200);
  assert.equal(store.created.dataValidade, '2030-12-31');
});

test('POST sem data_realizacao fica sem data_validade', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostTreinamento('R1', { nr: 'NR-06' }, res);
  assert.equal(res.status, 200);
  assert.equal(store.created.dataValidade, null);
  assert.equal(store.created.dataRealizacao, null);
});

test('POST sem NR responde 400 e não cria', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostTreinamento('R1', { descricao: 'sem nr' }, res);
  assert.equal(res.status, 400);
  assert.equal(store.created, null);
});

test('POST em recurso inexistente responde 404 e não cria', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostTreinamento('SUMIU', { nr: 'NR-10' }, res);
  assert.equal(res.status, 404);
  assert.equal(store.created, null);
});

test('POST com data inválida responde 400 e não cria', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostTreinamento('R1', { nr: 'NR-10', dataRealizacao: '15/03/2026' }, res);
  assert.equal(res.status, 400);
  assert.equal(store.created, null);
});

// ── 2. PUT que muda validade_meses recalcula data_validade ───────────────────
test('PUT recalcula data_validade ao mudar validade_meses', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutTreinamento('R1', 't1', { validadeMeses: 12 }, res);
  assert.equal(res.status, 200);
  const upd = store.updates.find((u) => u.id === 't1');
  assert.ok(upd, 'chamou updateById para t1');
  assert.equal(upd.patch.validadeMeses, 12);
  // t1.dataRealizacao = 2026-01-10; +12m → 2027-01-10
  assert.equal(upd.patch.dataValidade, '2027-01-10');
});

test('PUT com data_validade explícita não é sobrescrita pelo recálculo', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutTreinamento('R1', 't1', { validadeMeses: 6, dataValidade: '2029-09-09' }, res);
  const upd = store.updates.find((u) => u.id === 't1');
  assert.equal(upd.patch.dataValidade, '2029-09-09');
});

// ── 3. Ownership: treinamento de outro colaborador → 404 sem escrever ────────
test('PUT em treinamento de outro colaborador responde 404 e não escreve', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutTreinamento('R1', 'tX', { nr: 'NR-99' }, res);
  assert.equal(res.status, 404);
  assert.equal(store.updates.length, 0);
});

test('DELETE em treinamento de outro colaborador responde 404 e não remove', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleDeleteTreinamento('R1', 'tX', res);
  assert.equal(res.status, 404);
  assert.equal(store.removed.length, 0);
});

// ── 4. LIST devolve o envelope { treinamentos } com statusValidade ───────────
test('LIST devolve treinamentos com statusValidade calculado', async (t) => {
  t.after(restore);
  store.lista = [
    { id: 'a', recursoId: 'R1', nr: 'NR-10', dataValidade: '2020-01-01' }, // vencido
    { id: 'b', recursoId: 'R1', nr: 'NR-06', dataValidade: null }, // sem_validade
  ];
  const res = fakeRes();
  await h.handleListTreinamentos('R1', res);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.treinamentos));
  const a = res.body.treinamentos.find((x) => x.id === 'a');
  const b = res.body.treinamentos.find((x) => x.id === 'b');
  assert.equal(a.statusValidade, 'vencido');
  assert.equal(b.statusValidade, 'sem_validade');
});

test('LIST em recurso inexistente responde 404', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleListTreinamentos('SUMIU', res);
  assert.equal(res.status, 404);
});

// ── 5. DELETE remove o treinamento do próprio colaborador ────────────────────
test('DELETE remove o treinamento e devolve o envelope', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleDeleteTreinamento('R1', 't1', res);
  assert.equal(res.status, 200);
  assert.deepEqual(store.removed, ['t1']);
  assert.ok(Array.isArray(res.body.treinamentos));
});
