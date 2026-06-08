'use strict';
/**
 * @file Handlers de Contas a Pagar — CRUD + pagar/estornar. Extraído do server.js.
 * `pagar` cria lançamento de caixa sob advisory lock (FIX P1-3); `estornar`
 * remove. Sincroniza a parcela na Folha de Pagamento quando a conta vem de lá.
 * (handleProcessarRecorrencias permanece no server.js — concern separado.)
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money');
const { validateBody, schemas } = require('../lib/validate');

async function envelope() { return { contas: await repos.contasPagar.findAll() }; }

async function handleGetContasPagar(res) {
  try { sendJson(res, await envelope()); } catch (e) { sendError(res, 500, e.message); }
}

async function handlePostContaPagar(body, res) {
  try {
    const p = validateBody(schemas.contaPagarPost, body);
    const conta = {
      id: generateId('cp'),
      descricao: p.descricao, fornecedorId: p.fornecedorId, numeroNF: p.numeroNF,
      valor: p.valor, dataEmissao: p.dataEmissao, dataVencimento: p.dataVencimento,
      status: 'pendente', dataPagamento: null, caixaEntryId: null,
      contractId: p.contractId, category: p.category, observacoes: p.observacoes,
      recorrente: p.recorrente, periodicidade: p.periodicidade, recorrenciaOrigemId: p.recorrenciaOrigemId,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await repos.contasPagar.create(conta);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutContaPagar(id, body, res) {
  try {
    const allowed = {};
    const fields = ['descricao', 'fornecedorId', 'numeroNF', 'contractId', 'category', 'observacoes', 'periodicidade'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.valor !== undefined) allowed.valor = money.parse(body.valor);
    if (body.dataEmissao !== undefined) allowed.dataEmissao = body.dataEmissao || null;
    if (body.dataVencimento !== undefined) allowed.dataVencimento = body.dataVencimento || null;
    if (body.recorrente !== undefined) allowed.recorrente = !!body.recorrente;
    allowed.updatedAt = new Date().toISOString();
    const result = await repos.contasPagar.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Conta não encontrada');
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteContaPagar(id, res) {
  try {
    // FIX: caixa + conta removidos sob transação + advisory lock (antes eram 2 writes soltos).
    const env = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('conta:' || $1)::int)", [id]);
      const conta = await repos.contasPagar.findById(id);
      if (!conta) { const err = new Error('Conta não encontrada'); err.statusCode = 404; throw err; }
      if (conta.caixaEntryId) await repos.caixa.removeById(conta.caixaEntryId);
      await repos.contasPagar.removeById(id);
      return await envelope();
    });
    sendJson(res, env);
  } catch (e) { sendError(res, e.statusCode || 400, e.message); }
}

async function handlePagarConta(id, body, res) {
  try {
    const env = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('conta:' || $1)::int)", [id]);
      const conta = await repos.contasPagar.findById(id);
      if (!conta) { const err = new Error('Conta não encontrada'); err.statusCode = 404; throw err; }
      if (conta.status === 'pago') { const err = new Error('Conta já foi paga'); err.statusCode = 400; throw err; }
      const dataPagamento = body.dataPagamento || new Date().toISOString().split('T')[0];
      const valorPago = parseFloat(body.valorPago) || parseFloat(conta.valor) || 0;
      const caixaEntry = {
        id: generateId('cxa'), type: 'saida',
        description: conta.descricao + (conta.numeroNF ? ` — NF ${conta.numeroNF}` : '') + (body.formaPagamento ? ` [${body.formaPagamento}]` : ''),
        value: valorPago, date: dataPagamento, contractId: conta.contractId || null, baseItemId: null,
        category: conta.category || 'fornecedor', notes: `Pagamento de conta: ${conta.descricao}`,
        formaPagamento: body.formaPagamento || null, contaPagarId: conta.id,
        createdAt: new Date().toISOString(),
      };
      await repos.caixa.create(caixaEntry);
      await repos.contasPagar.updateById(id, {
        status: 'pago', dataPagamento, valorPago,
        formaPagamento: body.formaPagamento || null, caixaEntryId: caixaEntry.id,
        updatedAt: new Date().toISOString(),
      });
      // Conta originada da Folha de Pagamento — marca a parcela como paga lá também.
      if (conta.folhaPagamentoId && (conta.folhaParcela === 'vale' || conta.folhaParcela === 'saldo')) {
        const fPatch = conta.folhaParcela === 'vale'
          ? { valePago: true, valeDataPagamento: dataPagamento, valeCaixaEntryId: caixaEntry.id, updatedAt: new Date().toISOString() }
          : { saldoPago: true, saldoDataPagamento: dataPagamento, saldoCaixaEntryId: caixaEntry.id, updatedAt: new Date().toISOString() };
        await repos.folhaPagamento.updateById(conta.folhaPagamentoId, fPatch)
          .catch((e) => console.error('[conta-pagar] falha ao sincronizar folha', conta.folhaPagamentoId, e && e.message));
      }
      return await envelope();
    });
    sendJson(res, env);
  } catch (e) { sendError(res, e.statusCode || 400, e.message); }
}

async function handleEstornarConta(id, res) {
  try {
    // FIX: estorno sob transação + advisory lock + guard "está paga" (igual ao pagar) —
    // antes era sem lock/transação/guard, permitindo estorno duplo concorrente.
    const env = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('conta:' || $1)::int)", [id]);
      const conta = await repos.contasPagar.findById(id);
      if (!conta) { const err = new Error('Conta não encontrada'); err.statusCode = 404; throw err; }
      if (conta.status !== 'pago') { const err = new Error('Conta não está paga — nada a estornar'); err.statusCode = 400; throw err; }
      if (conta.caixaEntryId) await repos.caixa.removeById(conta.caixaEntryId);
      await repos.contasPagar.updateById(id, {
        status: 'pendente', dataPagamento: null, valorPago: null, caixaEntryId: null,
        updatedAt: new Date().toISOString(),
      });
      if (conta.folhaPagamentoId && (conta.folhaParcela === 'vale' || conta.folhaParcela === 'saldo')) {
        const fPatch = conta.folhaParcela === 'vale'
          ? { valePago: false, valeDataPagamento: null, valeCaixaEntryId: null, updatedAt: new Date().toISOString() }
          : { saldoPago: false, saldoDataPagamento: null, saldoCaixaEntryId: null, updatedAt: new Date().toISOString() };
        await repos.folhaPagamento.updateById(conta.folhaPagamentoId, fPatch)
          .catch((e) => console.error('[conta-estorno] falha ao sincronizar folha', conta.folhaPagamentoId, e && e.message));
      }
      return await envelope();
    });
    sendJson(res, env);
  } catch (e) { sendError(res, e.statusCode || 400, e.message); }
}

module.exports = {
  handleGetContasPagar, handlePostContaPagar, handlePutContaPagar,
  handleDeleteContaPagar, handlePagarConta, handleEstornarConta,
};
