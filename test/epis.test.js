'use strict';
/**
 * Orquestração dos handlers de Controle de EPIs (handlers/epis.js), com `repos`
 * dublado — nada toca o Postgres. As regras puras (status, precisa-troca,
 * resumo, cálculo da troca prevista) já são cobertas por test/epi.test.js; aqui
 * garanto o que o handler faz por cima:
 *  - POST calcula data_troca_prevista = entrega + vida útil quando não vem;
 *  - POST exige `epi` e valida o colaborador (404 sem escrever);
 *  - ficha de outro colaborador não pode ser editada/apagada (404, sem escrever);
 *  - PUT devolvido carimba a data de devolução;
 *  - toda resposta é o envelope { entregas (com `status`), resumo }.
 *
 * Como o barrel db/repos ainda não tem `epiEntregas`, o próprio teste define o
 * mock em repos.epiEntregas — funciona porque o handler lê repos.epiEntregas só
 * no runtime.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/epis');

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
  epiEntregas: repos.epiEntregas,
};

let store; // entregas/created/updates/removed + entregas indexadas por id (findById)

beforeEach(() => {
  store = {
    entregas: [],
    created: null,
    updates: [],
    removed: [],
    byId: {
      e1: {
        id: 'e1', recursoId: 'R1', epi: 'Capacete', ca: '123',
        quantidade: 1, dataEntrega: '2026-01-10', vidaUtilMeses: 6,
        dataTrocaPrevista: '2026-07-10', devolvido: false, dataDevolucao: null,
      },
      eX: {
        id: 'eX', recursoId: 'R2', epi: 'Luva', ca: null,
        quantidade: 2, dataEntrega: null, vidaUtilMeses: null,
        dataTrocaPrevista: null, devolvido: false, dataDevolucao: null,
      },
    },
  };

  repos.recursos = { findById: async (id) => (id === 'R1' ? { id: 'R1', nome: 'Colaborador' } : null) };
  repos.epiEntregas = {
    findAll: async () => store.entregas,
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
  Object.assign(repos, { recursos: orig.recursos, epiEntregas: orig.epiEntregas });
}

// ── 1. POST calcula a data de troca prevista a partir de entrega + vida útil ──
test('POST calcula data_troca_prevista = entrega + vida útil quando não vem', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostEpi('R1', { epi: 'Bota', dataEntrega: '2026-01-15', vidaUtilMeses: 6 }, res);
  assert.equal(res.status, 200);
  assert.equal(store.created.dataTrocaPrevista, '2026-07-15');
  assert.equal(store.created.recursoId, 'R1');
  assert.equal(store.created.epi, 'Bota');
  assert.equal(store.created.quantidade, 1);
});

test('POST respeita a data de troca informada explicitamente', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostEpi(
    'R1',
    { epi: 'Bota', dataEntrega: '2026-01-15', vidaUtilMeses: 6, dataTrocaPrevista: '2026-03-01' },
    res
  );
  assert.equal(res.status, 200);
  assert.equal(store.created.dataTrocaPrevista, '2026-03-01');
});

test('POST devolvido=true carimba a data de devolução', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostEpi('R1', { epi: 'Protetor', devolvido: true, dataDevolucao: '2026-05-05' }, res);
  assert.equal(res.status, 200);
  assert.equal(store.created.devolvido, true);
  assert.equal(store.created.dataDevolucao, '2026-05-05');
});

test('POST sem epi responde 400 e não cria', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostEpi('R1', { ca: 'só o CA' }, res);
  assert.equal(res.status, 400);
  assert.equal(store.created, null);
});

test('POST em colaborador inexistente responde 404 e não cria', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostEpi('SUMIU', { epi: 'Capacete' }, res);
  assert.equal(res.status, 404);
  assert.equal(store.created, null);
});

// ── 2. PUT recalcula a troca ao mudar a base, e carimba devolução ────────────
test('PUT mudando vida útil recalcula a data de troca prevista', async (t) => {
  t.after(restore);
  const res = fakeRes();
  // e1: dataEntrega 2026-01-10; nova vida útil 12 meses → troca 2027-01-10.
  await h.handlePutEpi('R1', 'e1', { vidaUtilMeses: 12 }, res);
  assert.equal(res.status, 200);
  const upd = store.updates.find((u) => u.id === 'e1');
  assert.ok(upd, 'chamou updateById para e1');
  assert.equal(upd.patch.vidaUtilMeses, 12);
  assert.equal(upd.patch.dataTrocaPrevista, '2027-01-10');
});

test('PUT devolvido=true carimba data; devolvido=false limpa', async (t) => {
  t.after(restore);
  const resOn = fakeRes();
  await h.handlePutEpi('R1', 'e1', { devolvido: true, dataDevolucao: '2026-06-01' }, resOn);
  const on = store.updates.find((u) => u.id === 'e1');
  assert.equal(on.patch.devolvido, true);
  assert.equal(on.patch.dataDevolucao, '2026-06-01');

  const resOff = fakeRes();
  await h.handlePutEpi('R1', 'e1', { devolvido: false }, resOff);
  const off = store.updates.filter((u) => u.id === 'e1').pop();
  assert.equal(off.patch.devolvido, false);
  assert.equal(off.patch.dataDevolucao, null);
});

// ── 3. Ownership: ficha de outro colaborador → 404 sem escrever ──────────────
test('PUT em ficha de outro colaborador responde 404 e não escreve', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutEpi('R1', 'eX', { epi: 'tentando editar' }, res);
  assert.equal(res.status, 404);
  assert.equal(store.updates.length, 0);
});

test('DELETE em ficha de outro colaborador responde 404 e não remove', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleDeleteEpi('R1', 'eX', res);
  assert.equal(res.status, 404);
  assert.equal(store.removed.length, 0);
});

// ── 4. LIST devolve o envelope { entregas (com status), resumo } ─────────────
test('LIST devolve entregas com status e resumo agregado', async (t) => {
  t.after(restore);
  store.entregas = [
    { id: 'a', recursoId: 'R1', epi: 'Capacete', dataTrocaPrevista: '2020-01-01', devolvido: false }, // trocar
    { id: 'b', recursoId: 'R1', epi: 'Luva', dataTrocaPrevista: '2099-01-01', devolvido: false }, // ativo
    { id: 'c', recursoId: 'R1', epi: 'Bota', dataTrocaPrevista: '2020-01-01', devolvido: true }, // devolvido
  ];
  const res = fakeRes();
  await h.handleListEpis('R1', res);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.entregas));
  const a = res.body.entregas.find((x) => x.id === 'a');
  const c = res.body.entregas.find((x) => x.id === 'c');
  assert.equal(a.status, 'trocar', 'não devolvido com troca vencida');
  assert.equal(c.status, 'devolvido', 'devolvido tem prioridade');
  assert.equal(res.body.resumo.total, 3);
  assert.equal(res.body.resumo.aTrocar, 1);
  assert.equal(res.body.resumo.ativos, 1);
  assert.equal(res.body.resumo.devolvidos, 1);
});

test('LIST em colaborador inexistente responde 404', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleListEpis('SUMIU', res);
  assert.equal(res.status, 404);
});
