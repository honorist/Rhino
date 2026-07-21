'use strict';
/**
 * Orquestração dos handlers de apontamento de HH (handlers/rdo-apontamentos.js),
 * com `db` e `repos` dublados — nada toca o Postgres. A regra pura já é coberta
 * por test/rdo-apontamento.test.js; aqui garanto o que o handler faz por cima:
 *  - o RDO precisa pertencer ao contrato (senão 404);
 *  - o PUT é replace-all: apaga os apontamentos do RDO e reinsere só os
 *    normalizados (linhas vazias somem antes do INSERT);
 *  - a produtividade cruza atividades (hh_plan) com o realizado agregado.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const h = require('../handlers/rdo-apontamentos');

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
  withTransaction: db.withTransaction,
  getMany: db.getMany,
  rdos: repos.rdos,
  rdoApontamentos: repos.rdoApontamentos,
  contracts: repos.contracts,
};

let clientQueries; // queries executadas dentro da transação
beforeEach(() => {
  clientQueries = [];
  db.withTransaction = async (fn) => {
    const client = {
      query: async (sql, params) => {
        clientQueries.push({ sql, params });
        return { rows: [] };
      },
    };
    return fn(client);
  };
  repos.rdos = { findById: async (id) => (id === 'R7' ? { id: 'R7', contractId: 'C1' } : null) };
  repos.rdoApontamentos = {
    findAll: async () => [{ id: 'apont_1', rdoId: 'R7' }],
    somarPorAtividade: async () => [
      { atividadeId: 'a1', hhReal: 70 },
      { atividadeId: null, hhReal: 12 },
    ],
  };
  repos.contracts = { findById: async (id) => (id === 'C1' ? { id: 'C1', name: 'Obra' } : null) };
});

function restore() {
  Object.assign(db, { withTransaction: orig.withTransaction, getMany: orig.getMany });
  Object.assign(repos, { rdos: orig.rdos, rdoApontamentos: orig.rdoApontamentos, contracts: orig.contracts });
}

test('PUT rejeita RDO que não é do contrato (404) e não escreve', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutRdoApontamentos('C1', 'OUTRO', { apontamentos: [] }, res);
  assert.equal(res.status, 404);
  assert.equal(clientQueries.length, 0);
});

test('PUT é replace-all: DELETE do RDO + INSERT só das linhas válidas', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutRdoApontamentos(
    'C1',
    'R7',
    {
      apontamentos: [
        { recursoId: 'r1', atividadeId: 'a1', funcao: 'Soldador', horas: 8 },
        { funcao: '', horas: 0 }, // linha vazia → descartada
        { recursoId: 'r2', horas: 4 },
      ],
    },
    res
  );
  assert.equal(res.status, 200);
  const del = clientQueries.find((q) => /DELETE FROM rdo_apontamentos/.test(q.sql));
  assert.ok(del, 'apaga os apontamentos do RDO primeiro');
  assert.deepEqual(del.params, ['R7']);
  const ins = clientQueries.find((q) => /INSERT INTO rdo_apontamentos/.test(q.sql));
  assert.ok(ins, 'reinsere os normalizados');
  // 2 linhas válidas × 8 colunas = 16 params (a linha vazia não entra).
  assert.equal(ins.params.length, 16);
});

test('PUT sem linhas válidas apaga e não faz INSERT', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handlePutRdoApontamentos('C1', 'R7', { apontamentos: [{ horas: 0 }] }, res);
  assert.equal(res.status, 200);
  assert.ok(clientQueries.some((q) => /DELETE/.test(q.sql)));
  assert.ok(!clientQueries.some((q) => /INSERT/.test(q.sql)), 'nada a inserir');
});

test('produtividade: 404 quando o contrato não existe', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleGetContractProdutividade('SUMIU', res);
  assert.equal(res.status, 404);
});

test('produtividade cruza atividades (hh_plan) com o realizado agregado', async (t) => {
  t.after(restore);
  db.getMany = async () => [
    { id: 'a1', nome: 'Montagem', hhPlan: 100 },
    { id: 'a2', nome: 'Solda', hhPlan: 50 },
  ];
  const res = fakeRes();
  await h.handleGetContractProdutividade('C1', res);
  assert.equal(res.status, 200);
  const prod = res.body.produtividade;
  const a1 = prod.porAtividade.find((a) => a.atividadeId === 'a1');
  assert.equal(a1.hhReal, 70);
  assert.equal(a1.pct, 70);
  assert.equal(prod.semAtividade, 12, 'apontamento sem atividade não some');
});