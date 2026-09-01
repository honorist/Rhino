'use strict';
/**
 * @file Handlers do Caixa (lançamentos financeiros) — CRUD.
 *
 * Extraído do server.js (continuação do desmembramento Fase A — ver
 * handlers/auth.js, handlers/recrutamento.js). Os helpers legados
 * readCollection/writeCollection ficaram no server.js; aqui usamos `repos.caixa`
 * direto + `envelope()` para devolver a coleção no mesmo formato.
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money');

/** Envelope padrão da coleção (mesmo formato consumido pelo front). */
async function envelope() {
  return { entries: await repos.caixa.findAll() };
}

async function handleGetCaixa(res, query) {
  try {
    // Sem query params: comportamento de sempre (Store.loadAll() carrega
    // caixa inteiro, capado em 5000 pelo factory — P1-3, risco de OOM já
    // coberto). Paginação de verdade é opt-in via ?page=1, pra quem quiser
    // (db/repos/caixa.js, findPageKeyset).
    if (query && query.page === '1') {
      const limit = Math.min(500, parseInt(query.limit) || 100);
      const after =
        query.afterDate && query.afterCreatedAt && query.afterId
          ? { date: query.afterDate, createdAt: query.afterCreatedAt, id: query.afterId }
          : undefined;
      const entries = await repos.caixa.findPageKeyset({ limit, after });
      return sendJson(res, { entries });
    }
    sendJson(res, await envelope());
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostCaixa(body, res) {
  try {
    const entry = {
      id: generateId('cxa'),
      type: body.type || 'entrada',
      description: body.description || '',
      value: money.parse(body.value),
      date: body.date || new Date().toISOString().split('T')[0],
      contractId: body.contractId || null,
      baseItemId: body.baseItemId || null,
      category: body.category || 'geral',
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
    };
    await repos.caixa.create(entry);
    sendJson(res, await envelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutCaixa(id, body, res) {
  try {
    const allowed = {};
    const fields = ['type', 'description', 'value', 'date', 'contractId', 'baseItemId', 'category', 'notes'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (allowed.value !== undefined) allowed.value = money.parse(allowed.value);

    const result = await repos.caixa.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Entry not found');
    sendJson(res, await envelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteCaixa(id, res) {
  try {
    await repos.caixa.removeById(id);
    sendJson(res, await envelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = { handleGetCaixa, handlePostCaixa, handlePutCaixa, handleDeleteCaixa };
