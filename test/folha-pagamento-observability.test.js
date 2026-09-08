'use strict';
/**
 * handlers/folha-pagamento.js — quando a sincronização da conta a pagar
 * vinculada ao Saldo/Vale falha (registro divergente entre Folha e Contas a
 * Pagar), o handler só engolia em `console.error`, sem alertar ninguém.
 * Cobre a ligação com lib/observability.js nos dois pontos mais sensíveis
 * (recalcularSaldoFolha e o estorno de pagamento), com `db`/`repos`
 * dublados — nada toca o Postgres.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const observability = require('../lib/observability');
const h = require('../handlers/folha-pagamento');

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
  folhaPagamento: repos.folhaPagamento,
  folhaPagamentoItens: repos.folhaPagamentoItens,
  contasPagar: repos.contasPagar,
};

let folhaRow, itens, captured;

beforeEach(() => {
  itens = [];
  captured = [];
  folhaRow = {
    id: 'fp1', salarioBase: 3000, valorVale: 300, saldoPago: false,
    saldoContaPagarId: 'cp1', valeContaPagarId: 'cp2',
  };
  db.withTransaction = async (fn) => fn({ query: async () => ({ rows: [] }) });
  repos.folhaPagamento = {
    findById: async (id) => (id === 'fp1' ? folhaRow : null),
    updateById: async (id, patch) => { Object.assign(folhaRow, patch); return folhaRow; },
  };
  repos.folhaPagamentoItens = {
    create: async (item) => { itens.push(item); return item; },
    findByFolha: async () => itens,
  };
  repos.contasPagar = {
    updateById: async () => { throw new Error('falha simulada de sincronização'); },
  };
  repos.caixa = { create: async (entry) => entry, removeById: async () => true };
  observability.captureError = (err, ctx) => { captured.push({ err, ctx }); };
});

function restore() {
  Object.assign(db, { withTransaction: orig.withTransaction });
  Object.assign(repos, {
    folhaPagamento: orig.folhaPagamento,
    folhaPagamentoItens: orig.folhaPagamentoItens,
    contasPagar: orig.contasPagar,
  });
}

test('pagar parcela: falha ao sincronizar conta a pagar como "pago" é reportada pra observability (hoje é 100% silenciosa)', async () => {
  folhaRow.valorSaldo = 2700;
  const res = fakeRes();
  await h.handlePagarFolhaParcela('fp1', { parcela: 'saldo' }, res);
  assert.equal(res.status, 200, 'a requisição ainda tem sucesso pro usuário — só o alerta é novo');
  assert.equal(captured.length, 1);
  assert.match(captured[0].err.message, /sincroniz/i);
  assert.equal(captured[0].ctx.contaPagarId, 'cp1');
  restore();
});

test('estornar parcela: falha ao sincronizar conta a pagar de volta pra pendente é reportada pra observability', async () => {
  folhaRow.saldoPago = true;
  const res = fakeRes();
  await h.handleEstornarFolhaParcela('fp1', { parcela: 'saldo' }, res);
  assert.equal(res.status, 200);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].ctx.contaPagarId, 'cp1');
  restore();
});

test('lançar item na folha: falha ao sincronizar conta do Saldo é reportada pra observability, sem quebrar a resposta', async () => {
  const res = fakeRes();
  await h.handleAddFolhaItem('fp1', { tipo: 'desconto', descricao: 'Vale-transporte', valor: 100 }, res);
  assert.equal(res.status, 200, 'a requisição ainda tem sucesso pro usuário — só o alerta é novo');
  assert.equal(captured.length, 1);
  assert.match(captured[0].err.message, /sincroniz/i);
  assert.equal(captured[0].ctx.contaPagarId, 'cp1');
  restore();
});
