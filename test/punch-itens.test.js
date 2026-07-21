'use strict';
/**
 * Orquestração dos handlers de Punch list / Qualidade (handlers/punch-itens.js),
 * com `repos` dublado — nada toca o Postgres. As regras puras (carimbos de
 * tempo, vencimento, resumo) já são cobertas por test/punch.test.js; aqui
 * garanto o que o handler faz por cima:
 *  - POST carimba os tempos a partir do status inicial e notifica o responsável;
 *  - PUT que muda status recarimba resolvido_em/verificado_em no patch;
 *  - item de outra obra não pode ser editado/apagado (404, sem escrever);
 *  - toda resposta é o envelope { itens (com `vencido`), resumo }.
 *
 * db.withTransaction não é usado por punch-itens (só por punch-fotos), então não
 * precisa ser dublado aqui.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/punch-itens');

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
  punchItens: repos.punchItens,
  notificacoes: repos.notificacoes,
};

let store; // itens/created/updates/removed + itens indexados por id (findById)
let notifCreates; // chamadas capturadas de repos.notificacoes.create

beforeEach(() => {
  notifCreates = [];
  store = {
    itens: [],
    created: null,
    updates: [],
    removed: [],
    byId: {
      p1: {
        id: 'p1', contractId: 'C1', titulo: 'Item da C1',
        responsavelId: null, resolvidoEm: null, verificadoEm: null,
        prazo: null, status: 'aberto',
      },
      pX: {
        id: 'pX', contractId: 'C2', titulo: 'Item de outra obra',
        responsavelId: null, resolvidoEm: null, verificadoEm: null,
        prazo: null, status: 'aberto',
      },
    },
  };

  repos.contracts = { findById: async (id) => (id === 'C1' ? { id: 'C1', name: 'Obra' } : null) };
  repos.punchItens = {
    findAll: async () => store.itens,
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
  repos.notificacoes = {
    create: async (n) => {
      notifCreates.push(n);
      return n;
    },
  };
});

function restore() {
  Object.assign(repos, {
    contracts: orig.contracts,
    punchItens: orig.punchItens,
    notificacoes: orig.notificacoes,
  });
}

// ── 1. POST cria com carimbos derivados do status e notifica o responsável ───
test('POST status aberto: resolvidoEm/verificadoEm null e notifica o responsável', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostPunch(
    'C1',
    { titulo: 'Vazamento na tubulação', responsavelId: 'rec9', prazo: '2026-08-01' },
    res
  );
  assert.equal(res.status, 200);
  // 'aberto' → sem carimbos de conclusão (BR-PUNCH-001).
  assert.equal(store.created.resolvidoEm, null);
  assert.equal(store.created.verificadoEm, null);
  assert.equal(store.created.contractId, 'C1');
  assert.equal(store.created.status, 'aberto');
  // Notificou exatamente o responsável indicado.
  assert.equal(notifCreates.length, 1);
  assert.equal(notifCreates[0].destinatario, 'rec9');
  assert.equal(notifCreates[0].tipo, 'punch.atribuido');
});

test('POST sem responsável não gera notificação', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostPunch('C1', { titulo: 'Item sem dono' }, res);
  assert.equal(res.status, 200);
  assert.equal(notifCreates.length, 0);
});

test('POST em contrato inexistente responde 404 e não cria', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePostPunch('SUMIU', { titulo: 'X' }, res);
  assert.equal(res.status, 404);
  assert.equal(store.created, null);
});

// ── 2. PUT mudando status para 'verificado' carimba os dois tempos ───────────
test('PUT status verificado grava resolvidoEm E verificadoEm não-nulos no patch', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutPunch('C1', 'p1', { status: 'verificado' }, res);
  assert.equal(res.status, 200);
  const upd = store.updates.find((u) => u.id === 'p1');
  assert.ok(upd, 'chamou updateById para p1');
  assert.equal(upd.patch.status, 'verificado');
  assert.ok(upd.patch.resolvidoEm, 'resolvidoEm não-nulo');
  assert.ok(upd.patch.verificadoEm, 'verificadoEm não-nulo');
});

// ── 3. Ownership: item de outra obra → 404 sem escrever ──────────────────────
test('PUT em item de outro contrato responde 404 e não escreve', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutPunch('C1', 'pX', { titulo: 'tentando editar' }, res);
  assert.equal(res.status, 404);
  assert.equal(store.updates.length, 0);
});

test('DELETE em item de outro contrato responde 404 e não remove', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleDeletePunch('C1', 'pX', res);
  assert.equal(res.status, 404);
  assert.equal(store.removed.length, 0);
});

// ── 4. LIST devolve o envelope { itens (com `vencido`), resumo } ─────────────
test('LIST devolve itens com flag vencido e resumo agregado', async (t) => {
  t.after(restore);
  // Prazos no passado; o item 'verificado' nunca vence (independe do dia de hoje).
  store.itens = [
    { id: 'a', contractId: 'C1', status: 'aberto', prazo: '2020-01-01', titulo: 'Atrasado' },
    { id: 'b', contractId: 'C1', status: 'verificado', prazo: '2020-01-01', titulo: 'Concluído' },
  ];
  const res = fakeRes();
  await h.handleListPunch('C1', res);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.itens));
  const a = res.body.itens.find((i) => i.id === 'a');
  const b = res.body.itens.find((i) => i.id === 'b');
  assert.equal(a.vencido, true, 'item aberto com prazo passado está vencido');
  assert.equal(b.vencido, false, 'item verificado nunca vence');
  assert.equal(res.body.resumo.total, 2);
  assert.equal(res.body.resumo.vencidos, 1);
  assert.equal(res.body.resumo.abertos, 1, 'só o não-verificado conta como aberto');
});

test('LIST em contrato inexistente responde 404', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleListPunch('SUMIU', res);
  assert.equal(res.status, 404);
});
