'use strict';
/**
 * Orquestração dos handlers de Composições (handlers/composicoes.js), com `repos`
 * dublado — nada toca o Postgres. A matemática (custo, resumo, normalização) já é
 * coberta por test/composicao.test.js; aqui garanto o que o handler faz por cima:
 *  - POST exige descricao e grava `itens` como STRING JSON (contrato do JSONB);
 *  - a resposta traz o custoUnitario/resumo já calculados;
 *  - PUT/DELETE em id inexistente → 404 sem escrever;
 *  - PUT só toca os campos presentes e recarimba updatedAt.
 *
 * Como o barrel db/repos ainda não exporta `composicoes`, o mock é injetado aqui
 * em repos.composicoes — o handler lê repos.composicoes só em runtime.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/composicoes');

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

const orig = { composicoes: repos.composicoes };
let store;

beforeEach(() => {
  store = {
    created: null,
    updates: [],
    removed: [],
    list: [],
    byId: {
      c1: {
        id: 'c1',
        codigo: '01.01',
        descricao: 'Alvenaria',
        unidade: 'm2',
        ativo: true,
        itens: [{ tipo: 'mo', descricao: 'Pedreiro', coef: 2, valorUnit: 10 }],
      },
    },
  };

  repos.composicoes = {
    findAll: async () => store.list,
    findById: async (id) => store.byId[id] || null,
    create: async (data) => {
      store.created = data;
      return { ...data };
    },
    updateById: async (id, patch) => {
      store.updates.push({ id, patch });
      return { ...store.byId[id], ...patch };
    },
    removeById: async (id) => {
      store.removed.push(id);
      return true;
    },
  };
});

function restore() {
  repos.composicoes = orig.composicoes;
}

// ── POST ─────────────────────────────────────────────────────────────────────
test('POST sem descrição responde 400 e não cria', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostComposicao({ codigo: '01' }, res);
  assert.equal(res.status, 400);
  assert.equal(store.created, null);
});

test('POST grava itens como STRING JSON e devolve custoUnitario calculado', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostComposicao(
    {
      descricao: 'Concreto',
      codigo: '02.01',
      unidade: 'm3',
      itens: [
        { tipo: 'mo', descricao: 'Servente', coef: 1.5, valorUnit: 20 }, // 30
        { tipo: 'material', descricao: 'Cimento', coef: 0.5, valorUnit: 30 }, // 15
      ],
    },
    res
  );
  assert.equal(res.status, 200);
  assert.ok(store.created, 'chamou create');
  assert.equal(store.created.descricao, 'Concreto');
  // JSONB precisa ser gravado como string (senão o pg vira array PG, não JSONB).
  assert.equal(typeof store.created.itens, 'string');
  assert.equal(JSON.parse(store.created.itens).length, 2);
  // Resposta traz o custo e o resumo prontos para o front.
  assert.equal(res.body.custoUnitario, 45);
  assert.equal(res.body.resumo.mo, 30);
  assert.equal(res.body.resumo.material, 15);
});

test('POST normaliza tipo desconhecido para material antes de gravar', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostComposicao(
    { descricao: 'X', itens: [{ tipo: 'foo', descricao: '?', coef: 2, valorUnit: 5 }] },
    res
  );
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(store.created.itens)[0].tipo, 'material');
  assert.equal(res.body.custoUnitario, 10);
  assert.equal(res.body.resumo.material, 10);
});

test('POST sem código grava codigo null (não string vazia)', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostComposicao({ descricao: 'Sem código' }, res);
  assert.equal(res.status, 200);
  assert.equal(store.created.codigo, null);
  assert.equal(store.created.unidade, 'un'); // default
});

// ── PUT ──────────────────────────────────────────────────────────────────────
test('PUT em id inexistente responde 404 e não escreve', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutComposicao('sumiu', { descricao: 'Y' }, res);
  assert.equal(res.status, 404);
  assert.equal(store.updates.length, 0);
});

test('PUT atualiza itens: grava normalizado e devolve custo novo + updatedAt', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutComposicao(
    'c1',
    { itens: [{ tipo: 'equipamento', descricao: 'Betoneira', coef: 1, valorUnit: 100 }] },
    res
  );
  assert.equal(res.status, 200);
  const upd = store.updates.find((u) => u.id === 'c1');
  assert.ok(upd, 'chamou updateById para c1');
  assert.equal(typeof upd.patch.itens, 'string');
  assert.ok(upd.patch.updatedAt, 'recarimba updatedAt');
  assert.equal(res.body.custoUnitario, 100);
  assert.equal(res.body.resumo.equipamento, 100);
});

test('PUT com descrição em branco responde 400 e não escreve', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutComposicao('c1', { descricao: '   ' }, res);
  assert.equal(res.status, 400);
  assert.equal(store.updates.length, 0);
});

// ── DELETE ───────────────────────────────────────────────────────────────────
test('DELETE em id inexistente responde 404 e não remove', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleDeleteComposicao('sumiu', res);
  assert.equal(res.status, 404);
  assert.equal(store.removed.length, 0);
});

test('DELETE remove a composição e devolve ok', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleDeleteComposicao('c1', res);
  assert.equal(res.status, 200);
  assert.deepEqual(store.removed, ['c1']);
  assert.equal(res.body.ok, true);
});

// ── LIST ─────────────────────────────────────────────────────────────────────
test('LIST devolve cada composição com custoUnitario calculado', async (t) => {
  t.after(restore);
  store.list = [
    { id: 'c1', descricao: 'A', itens: [{ tipo: 'mo', coef: 2, valorUnit: 10 }] }, // 20
    { id: 'c2', descricao: 'B', itens: [] }, // 0
  ];
  const res = fakeRes();
  await h.handleListComposicoes(res);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(res.body.find((x) => x.id === 'c1').custoUnitario, 20);
  assert.equal(res.body.find((x) => x.id === 'c2').custoUnitario, 0);
});
