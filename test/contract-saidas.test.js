'use strict';
/**
 * Handler de Saídas / BM de contrato (handlers/contract-saidas.js), com
 * `db`/`repos` dublados — nada toca o Postgres.
 *  - criarSaidaAgregandoNf: agrega na NF não-emitida do MESMO dia (cria BM-NNN
 *    novo se não houver); bloqueia se o total ultrapassar o valor do contrato;
 *    bloqueia se a NF do dia acabou de ser emitida (corrida detectada na
 *    releitura, ver comentário do arquivo);
 *  - PUT: bloqueia edição de valor/data com BM já emitido; ajusta a NF por
 *    delta quando o valor muda; realoca entre NFs quando a data muda
 *    (remove NF antiga se ficou vazia, soma na existente do novo dia ou cria
 *    uma); BR-MED-004 bloqueia edição de valor em saída com itens de medição;
 *  - DELETE: bloqueia com BM emitido; remove a NF se ficou vazia, senão
 *    decrementa o valor.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const h = require('../handlers/contract-saidas');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    headersSent: false,
    writeHead(s) { res.status = s; res.headersSent = true; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = {
  withTransaction: db.withTransaction,
  contracts: repos.contracts, saidas: repos.saidas, notasFiscais: repos.notasFiscais, medicaoItens: repos.medicaoItens,
};

let contract, saidas, nfs, clientQueries;

beforeEach(() => {
  clientQueries = [];
  contract = { id: 'C1', value: 10000, retencaoPercent: 5 };
  saidas = [];
  nfs = [];
  db.withTransaction = async (fn) => {
    const client = { query: async (sql, params) => { clientQueries.push({ sql, params }); return { rows: [] }; } };
    return fn(client);
  };
  repos.contracts = { findById: async (id) => (id === contract.id ? contract : null), getEnvelope: async () => ({ contracts: [] }) };
  repos.saidas = {
    findById: async (id) => saidas.find((s) => s.id === id) || null,
    findAll: async (f = {}) => saidas.filter((s) => (f.contractId ? s.contractId === f.contractId : true) && (f.nfId ? s.nfId === f.nfId : true)),
    create: async (data) => { saidas.push(data); return data; },
    updateById: async (id, patch) => {
      const s = saidas.find((x) => x.id === id);
      Object.assign(s, patch);
      return s;
    },
    removeById: async (id) => { saidas = saidas.filter((s) => s.id !== id); return true; },
  };
  repos.notasFiscais = {
    findById: async (id) => nfs.find((n) => n.id === id) || null,
    findAll: async () => nfs,
    create: async (data) => { nfs.push(data); return data; },
    updateById: async (id, patch) => {
      const n = nfs.find((x) => x.id === id);
      Object.assign(n, patch);
      return n;
    },
    removeById: async (id) => { nfs = nfs.filter((n) => n.id !== id); return true; },
  };
  repos.medicaoItens = { findAll: async () => [] };
});

function restore() {
  Object.assign(db, { withTransaction: orig.withTransaction });
  Object.assign(repos, { contracts: orig.contracts, saidas: orig.saidas, notasFiscais: orig.notasFiscais, medicaoItens: orig.medicaoItens });
}

// ---------------- POST (criarSaidaAgregandoNf via handlePostSaida) ----------------

test('POST — contrato inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePostSaida('CX', { value: 100, date: '2026-04-01' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('POST — value ausente/inválido devolve 400 (ValidationError)', async () => {
  const res = fakeRes();
  await h.handlePostSaida('C1', { date: '2026-04-01' }, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST — cria BM-001 novo quando não há NF do dia', async () => {
  const res = fakeRes();
  await h.handlePostSaida('C1', { value: 500, date: '2026-04-01', description: 'Cimento' }, res);
  assert.equal(res.status, 200);
  assert.equal(nfs.length, 1);
  assert.equal(nfs[0].numero, 'BM-001');
  assert.equal(nfs[0].valor, 500);
  assert.equal(nfs[0].retencaoPct, 5); // snapshot BR-MED-003
  assert.equal(saidas.length, 1);
  assert.equal(saidas[0].nfId, nfs[0].id);
  restore();
});

test('POST — agrega na NF não-emitida do mesmo dia em vez de criar outra', async () => {
  await h.handlePostSaida('C1', { value: 500, date: '2026-04-01' }, fakeRes());
  const res2 = fakeRes();
  await h.handlePostSaida('C1', { value: 300, date: '2026-04-01' }, res2);
  assert.equal(nfs.length, 1);
  assert.equal(nfs[0].valor, 800);
  assert.equal(saidas.length, 2);
  restore();
});

test('POST — dia diferente cria um BM-NNN separado', async () => {
  await h.handlePostSaida('C1', { value: 500, date: '2026-04-01' }, fakeRes());
  await h.handlePostSaida('C1', { value: 300, date: '2026-04-02' }, fakeRes());
  assert.equal(nfs.length, 2);
  assert.equal(nfs[1].numero, 'BM-002');
  restore();
});

test('POST — bloqueia quando o total ultrapassa o valor do contrato', async () => {
  const res = fakeRes();
  await h.handlePostSaida('C1', { value: 10001, date: '2026-04-01' }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /ultrapassa o valor do contrato/);
  assert.equal(saidas.length, 0);
  restore();
});

test('POST — NF do dia emitida entre a leitura e a agregação: 409 (corrida detectada)', async () => {
  nfs.push({ id: 'nf1', numero: 'BM-001', contractId: 'C1', dataLimite: '2026-04-01', valor: 100, emitida: false, prazoRecebimento: 30 });
  const origFindById = repos.notasFiscais.findById;
  repos.notasFiscais.findById = async (id) => {
    const nf = await origFindById(id);
    return nf ? { ...nf, emitida: true } : nf; // simula emissão concorrente na releitura
  };
  const res = fakeRes();
  await h.handlePostSaida('C1', { value: 200, date: '2026-04-01' }, res);
  assert.equal(res.status, 409);
  restore();
});

// ---------------- PUT ----------------

test('PUT — saída inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutSaida('sX', { value: 100 }, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT — bloqueia alteração de valor com BM já emitido', async () => {
  nfs.push({ id: 'nf1', numero: 'BM-001', contractId: 'C1', dataLimite: '2026-04-01', valor: 500, emitida: true, prazoRecebimento: 30 });
  saidas.push({ id: 's1', contractId: 'C1', value: 500, date: '2026-04-01', nfId: 'nf1' });
  const res = fakeRes();
  await h.handlePutSaida('s1', { value: 600 }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /BM já emitido/);
  restore();
});

test('PUT — BR-MED-004: bloqueia alteração de valor em saída com itens de medição', async () => {
  nfs.push({ id: 'nf1', numero: 'BM-001', contractId: 'C1', dataLimite: '2026-04-01', valor: 500, emitida: false, prazoRecebimento: 30 });
  saidas.push({ id: 's1', contractId: 'C1', value: 500, date: '2026-04-01', nfId: 'nf1' });
  repos.medicaoItens.findAll = async () => [{ id: 'mi1', saidaId: 's1' }];
  const res = fakeRes();
  await h.handlePutSaida('s1', { value: 700 }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /calculado pelos itens medidos/);
  restore();
});

test('PUT — ajusta a NF pelo delta quando o valor muda', async () => {
  nfs.push({ id: 'nf1', numero: 'BM-001', contractId: 'C1', dataLimite: '2026-04-01', valor: 500, emitida: false, prazoRecebimento: 30 });
  saidas.push({ id: 's1', contractId: 'C1', value: 500, date: '2026-04-01', nfId: 'nf1' });
  const res = fakeRes();
  await h.handlePutSaida('s1', { value: 800 }, res);
  assert.equal(res.status, 200);
  assert.equal(nfs[0].valor, 800); // 500 + delta de 300
  restore();
});

test('PUT — realoca para NF existente quando a data muda pra outro dia já com BM aberto', async () => {
  nfs.push(
    { id: 'nf1', numero: 'BM-001', contractId: 'C1', dataLimite: '2026-04-01', valor: 500, emitida: false, prazoRecebimento: 30 },
    { id: 'nf2', numero: 'BM-002', contractId: 'C1', dataLimite: '2026-04-02', valor: 200, emitida: false, prazoRecebimento: 30 },
  );
  saidas.push({ id: 's1', contractId: 'C1', value: 500, date: '2026-04-01', nfId: 'nf1' });
  const res = fakeRes();
  await h.handlePutSaida('s1', { date: '2026-04-02' }, res);
  assert.equal(res.status, 200);
  assert.equal(nfs.find((n) => n.id === 'nf1'), undefined, 'nf1 ficou vazia e deve ser removida');
  assert.equal(nfs.find((n) => n.id === 'nf2').valor, 700); // 200 + 500 realocado
  assert.equal(saidas[0].nfId, 'nf2');
  restore();
});

// ---------------- DELETE ----------------

test('DELETE — saída inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteSaida('sX', res);
  assert.equal(res.status, 404);
  restore();
});

test('DELETE — bloqueia exclusão com BM já emitido', async () => {
  nfs.push({ id: 'nf1', numero: 'BM-001', contractId: 'C1', dataLimite: '2026-04-01', valor: 500, emitida: true });
  saidas.push({ id: 's1', contractId: 'C1', value: 500, date: '2026-04-01', nfId: 'nf1' });
  const res = fakeRes();
  await h.handleDeleteSaida('s1', res);
  assert.equal(res.status, 400);
  assert.equal(saidas.length, 1, 'não deve remover');
  restore();
});

test('DELETE — remove a NF quando fica sem nenhuma saída', async () => {
  nfs.push({ id: 'nf1', numero: 'BM-001', contractId: 'C1', dataLimite: '2026-04-01', valor: 500, emitida: false });
  saidas.push({ id: 's1', contractId: 'C1', value: 500, date: '2026-04-01', nfId: 'nf1' });
  const res = fakeRes();
  await h.handleDeleteSaida('s1', res);
  assert.equal(res.status, 200);
  assert.equal(nfs.length, 0);
  assert.equal(saidas.length, 0);
  restore();
});

test('DELETE — decrementa o valor da NF quando ainda restam outras saídas', async () => {
  nfs.push({ id: 'nf1', numero: 'BM-001', contractId: 'C1', dataLimite: '2026-04-01', valor: 800, emitida: false });
  saidas.push(
    { id: 's1', contractId: 'C1', value: 500, date: '2026-04-01', nfId: 'nf1' },
    { id: 's2', contractId: 'C1', value: 300, date: '2026-04-01', nfId: 'nf1' },
  );
  const res = fakeRes();
  await h.handleDeleteSaida('s1', res);
  assert.equal(res.status, 200);
  assert.equal(nfs[0].valor, 300);
  assert.equal(saidas.length, 1);
  restore();
});
