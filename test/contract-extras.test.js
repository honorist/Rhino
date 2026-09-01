'use strict';
/**
 * Handler dos sub-recursos "leves" de Contrato: Orçamento, Aditivos, Marcos e
 * Ocorrências (handlers/contract-extras.js), com `repos` dublado — nada toca
 * o Postgres.
 *  - Orçamento (budget) bloqueia item que ultrapasse o valor do contrato,
 *    tanto na criação quanto na edição (recalculando o total SEM o próprio
 *    item ao editar, senão o item se contaria 2x contra o próprio teto);
 *  - Aditivos/Marcos/Ocorrências: descrição/título obrigatórios na criação;
 *    PUT só grava campos da allowlist e devolve 404 se o id não existir;
 *    "concluído"/"encerrada" carimbam data automaticamente.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/contract-extras');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { contracts: repos.contracts, aditivos: repos.aditivos, marcos: repos.marcos, ocorrencias: repos.ocorrencias };
let contract, added, updated, removed;

beforeEach(() => {
  contract = { id: 'C1', value: 10000, budget: [{ id: 'bud1', value: 4000 }] };
  added = null; updated = []; removed = [];
  repos.contracts = {
    findById: async (id) => (id === 'C1' ? contract : null),
    getEnvelope: async () => ({ contracts: [contract] }),
    addBudgetItem: async (cid, item) => { added = item; contract.budget.push(item); },
    updateBudgetItem: async (cid, itemId, patch) => {
      const b = contract.budget.find((x) => x.id === itemId);
      Object.assign(b, patch);
      updated.push({ itemId, patch });
    },
    removeBudgetItem: async (cid, itemId) => { contract.budget = contract.budget.filter((b) => b.id !== itemId); removed.push(itemId); },
  };
  const subRepo = () => ({
    create: async (data) => { added = data; return data; },
    updateById: async (id, patch) => {
      if (id === 'naoexiste') return null;
      updated.push({ id, patch });
      return { id, ...patch };
    },
    removeById: async (id) => { removed.push(id); return true; },
  });
  repos.aditivos = subRepo();
  repos.marcos = subRepo();
  repos.ocorrencias = subRepo();
});

function restore() {
  Object.assign(repos, orig);
}

// ---------------- Orçamento ----------------

test('budget POST — contrato inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePostBudgetItem('CX', { value: 100 }, res);
  assert.equal(res.status, 404);
  restore();
});

test('budget POST — dentro do teto é aceito', async () => {
  const res = fakeRes();
  await h.handlePostBudgetItem('C1', { description: 'Mão de obra', value: 3000 }, res);
  assert.equal(res.status, 200);
  assert.equal(added.value, 3000);
  restore();
});

test('budget POST — ultrapassa o valor do contrato devolve 400 sem adicionar', async () => {
  const res = fakeRes();
  await h.handlePostBudgetItem('C1', { value: 6001 }, res); // 4000 já + 6001 > 10000
  assert.equal(res.status, 400);
  assert.match(res.body.error, /ultrapassa o valor do contrato/);
  assert.equal(contract.budget.length, 1);
  restore();
});

test('budget PUT — item inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutBudgetItem('C1', 'naoexiste', { value: 100 }, res);
  assert.equal(res.status, 404);
  restore();
});

test('budget PUT — recalcula o teto SEM contar o próprio item (não se conta 2x)', async () => {
  // Só 1 item (bud1=4000) e o teto é 10000 — subir bud1 pra 9999 não deve contar
  // os 4000 originais dele contra o próprio novo valor.
  const res = fakeRes();
  await h.handlePutBudgetItem('C1', 'bud1', { value: 9999 }, res);
  assert.equal(res.status, 200);
  assert.equal(updated[0].patch.value, 9999);
  restore();
});

test('budget PUT — outro item empurra o total além do teto devolve 400', async () => {
  contract.budget.push({ id: 'bud2', value: 5000 }); // total agora 9000
  const res = fakeRes();
  await h.handlePutBudgetItem('C1', 'bud1', { value: 5001 }, res); // 5000(outro) + 5001 > 10000
  assert.equal(res.status, 400);
  assert.equal(updated.length, 0);
  restore();
});

test('budget DELETE — remove o item do orçamento', async () => {
  const res = fakeRes();
  await h.handleDeleteBudgetItem('C1', 'bud1', res);
  assert.equal(res.status, 200);
  assert.deepEqual(removed, ['bud1']);
  restore();
});

// ---------------- Aditivos ----------------

test('aditivo POST — sem descrição devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostAditivo('C1', { numero: '01' }, res);
  assert.equal(res.status, 400);
  assert.equal(added, null);
  restore();
});

test('aditivo POST — cria com defaults (tipo=valor, diasDelta=0, aprovado=false)', async () => {
  const res = fakeRes();
  await h.handlePostAditivo('C1', { descricao: 'Aumento de escopo', valorDelta: '1500' }, res);
  assert.equal(res.status, 200);
  assert.equal(added.tipo, 'valor');
  assert.equal(added.valorDelta, 1500);
  assert.equal(added.diasDelta, 0);
  assert.equal(added.aprovado, false);
  restore();
});

test('aditivo PUT — id inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutAditivo('C1', 'naoexiste', { descricao: 'X' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('aditivo PUT — só grava campos da allowlist + coage aprovado pra bool', async () => {
  const res = fakeRes();
  await h.handlePutAditivo('C1', 'adi1', { descricao: 'Novo texto', aprovado: 'sim', hackField: 'x' }, res);
  assert.equal(res.status, 200);
  assert.equal(updated[0].patch.descricao, 'Novo texto');
  assert.equal(updated[0].patch.aprovado, true);
  assert.equal(updated[0].patch.hackField, undefined);
  restore();
});

test('aditivo DELETE — remove pelo id', async () => {
  const res = fakeRes();
  await h.handleDeleteAditivo('C1', 'adi1', res);
  assert.deepEqual(removed, ['adi1']);
  restore();
});

// ---------------- Marcos ----------------

test('marco POST — sem título devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostMarco('C1', { descricao: 'X' }, res);
  assert.equal(res.status, 400);
  restore();
});

test('marco POST — cria com concluido=false e ordem default 0', async () => {
  const res = fakeRes();
  await h.handlePostMarco('C1', { titulo: 'Fundação pronta' }, res);
  assert.equal(res.status, 200);
  assert.equal(added.concluido, false);
  assert.equal(added.ordem, 0);
  restore();
});

test('marco PUT — marcar concluido carimba concluidoEm com hoje quando não informado', async () => {
  const res = fakeRes();
  await h.handlePutMarco('C1', 'mrc1', { concluido: true }, res);
  assert.equal(res.status, 200);
  assert.equal(updated[0].patch.concluido, true);
  assert.match(updated[0].patch.concluidoEm, /^\d{4}-\d{2}-\d{2}$/);
  restore();
});

test('marco PUT — desmarcar concluido zera concluidoEm', async () => {
  const res = fakeRes();
  await h.handlePutMarco('C1', 'mrc1', { concluido: false }, res);
  assert.equal(updated[0].patch.concluidoEm, null);
  restore();
});

test('marco PUT — id inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutMarco('C1', 'naoexiste', { titulo: 'X' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('marco DELETE — remove pelo id', async () => {
  const res = fakeRes();
  await h.handleDeleteMarco('C1', 'mrc1', res);
  assert.deepEqual(removed, ['mrc1']);
  restore();
});

// ---------------- Ocorrências ----------------

test('ocorrência POST — sem descrição devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostOcorrencia('C1', {}, res);
  assert.equal(res.status, 400);
  restore();
});

test('ocorrência POST — cria com defaults (tipo=geral, severidade=media, encerrada=false)', async () => {
  const res = fakeRes();
  await h.handlePostOcorrencia('C1', { descricao: 'Falta de material' }, res);
  assert.equal(res.status, 200);
  assert.equal(added.tipo, 'geral');
  assert.equal(added.severidade, 'media');
  assert.equal(added.encerrada, false);
  restore();
});

test('ocorrência PUT — id inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutOcorrencia('C1', 'naoexiste', { descricao: 'X' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('ocorrência PUT — encerrar coage pra bool', async () => {
  const res = fakeRes();
  await h.handlePutOcorrencia('C1', 'ocr1', { encerrada: 1 }, res);
  assert.equal(updated[0].patch.encerrada, true);
  restore();
});

test('ocorrência DELETE — remove pelo id', async () => {
  const res = fakeRes();
  await h.handleDeleteOcorrencia('C1', 'ocr1', res);
  assert.deepEqual(removed, ['ocr1']);
  restore();
});
