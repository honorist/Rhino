'use strict';
/**
 * Orquestração dos handlers de SSMA (handlers/ssma.js), com `repos` dublado —
 * nada toca o Postgres. As regras puras (TF/TG, resumo) já são cobertas por
 * test/ssma.test.js; aqui garanto o que o handler faz por cima:
 *  - POST cria com defaults e carimba encerrado_em quando nasce 'encerrado';
 *  - POST sem descrição responde 400 sem criar;
 *  - PUT que encerra carimba encerrado_em no patch; reabrir limpa;
 *  - ocorrência de outra obra não pode ser editada/apagada (404, sem escrever);
 *  - toda resposta é o envelope { ocorrencias, resumo (com TF/TG do HHT) };
 *  - o HHT vem dos RDOs (soma totais.totalHomemHora) ou de ?hht= na query.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/ssma');

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
  contracts: repos.contracts,
  ssmaOcorrencias: repos.ssmaOcorrencias,
  rdos: repos.rdos,
};

let store; // ocorrencias/created/updates/removed + indexadas por id (findById)
let rdosRows; // linhas devolvidas por repos.rdos.findAll (HHT)

beforeEach(() => {
  rdosRows = [];
  store = {
    ocorrencias: [],
    created: null,
    updates: [],
    removed: [],
    byId: {
      o1: {
        id: 'o1', contractId: 'C1', descricao: 'Colaborador sem cinto',
        tipo: 'desvio', gravidade: 'media', status: 'aberto',
        comAfastamento: false, diasPerdidos: 0, encerradoEm: null,
      },
      oX: {
        id: 'oX', contractId: 'C2', descricao: 'Ocorrência de outra obra',
        tipo: 'desvio', gravidade: 'media', status: 'aberto',
        comAfastamento: false, diasPerdidos: 0, encerradoEm: null,
      },
    },
  };

  repos.contracts = { findById: async (id) => (id === 'C1' ? { id: 'C1', name: 'Obra' } : null) };
  repos.ssmaOcorrencias = {
    findAll: async () => store.ocorrencias,
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
  repos.rdos = { findAll: async () => rdosRows };
});

function restore() {
  Object.assign(repos, {
    contracts: orig.contracts,
    ssmaOcorrencias: orig.ssmaOcorrencias,
    rdos: orig.rdos,
  });
}

// ── 1. POST cria com defaults e status inicial ──────────────────────────────
test('POST status aberto: encerradoEm null e defaults aplicados', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostSsma(
    'C1',
    { descricao: 'Andaime sem guarda-corpo', responsavelId: 'rec9', prazo: '2026-08-01' },
    res
  );
  assert.equal(res.status, 200);
  assert.equal(store.created.contractId, 'C1');
  assert.equal(store.created.tipo, 'desvio'); // default
  assert.equal(store.created.gravidade, 'media'); // default
  assert.equal(store.created.status, 'aberto'); // default
  assert.equal(store.created.encerradoEm, null); // não encerrado → sem carimbo
  assert.equal(store.created.responsavelId, 'rec9');
});

test('POST status encerrado carimba encerradoEm', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostSsma('C1', { descricao: 'Já resolvido', status: 'encerrado' }, res);
  assert.equal(res.status, 200);
  assert.equal(store.created.status, 'encerrado');
  assert.ok(store.created.encerradoEm, 'encerradoEm não-nulo ao nascer encerrado');
});

test('POST sem descrição responde 400 e não cria', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostSsma('C1', { tipo: 'acidente' }, res);
  assert.equal(res.status, 400);
  assert.equal(store.created, null);
});

test('POST em contrato inexistente responde 404 e não cria', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostSsma('SUMIU', { descricao: 'X' }, res);
  assert.equal(res.status, 404);
  assert.equal(store.created, null);
});

// ── 2. PUT que encerra carimba encerradoEm; reabrir limpa ───────────────────
test('PUT status encerrado grava encerradoEm não-nulo no patch', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutSsma('C1', 'o1', { status: 'encerrado' }, res);
  assert.equal(res.status, 200);
  const upd = store.updates.find((u) => u.id === 'o1');
  assert.ok(upd, 'chamou updateById para o1');
  assert.equal(upd.patch.status, 'encerrado');
  assert.ok(upd.patch.encerradoEm, 'encerradoEm não-nulo');
});

test('PUT reabrindo (status aberto) limpa encerradoEm', async (t) => {
  t.after(restore);
  store.byId.o1.status = 'encerrado';
  store.byId.o1.encerradoEm = '2026-07-01T00:00:00.000Z';
  const res = fakeRes();
  await h.handlePutSsma('C1', 'o1', { status: 'aberto' }, res);
  assert.equal(res.status, 200);
  const upd = store.updates.find((u) => u.id === 'o1');
  assert.equal(upd.patch.status, 'aberto');
  assert.equal(upd.patch.encerradoEm, null, 'reabrir limpa o carimbo');
});

test('PUT sem descrição válida (vazia) responde 400 sem escrever', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutSsma('C1', 'o1', { descricao: '   ' }, res);
  assert.equal(res.status, 400);
  assert.equal(store.updates.length, 0);
});

// ── 3. Ownership: item de outra obra → 404 sem escrever ─────────────────────
test('PUT em ocorrência de outro contrato responde 404 e não escreve', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutSsma('C1', 'oX', { descricao: 'tentando editar' }, res);
  assert.equal(res.status, 404);
  assert.equal(store.updates.length, 0);
});

test('DELETE em ocorrência de outro contrato responde 404 e não remove', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleDeleteSsma('C1', 'oX', res);
  assert.equal(res.status, 404);
  assert.equal(store.removed.length, 0);
});

test('DELETE em ocorrência do contrato remove e responde 200', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleDeleteSsma('C1', 'o1', res);
  assert.equal(res.status, 200);
  assert.deepEqual(store.removed, ['o1']);
});

// ── 4. LIST devolve o envelope { ocorrencias, resumo } com TF/TG do HHT ──────
test('LIST devolve resumo com TF/TG calculados do HHT somado dos RDOs', async (t) => {
  t.after(restore);
  store.ocorrencias = [
    { id: 'a', contractId: 'C1', tipo: 'acidente', status: 'encerrado', comAfastamento: true, diasPerdidos: 5 },
    { id: 'b', contractId: 'C1', tipo: 'desvio', status: 'aberto', comAfastamento: false, diasPerdidos: 0 },
  ];
  rdosRows = [{ totais: { totalHomemHora: 60000 } }, { totais: { totalHomemHora: 40000 } }]; // HHT = 100.000
  const res = fakeRes();
  await h.handleListSsma('C1', res);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.ocorrencias));
  assert.equal(res.body.resumo.total, 2);
  assert.equal(res.body.resumo.comAfastamento, 1);
  assert.equal(res.body.resumo.diasPerdidos, 5);
  assert.equal(res.body.resumo.tf, 10); // 1 * 1e6 / 100000
  assert.equal(res.body.resumo.tg, 50); // 5 * 1e6 / 100000
});

test('LIST aceita HHT via ?hht= sobrepondo os RDOs', async (t) => {
  t.after(restore);
  store.ocorrencias = [
    { id: 'a', contractId: 'C1', tipo: 'acidente', status: 'aberto', comAfastamento: true, diasPerdidos: 0 },
  ];
  rdosRows = []; // sem RDOs → HHT viria de 0
  const res = fakeRes();
  await h.handleListSsma('C1', res, { hht: '200000' });
  assert.equal(res.status, 200);
  assert.equal(res.body.resumo.tf, 5); // 1 * 1e6 / 200000
});

test('LIST sem HHT disponível zera as taxas', async (t) => {
  t.after(restore);
  store.ocorrencias = [
    { id: 'a', contractId: 'C1', tipo: 'acidente', status: 'aberto', comAfastamento: true, diasPerdidos: 3 },
  ];
  rdosRows = [];
  const res = fakeRes();
  await h.handleListSsma('C1', res);
  assert.equal(res.status, 200);
  assert.equal(res.body.resumo.tf, 0);
  assert.equal(res.body.resumo.tg, 0);
});

test('LIST em contrato inexistente responde 404', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleListSsma('SUMIU', res);
  assert.equal(res.status, 404);
});
