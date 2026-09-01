'use strict';
/**
 * Orquestração do CRUD principal de Recursos (handlers/recursos.js), com
 * `repos` dublado — nada toca o Postgres.
 *  - POST monta o registro com defaults (status='candidato') e agora também
 *    grava `alocacaoAtual` quando enviado no body — regressão: antes desta
 *    correção, só o PUT persistia alocação; um recurso criado já como
 *    "Funcionário Ativo" com obra selecionada perdia a alocação silenciosamente
 *    (descoberto via E2E ao registrar folga logo após criar o recurso, D15 do
 *    plano async-wandering-kite);
 *  - PUT só grava campos da allowlist, ignora CPF mascarado (LGPD) e
 *    stringifica alocacaoAtual;
 *  - PUT em id inexistente devolve 404 sem quebrar.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/recursos');

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

const orig = { recursos: repos.recursos };

let created, updates, removed;

beforeEach(() => {
  created = null;
  updates = [];
  removed = [];
  repos.recursos = {
    create: async (data) => {
      created = data;
      return data;
    },
    updateById: async (id, patch) => {
      updates.push({ id, patch });
      if (id === 'naoexiste') return null;
      return { id, ...patch };
    },
    removeById: async (id) => {
      removed.push(id);
      return true;
    },
    findAll: async () => [],
  };
});

function restore() {
  Object.assign(repos, { recursos: orig.recursos });
}

// ---------------- POST ----------------

test('POST — cria com status default "candidato" quando não informado', async () => {
  const res = fakeRes();
  await h.handlePostRecurso({ nome: 'Fulano' }, res);
  assert.equal(res.status, 200);
  assert.equal(created.status, 'candidato');
  assert.equal(created.alocacaoAtual, null);
  restore();
});

test('POST — grava alocacaoAtual (stringificado) quando enviado no body', async () => {
  const res = fakeRes();
  const alocacaoAtual = { contractId: 'ctr_1', dataInicio: '2026-01-01', cicloTrabalho: 21, cicloFolga: 7 };
  await h.handlePostRecurso({ nome: 'Fulano', status: 'funcionario', alocacaoAtual }, res);
  assert.equal(res.status, 200);
  assert.equal(created.status, 'funcionario');
  assert.equal(created.alocacaoAtual, JSON.stringify(alocacaoAtual));
  restore();
});

test('POST — folgas/documentos/historicoAlocacoes nascem como arrays JSON vazios', async () => {
  const res = fakeRes();
  await h.handlePostRecurso({ nome: 'Fulano' }, res);
  assert.equal(created.folgas, '[]');
  assert.equal(created.documentos, '[]');
  assert.equal(created.historicoAlocacoes, '[]');
  restore();
});

// ---------------- PUT ----------------

test('PUT — grava só campos da allowlist, ignora campos fora dela', async () => {
  const res = fakeRes();
  await h.handlePutRecurso('r1', { nome: 'Novo Nome', idHackeado: 'x', cpf: '123.456.789-00' }, res);
  assert.equal(res.status, 200);
  assert.equal(updates[0].id, 'r1');
  assert.equal(updates[0].patch.nome, 'Novo Nome');
  assert.equal(updates[0].patch.cpf, '123.456.789-00');
  assert.equal(updates[0].patch.idHackeado, undefined);
  restore();
});

test('PUT — CPF mascarado (contém •) é ignorado, mantém o real no banco (LGPD)', async () => {
  const res = fakeRes();
  await h.handlePutRecurso('r1', { nome: 'X', cpf: '•••.•••.789-••' }, res);
  assert.equal(res.status, 200);
  assert.equal(updates[0].patch.cpf, undefined);
  restore();
});

test('PUT — stringifica alocacaoAtual quando enviado', async () => {
  const res = fakeRes();
  const alocacaoAtual = { contractId: 'ctr_2', dataInicio: '2026-02-01', cicloTrabalho: 14, cicloFolga: 7 };
  await h.handlePutRecurso('r1', { alocacaoAtual }, res);
  assert.equal(updates[0].patch.alocacaoAtual, JSON.stringify(alocacaoAtual));
  restore();
});

test('PUT — alocacaoAtual=null grava null (desalocação)', async () => {
  const res = fakeRes();
  await h.handlePutRecurso('r1', { alocacaoAtual: null }, res);
  assert.equal(updates[0].patch.alocacaoAtual, null);
  restore();
});

test('PUT — id inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutRecurso('naoexiste', { nome: 'X' }, res);
  assert.equal(res.status, 404);
  restore();
});

// ---------------- DELETE ----------------

test('DELETE — remove pelo id', async () => {
  const res = fakeRes();
  await h.handleDeleteRecurso('r1', res);
  assert.equal(res.status, 200);
  assert.deepEqual(removed, ['r1']);
  restore();
});
