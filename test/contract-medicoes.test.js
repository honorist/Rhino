'use strict';
/**
 * Handler de medição estruturada / BM por itens (handlers/contract-medicoes.js),
 * com `db`/`repos` dublados — nada toca o Postgres. Usa de verdade
 * `criarSaidaAgregandoNf` (handlers/contract-saidas.js, já coberto em
 * test/contract-saidas.test.js) por cima dos MESMOS repos dublados — cobre a
 * integração real entre os dois módulos, não uma versão mockada dela.
 *  - GET junta planilha+saldo, itens por saída/BM e retenção (lib/medicao);
 *  - POST valida itens contra a planilha (lib/medicao.computeMedicao,
 *    BR-MED-001/002), cria a saída+NF via criarSaidaAgregandoNf, e grava os
 *    itens num INSERT multi-linha via `db.query` (fora do client da
 *    transação — só o advisory lock usa o client, ver comentário do arquivo);
 *    se o INSERT falhar, desfaz a saída/NF criadas (compensação);
 *  - aprovação de BM exige "aprovada"/"rejeitada" e obs obrigatória na
 *    rejeição (bmAprovacao), e checa que o BM pertence ao contrato.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const h = require('../handlers/contract-medicoes');

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
  withTransaction: db.withTransaction, query: db.query,
  contracts: repos.contracts, contractServicos: repos.contractServicos,
  medicaoItens: repos.medicaoItens, saidas: repos.saidas, notasFiscais: repos.notasFiscais,
};

let contract, servicos, medicaoItensRows, saidas, nfs, dbQueries;

beforeEach(() => {
  dbQueries = [];
  contract = { id: 'C1', value: 100000, retencaoPercent: 5 };
  servicos = [{ id: 'srv1', contractId: 'C1', codigo: 'S01', descricao: 'Fundação', unidade: 'm3', qtdContratada: 100, precoUnit: 50, ativo: true }];
  medicaoItensRows = [];
  saidas = [];
  nfs = [];

  db.withTransaction = async (fn) => {
    const client = { query: async (sql, params) => { dbQueries.push({ sql, params }); return { rows: [] }; } };
    return fn(client);
  };
  db.query = async (sql, params) => {
    dbQueries.push({ sql, params });
    if (/INSERT INTO medicao_itens/.test(sql)) {
      // simula o INSERT multi-linha: cols = [id, saida_id, servico_id, contract_id, qtd, preco_unit, valor]
      for (let i = 0; i < params.length; i += 7) {
        medicaoItensRows.push({ id: params[i], saidaId: params[i + 1], servicoId: params[i + 2], contractId: params[i + 3], qtd: params[i + 4], precoUnit: params[i + 5], valor: params[i + 6] });
      }
    }
    return { rows: [] };
  };

  repos.contracts = { findById: async (id) => (id === 'C1' ? contract : null), getEnvelope: async () => ({ contracts: [] }) };
  repos.contractServicos = { findAll: async ({ contractId }) => servicos.filter((s) => s.contractId === contractId) };
  repos.medicaoItens = {
    findAll: async (f = {}) => medicaoItensRows.filter((i) => (f.contractId ? i.contractId === f.contractId : true)),
    somarPorServico: async () => {
      const qtd = {}, valor = {};
      for (const i of medicaoItensRows) { qtd[i.servicoId] = (qtd[i.servicoId] || 0) + i.qtd; valor[i.servicoId] = (valor[i.servicoId] || 0) + i.valor; }
      return { qtd, valor };
    },
  };
  repos.saidas = {
    findAll: async (f = {}) => saidas.filter((s) => (f.contractId ? s.contractId === f.contractId : true)),
    create: async (data) => { saidas.push(data); return data; },
    removeById: async (id) => { saidas = saidas.filter((s) => s.id !== id); return true; },
  };
  repos.notasFiscais = {
    findAll: async () => nfs,
    findById: async (id) => nfs.find((n) => n.id === id) || null,
    findByContract: async (contractId) => nfs.filter((n) => n.contractId === contractId),
    create: async (data) => { nfs.push(data); return data; },
    updateById: async (id, patch) => { const n = nfs.find((x) => x.id === id); Object.assign(n, patch); return n; },
    removeById: async (id) => { nfs = nfs.filter((n) => n.id !== id); return true; },
  };
});

function restore() {
  Object.assign(db, { withTransaction: orig.withTransaction, query: orig.query });
  Object.assign(repos, { contracts: orig.contracts, contractServicos: orig.contractServicos, medicaoItens: orig.medicaoItens, saidas: orig.saidas, notasFiscais: orig.notasFiscais });
}

// ---------------- GET ----------------

test('GET — contrato inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleGetContractMedicoes('CX', res);
  assert.equal(res.status, 404);
  restore();
});

test('GET — junta planilha com saldo e BMs vazios quando não há medição', async () => {
  const res = fakeRes();
  await h.handleGetContractMedicoes('C1', res);
  assert.equal(res.status, 200);
  assert.equal(res.body.servicos[0].saldoQtd, 100);
  assert.deepEqual(res.body.bms, []);
  restore();
});

// ---------------- POST ----------------

test('POST — contrato inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePostContractMedicao('CX', { itens: [{ servicoId: 'srv1', qtd: 10 }] }, res);
  assert.equal(res.status, 404);
  restore();
});

test('POST — itens vazio devolve 400 (ValidationError)', async () => {
  const res = fakeRes();
  await h.handlePostContractMedicao('C1', { itens: [] }, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST — contrato sem planilha de serviços devolve 400', async () => {
  servicos = [];
  const res = fakeRes();
  await h.handlePostContractMedicao('C1', { date: '2026-04-01', itens: [{ servicoId: 'srv1', qtd: 10 }] }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /sem planilha de serviços/);
  restore();
});

test('POST — item ultrapassando o saldo contratado devolve 400 (BR-MED-001)', async () => {
  const res = fakeRes();
  await h.handlePostContractMedicao('C1', { date: '2026-04-01', itens: [{ servicoId: 'srv1', qtd: 150 }] }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /ultrapassa o saldo contratado/);
  assert.equal(saidas.length, 0);
  restore();
});

test('POST — sucesso: cria saída+NF via criarSaidaAgregandoNf e grava itens com preço snapshot', async () => {
  const res = fakeRes();
  await h.handlePostContractMedicao('C1', { date: '2026-04-01', itens: [{ servicoId: 'srv1', qtd: 20 }] }, res);
  assert.equal(res.status, 200);
  assert.equal(nfs.length, 1);
  assert.equal(nfs[0].valor, 1000); // 20 * 50 (BR-MED-002 snapshot do preço)
  assert.equal(saidas.length, 1);
  assert.equal(medicaoItensRows.length, 1);
  assert.equal(medicaoItensRows[0].qtd, 20);
  assert.equal(medicaoItensRows[0].precoUnit, 50);
  assert.equal(res.body.medicao.numeroBm, 'BM-001');
  assert.equal(res.body.medicao.total, 1000);
  restore();
});

test('POST — falha no INSERT dos itens desfaz a saída e a NF recém-criada (compensação)', async () => {
  const origDbQuery = db.query;
  db.query = async (sql, params) => {
    if (/INSERT INTO medicao_itens/.test(sql)) throw new Error('falha simulada de INSERT');
    return origDbQuery(sql, params);
  };
  const res = fakeRes();
  await h.handlePostContractMedicao('C1', { date: '2026-04-01', itens: [{ servicoId: 'srv1', qtd: 20 }] }, res);
  assert.equal(res.status, 400);
  assert.equal(saidas.length, 0, 'saída deve ter sido desfeita');
  assert.equal(nfs.length, 0, 'NF recém-criada deve ter sido removida');
  restore();
});

test('POST — falha no INSERT com NF PREEXISTENTE (agregação) restaura o valor anterior em vez de remover a NF', async () => {
  nfs.push({ id: 'nf1', numero: 'BM-001', contractId: 'C1', dataLimite: '2026-04-01', valor: 300, emitida: false, prazoRecebimento: 30 });
  const origDbQuery = db.query;
  db.query = async (sql, params) => {
    if (/INSERT INTO medicao_itens/.test(sql)) throw new Error('falha simulada de INSERT');
    return origDbQuery(sql, params);
  };
  const res = fakeRes();
  await h.handlePostContractMedicao('C1', { date: '2026-04-01', itens: [{ servicoId: 'srv1', qtd: 20 }] }, res);
  assert.equal(res.status, 400);
  assert.equal(nfs.length, 1, 'NF preexistente não deve ser removida');
  assert.equal(nfs[0].valor, 300, 'valor restaurado ao que era antes da agregação');
  restore();
});

// ---------------- Aprovação de BM ----------------

test('aprovação — BM inexistente ou de outro contrato devolve 404', async () => {
  nfs.push({ id: 'nf1', contractId: 'C2' });
  const res = fakeRes();
  await h.handlePostBmAprovacao('C1', 'nf1', { status: 'aprovada' }, { email: 'x@x.com' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('aprovação — rejeição sem observação devolve 400 (motivo obrigatório)', async () => {
  nfs.push({ id: 'nf1', contractId: 'C1' });
  const res = fakeRes();
  await h.handlePostBmAprovacao('C1', 'nf1', { status: 'rejeitada' }, { email: 'x@x.com' }, res);
  assert.equal(res.status, 400);
  restore();
});

test('aprovação — sucesso grava status/autor/timestamp', async () => {
  nfs.push({ id: 'nf1', contractId: 'C1' });
  const res = fakeRes();
  await h.handlePostBmAprovacao('C1', 'nf1', { status: 'aprovada', obs: 'ok' }, { email: 'gestor@rhino.local' }, res);
  assert.equal(res.status, 200);
  assert.equal(nfs[0].aprovacaoStatus, 'aprovada');
  assert.equal(nfs[0].aprovacaoPor, 'gestor@rhino.local');
  assert.ok(nfs[0].aprovacaoEm);
  restore();
});
