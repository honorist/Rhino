'use strict';
/**
 * Handler da planilha de serviços do contrato (handlers/contract-servicos.js),
 * com `db`/`repos` dublados — nada toca o Postgres. Regras puras de medição
 * (lib/medicao.js) já cobertas em test/medicao.test.js; aqui garanto o que o
 * handler faz por cima:
 *  - GET devolve a planilha com saldo (med.saldoPorServico);
 *  - POST valida via lib/validate (servicoPost) e usa `ordem` = count+1 quando
 *    não informado;
 *  - PUT/DELETE tomam pg_advisory_xact_lock(contractId) — MESMO lock usado por
 *    saídas/medições (evita corrida real: leitura do medido + escrita do
 *    serviço na mesma seção crítica, ver comentário do arquivo);
 *  - PUT respeita BR-MED-005 (qtd contratada não pode cair abaixo do medido);
 *  - DELETE bloqueia serviço com medição acumulada (deve inativar, não excluir);
 *  - serviço de outro contrato (contractId não bate) devolve 404 em vez de
 *    vazar/mexer em dado de outra obra.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const h = require('../handlers/contract-servicos');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = {
  withTransaction: db.withTransaction,
  contracts: repos.contracts, contractServicos: repos.contractServicos, medicaoItens: repos.medicaoItens,
};

let servicos, updates, removed, created;
let clientQueries;

beforeEach(() => {
  clientQueries = [];
  updates = []; removed = []; created = null;
  servicos = [
    { id: 'srv1', contractId: 'C1', codigo: 'S01', descricao: 'Fundação', unidade: 'm3', qtdContratada: 100, precoUnit: 50, ativo: true },
  ];
  db.withTransaction = async (fn) => {
    const client = { query: async (sql, params) => { clientQueries.push({ sql, params }); return { rows: [] }; } };
    return fn(client);
  };
  repos.contracts = { findById: async (id) => (id === 'C1' ? { id: 'C1' } : null) };
  repos.contractServicos = {
    findAll: async ({ contractId }) => servicos.filter((s) => s.contractId === contractId),
    findById: async (id) => servicos.find((s) => s.id === id) || null,
    count: async () => servicos.length,
    create: async (data) => { created = data; servicos.push(data); return data; },
    updateById: async (id, patch) => { updates.push({ id, patch }); return { id, ...patch }; },
    removeById: async (id) => { removed.push(id); servicos = servicos.filter((s) => s.id !== id); return true; },
  };
  repos.medicaoItens = { somarPorServico: async () => ({ qtd: {}, valor: {} }) };
});

function restore() {
  Object.assign(db, { withTransaction: orig.withTransaction });
  Object.assign(repos, { contracts: orig.contracts, contractServicos: orig.contractServicos, medicaoItens: orig.medicaoItens });
}

// ---------------- GET (list) ----------------

test('GET — contrato inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleListContractServicos('CX', res);
  assert.equal(res.status, 404);
  restore();
});

test('GET — devolve a planilha enriquecida com saldo (saldoQtd/avancoPct)', async () => {
  const res = fakeRes();
  await h.handleListContractServicos('C1', res);
  assert.equal(res.status, 200);
  assert.equal(res.body.servicos.length, 1);
  assert.equal(res.body.servicos[0].saldoQtd, 100); // nada medido ainda
  restore();
});

// ---------------- POST ----------------

test('POST — contrato inexistente devolve 404 sem criar', async () => {
  const res = fakeRes();
  await h.handlePostContractServico('CX', { descricao: 'X', qtdContratada: 10 }, res);
  assert.equal(res.status, 404);
  assert.equal(created, null);
  restore();
});

test('POST — descrição ausente devolve 400 (ValidationError)', async () => {
  const res = fakeRes();
  await h.handlePostContractServico('C1', { qtdContratada: 10 }, res);
  assert.equal(res.status, 400);
  assert.equal(created, null);
  restore();
});

test('POST — qtdContratada não positiva devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostContractServico('C1', { descricao: 'X', qtdContratada: 0 }, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST — sem ordem informada usa count()+1', async () => {
  const res = fakeRes();
  await h.handlePostContractServico('C1', { descricao: 'Elétrica', qtdContratada: 20, precoUnit: 5 }, res);
  assert.equal(res.status, 200);
  assert.equal(created.ordem, 2); // count() = 1 (o srv1 do beforeEach) + 1
  assert.equal(created.ativo, true);
  restore();
});

test('POST — respeita ordem explícita quando informada', async () => {
  const res = fakeRes();
  await h.handlePostContractServico('C1', { descricao: 'Elétrica', qtdContratada: 20, ordem: 9 }, res);
  assert.equal(created.ordem, 9);
  restore();
});

// ---------------- PUT ----------------

test('PUT — serviço de outro contrato devolve 404 (não vaza entre obras)', async () => {
  const res = fakeRes();
  await h.handlePutContractServico('C2', 'srv1', { qtdContratada: 50 }, res);
  assert.equal(res.status, 404);
  assert.equal(updates.length, 0);
  restore();
});

test('PUT — toma o advisory lock do contrato antes de ler/escrever', async () => {
  const res = fakeRes();
  await h.handlePutContractServico('C1', 'srv1', { precoUnit: 60 }, res);
  assert.equal(res.status, 200);
  assert.match(clientQueries[0].sql, /pg_advisory_xact_lock/);
  restore();
});

test('PUT — BR-MED-005: reduzir qtdContratada abaixo do já medido devolve 400 sem gravar', async () => {
  repos.medicaoItens.somarPorServico = async () => ({ qtd: { srv1: 80 }, valor: { srv1: 4000 } });
  const res = fakeRes();
  await h.handlePutContractServico('C1', 'srv1', { qtdContratada: 50 }, res);
  assert.equal(res.status, 400);
  assert.equal(updates.length, 0);
  restore();
});

test('PUT — qtdContratada igual ou acima do medido é aceita', async () => {
  repos.medicaoItens.somarPorServico = async () => ({ qtd: { srv1: 80 }, valor: { srv1: 4000 } });
  const res = fakeRes();
  await h.handlePutContractServico('C1', 'srv1', { qtdContratada: 90 }, res);
  assert.equal(res.status, 200);
  assert.equal(updates[0].patch.qtdContratada, 90);
  restore();
});

// ---------------- DELETE ----------------

test('DELETE — serviço de outro contrato devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteContractServico('C2', 'srv1', res);
  assert.equal(res.status, 404);
  assert.equal(removed.length, 0);
  restore();
});

test('DELETE — serviço com medição acumulada não pode ser excluído', async () => {
  repos.medicaoItens.somarPorServico = async () => ({ qtd: { srv1: 10 }, valor: { srv1: 500 } });
  const res = fakeRes();
  await h.handleDeleteContractServico('C1', 'srv1', res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /não pode ser excluído/);
  assert.equal(removed.length, 0);
  restore();
});

test('DELETE — serviço sem medição é excluído normalmente', async () => {
  const res = fakeRes();
  await h.handleDeleteContractServico('C1', 'srv1', res);
  assert.equal(res.status, 200);
  assert.deepEqual(removed, ['srv1']);
  restore();
});
