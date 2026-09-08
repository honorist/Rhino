'use strict';
/**
 * Handler de Contas a Pagar (handlers/contas-pagar.js) — sem cobertura de
 * camada HTTP antes desta mudança (só test/contas-pagar-vencendo.test.js,
 * que cobre outro concern). `db`/`repos` dublados — nada toca o Postgres.
 *
 * Cobre também a ligação com lib/observability.js: quando "pagar"/"estornar"
 * falha ao sincronizar a parcela vinculada na Folha de Pagamento, o handler
 * só engolia em console.error — agora também reporta.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const observability = require('../lib/observability');
const h = require('../handlers/contas-pagar');

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
  contasPagar: repos.contasPagar, caixa: repos.caixa, folhaPagamento: repos.folhaPagamento,
};

let contas, caixaEntries, folhaRow, captured;

beforeEach(() => {
  contas = [{ id: 'cp1', descricao: 'Aluguel', valor: 1000, status: 'pendente', caixaEntryId: null }];
  caixaEntries = [];
  folhaRow = null;
  captured = [];

  db.withTransaction = async (fn) => fn({ query: async () => ({ rows: [] }) });
  repos.contasPagar = {
    findAll: async () => contas,
    findById: async (id) => contas.find((c) => c.id === id) || null,
    create: async (c) => { contas.push(c); return c; },
    updateById: async (id, patch) => {
      const c = contas.find((x) => x.id === id);
      if (!c) return null;
      Object.assign(c, patch);
      return c;
    },
    removeById: async (id) => { contas = contas.filter((c) => c.id !== id); return true; },
  };
  repos.caixa = {
    create: async (e) => { caixaEntries.push(e); return e; },
    removeById: async (id) => { caixaEntries = caixaEntries.filter((e) => e.id !== id); return true; },
  };
  repos.folhaPagamento = {
    updateById: async (id, patch) => {
      if (!folhaRow || folhaRow.id !== id) throw new Error('falha simulada ao sincronizar folha');
      Object.assign(folhaRow, patch);
      return folhaRow;
    },
  };
  observability.captureError = (err, ctx) => { captured.push({ err, ctx }); };
});

function restore() {
  Object.assign(db, { withTransaction: orig.withTransaction });
  Object.assign(repos, { contasPagar: orig.contasPagar, caixa: orig.caixa, folhaPagamento: orig.folhaPagamento });
}

// ---------------- CRUD básico ----------------

test('GET — devolve o envelope com todas as contas', async () => {
  const res = fakeRes();
  await h.handleGetContasPagar(res);
  assert.equal(res.status, 200);
  assert.equal(res.body.contas.length, 1);
  restore();
});

test('POST — corpo válido cria a conta', async () => {
  const res = fakeRes();
  await h.handlePostContaPagar({ descricao: 'Água', valor: 200 }, res);
  assert.equal(res.status, 200);
  assert.equal(contas.length, 2);
  restore();
});

test('POST — sem descrição devolve 400 (ValidationError)', async () => {
  const res = fakeRes();
  await h.handlePostContaPagar({ valor: 200 }, res);
  assert.equal(res.status, 400);
  restore();
});

test('PUT — conta inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutContaPagar('naoexiste', { descricao: 'X' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('DELETE — remove a conta e o lançamento de caixa vinculado', async () => {
  contas[0].caixaEntryId = 'cxa1';
  caixaEntries.push({ id: 'cxa1' });
  const res = fakeRes();
  await h.handleDeleteContaPagar('cp1', res);
  assert.equal(res.status, 200);
  assert.equal(contas.length, 0);
  assert.equal(caixaEntries.length, 0);
  restore();
});

// ---------------- Pagar ----------------

test('pagar — conta inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePagarConta('naoexiste', {}, res);
  assert.equal(res.status, 404);
  restore();
});

test('pagar — conta já paga devolve 400', async () => {
  contas[0].status = 'pago';
  const res = fakeRes();
  await h.handlePagarConta('cp1', {}, res);
  assert.equal(res.status, 400);
  restore();
});

test('pagar — sucesso lança caixa e marca a conta como paga', async () => {
  const res = fakeRes();
  await h.handlePagarConta('cp1', { valorPago: 1000 }, res);
  assert.equal(res.status, 200);
  assert.equal(contas[0].status, 'pago');
  assert.equal(caixaEntries.length, 1);
  restore();
});

test('pagar — conta vinculada à Folha sincroniza a parcela como paga', async () => {
  contas[0].folhaPagamentoId = 'fp1';
  contas[0].folhaParcela = 'saldo';
  folhaRow = { id: 'fp1', saldoPago: false };
  const res = fakeRes();
  await h.handlePagarConta('cp1', {}, res);
  assert.equal(res.status, 200);
  assert.equal(folhaRow.saldoPago, true);
  assert.equal(captured.length, 0, 'sincronização OK não deve gerar alerta');
  restore();
});

test('pagar — falha ao sincronizar a Folha é reportada pra observability, sem quebrar a resposta', async () => {
  contas[0].folhaPagamentoId = 'fp-outra'; // não bate com nenhum folhaRow → updateById lança
  contas[0].folhaParcela = 'saldo';
  const res = fakeRes();
  await h.handlePagarConta('cp1', {}, res);
  assert.equal(res.status, 200, 'a conta ainda é paga com sucesso — só o alerta é novo');
  assert.equal(contas[0].status, 'pago');
  assert.equal(captured.length, 1);
  assert.match(captured[0].err.message, /sincronizar folha/);
  assert.equal(captured[0].ctx.contaId, 'cp1');
  assert.equal(captured[0].ctx.folhaPagamentoId, 'fp-outra');
  restore();
});

// ---------------- Estornar ----------------

test('estornar — conta não paga devolve 400', async () => {
  const res = fakeRes();
  await h.handleEstornarConta('cp1', res);
  assert.equal(res.status, 400);
  restore();
});

test('estornar — sucesso remove o caixa e volta a conta pra pendente', async () => {
  contas[0].status = 'pago';
  contas[0].caixaEntryId = 'cxa1';
  caixaEntries.push({ id: 'cxa1' });
  const res = fakeRes();
  await h.handleEstornarConta('cp1', res);
  assert.equal(res.status, 200);
  assert.equal(contas[0].status, 'pendente');
  assert.equal(caixaEntries.length, 0);
  restore();
});

test('estornar — falha ao sincronizar a Folha de volta é reportada pra observability', async () => {
  contas[0].status = 'pago';
  contas[0].folhaPagamentoId = 'fp-outra';
  contas[0].folhaParcela = 'vale';
  const res = fakeRes();
  await h.handleEstornarConta('cp1', res);
  assert.equal(res.status, 200);
  assert.equal(contas[0].status, 'pendente');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].ctx.folhaPagamentoId, 'fp-outra');
  restore();
});
