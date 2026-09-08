'use strict';
/**
 * Orquestração dos handlers de cotações (handlers/cotacoes.js), com `db` e
 * `repos` dublados — nada toca o Postgres. Cobre os dois achados da varredura
 * 2026-09-08:
 *  - handleGerarOrdem: ordem + itens + fechamento da cotação viram atômicos
 *    (uma única transação, mesmo padrão de handlers/rdo-apontamentos.js) —
 *    antes eram writes soltos via pool, uma falha no meio deixava PO órfão;
 *  - handleUpsertCotacaoPreco: upsert atômico (INSERT ... ON CONFLICT) em vez
 *    do check-then-act antigo, que deixava a matriz de preço duplicar sob
 *    concorrência (ver migration 20260908090000_cotacao_precos_unique).
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const h = require('../handlers/cotacoes');

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
  query: db.query,
  cotacoes: repos.cotacoes,
  cotacaoItens: repos.cotacaoItens,
  cotacaoPrecos: repos.cotacaoPrecos,
  ordensCompra: repos.ordensCompra,
  ordemCompraItens: repos.ordemCompraItens,
};

let clientQueries; // queries executadas dentro da transação (handleGerarOrdem)
let dbQueries; // queries via db.query direto (handleUpsertCotacaoPreco)
let cotacaoAtual;
let falharNoItem2; // simula falha no meio do loop de itens

beforeEach(() => {
  clientQueries = [];
  dbQueries = [];
  falharNoItem2 = false;
  cotacaoAtual = { id: 'cot_1', status: 'aberta', contractId: 'C1' };

  db.withTransaction = async (fn) => {
    const client = {
      query: async (sql, params) => {
        clientQueries.push({ sql, params });
        if (falharNoItem2 && /INSERT INTO ordem_compra_itens/.test(sql) && clientQueries.filter((q) => /INSERT INTO ordem_compra_itens/.test(q.sql)).length === 2) {
          throw new Error('falha simulada no segundo item');
        }
        return { rows: [{ n: 0 }] };
      },
    };
    return fn(client);
  };
  db.query = async (sql, params) => {
    dbQueries.push({ sql, params });
    return { rows: [], rowCount: 1 };
  };

  repos.cotacoes = {
    findById: async (id) => (id === cotacaoAtual.id ? cotacaoAtual : null),
    updateById: async (id, patch) => Object.assign(cotacaoAtual, patch),
  };
  repos.cotacaoItens = {
    findById: async (id) => (id === 'it_1' ? { id: 'it_1', cotacaoId: 'cot_1' } : null),
    findAll: async () => [
      { id: 'it_1', descricao: 'Cimento', unidade: 'sc', quantidade: 100 },
      { id: 'it_2', descricao: 'Areia', unidade: 'm3', quantidade: 10 },
    ],
  };
  repos.cotacaoPrecos = {
    findAll: async () => [
      { itemId: 'it_1', fornecedorId: 'forn_1', precoUnit: 30 },
      { itemId: 'it_2', fornecedorId: 'forn_1', precoUnit: 200 },
    ],
  };
  repos.ordensCompra = { findById: async (id) => ({ id, numero: 'PC-0001' }) };
  repos.ordemCompraItens = {};
});

function restore() {
  Object.assign(db, { withTransaction: orig.withTransaction, query: orig.query });
  Object.assign(repos, {
    cotacoes: orig.cotacoes,
    cotacaoItens: orig.cotacaoItens,
    cotacaoPrecos: orig.cotacaoPrecos,
    ordensCompra: orig.ordensCompra,
    ordemCompraItens: orig.ordemCompraItens,
  });
}

// ─── handleGerarOrdem — atomicidade ──────────────────────────────────────────

test('gerar ordem: ordem + itens + fechamento da cotação numa única transação', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleGerarOrdem('cot_1', { fornecedorId: 'forn_1' }, res);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  const inserts = clientQueries.filter((q) => /^INSERT INTO ordens_compra/.test(q.sql));
  const itensInserts = clientQueries.filter((q) => /^INSERT INTO ordem_compra_itens/.test(q.sql));
  const updates = clientQueries.filter((q) => /^UPDATE cotacoes/.test(q.sql));
  assert.equal(inserts.length, 1, 'deveria inserir 1 cabeçalho de ordem');
  assert.equal(itensInserts.length, 2, 'deveria inserir os 2 itens cotados');
  assert.equal(updates.length, 1, 'deveria fechar a cotação (estava "aberta")');
  assert.equal(cotacaoAtual.status, 'fechada');
});

test('gerar ordem: falha no meio do loop de itens não deixa PO parcial (propaga erro, sem sendJson de sucesso)', async (t) => {
  t.after(restore);
  falharNoItem2 = true;
  const res = fakeRes();
  await h.handleGerarOrdem('cot_1', { fornecedorId: 'forn_1' }, res);

  // A falha aconteceu DENTRO de db.withTransaction — o handler não deve
  // responder 200. (O rollback real fica a cargo do db.withTransaction de
  // produção, testado por sua própria suíte; aqui garantimos que o handler
  // não tenta commitar sucesso quando a transação lança.)
  assert.notEqual(res.status, 200);
});

test('gerar ordem: cotação já fechada não é reaberta nem re-fechada', async (t) => {
  t.after(restore);
  cotacaoAtual.status = 'cancelada';
  const res = fakeRes();
  await h.handleGerarOrdem('cot_1', { fornecedorId: 'forn_1' }, res);
  assert.equal(res.status, 200);
  const updates = clientQueries.filter((q) => /^UPDATE cotacoes/.test(q.sql));
  assert.equal(updates.length, 0);
  assert.equal(cotacaoAtual.status, 'cancelada');
});

test('gerar ordem: sem fornecedor com preço, 400 e nenhuma transação aberta', async (t) => {
  t.after(restore);
  repos.cotacaoPrecos.findAll = async () => [];
  const res = fakeRes();
  await h.handleGerarOrdem('cot_1', {}, res);
  assert.equal(res.status, 400);
  assert.equal(clientQueries.length, 0);
});

// ─── handleUpsertCotacaoPreco — upsert atômico ───────────────────────────────

test('upsert preço: precoUnit > 0 emite INSERT ... ON CONFLICT DO UPDATE (célula única)', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleUpsertCotacaoPreco('cot_1', { itemId: 'it_1', fornecedorId: 'forn_1', precoUnit: 42 }, res);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(dbQueries.length, 1);
  assert.match(dbQueries[0].sql, /INSERT INTO cotacao_precos/);
  assert.match(dbQueries[0].sql, /ON CONFLICT \(cotacao_id, item_id, fornecedor_id\)/);
  assert.match(dbQueries[0].sql, /DO UPDATE/);
  assert.deepEqual(dbQueries[0].params.slice(1, 5), ['cot_1', 'it_1', 'forn_1', 42]);
});

test('upsert preço: precoUnit <= 0 limpa a célula (DELETE, sem leitura prévia)', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleUpsertCotacaoPreco('cot_1', { itemId: 'it_1', fornecedorId: 'forn_1', precoUnit: 0 }, res);

  assert.equal(res.status, 200);
  assert.equal(dbQueries.length, 1);
  assert.match(dbQueries[0].sql, /DELETE FROM cotacao_precos/);
  assert.deepEqual(dbQueries[0].params, ['cot_1', 'it_1', 'forn_1']);
});

test('upsert preço: item de outra cotação → 404, nenhuma query de escrita', async (t) => {
  t.after(restore);
  const res = fakeRes();
  await h.handleUpsertCotacaoPreco('cot_1', { itemId: 'nao-existe', fornecedorId: 'forn_1', precoUnit: 10 }, res);
  assert.equal(res.status, 404);
  assert.equal(dbQueries.length, 0);
});
