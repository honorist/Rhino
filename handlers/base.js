'use strict';
/**
 * @file Handlers da BASE (custos-base) — CRUD + alocação contra contratos.
 * Extraído do server.js (desmembramento). A alocação (`handleAllocateBase`)
 * roda sob transação + advisory lock: checa o limite e escreve item + caixa de
 * forma atômica, evitando over-alocação concorrente.
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money');

async function envelope() {
  return { items: await repos.baseItems.findAll() };
}

async function handleGetBase(res) {
  try { sendJson(res, await envelope()); }
  catch (e) { sendError(res, 500, e.message); }
}

async function handlePostBase(body, res) {
  try {
    const item = {
      id: generateId('bas'),
      description: body.description || '',
      type: body.type || 'variavel',
      value: money.parse(body.value),
      date: body.date || new Date().toISOString().split('T')[0],
      allocations: '[]',
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.baseItems.create(item);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutBase(id, body, res) {
  try {
    const allowed = {};
    const fields = ['description', 'type', 'notes'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.value !== undefined) allowed.value = money.parse(body.value);
    if (body.date !== undefined) allowed.date = body.date || null;
    allowed.updatedAt = new Date().toISOString();

    const result = await repos.baseItems.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Item not found');
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteBase(id, res) {
  try {
    await repos.baseItems.removeById(id);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleAllocateBase(id, body, res) {
  try {
    const allocationValue = money.parse(body.value);
    // FIX: alocação sob transação + advisory lock — a checagem de limite e os 2 writes
    // (base item + caixa) eram soltos, permitindo over-alocação concorrente e inconsistência.
    const env = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('base:' || $1)::int)", [id]);
      const baseItem = await repos.baseItems.findById(id);
      if (!baseItem) {
        const e = new Error('Base item not found');
        e.statusCode = 404;
        throw e;
      }

      const allocs = baseItem.allocations || [];
      const totalAllocated = allocs.reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
      if (totalAllocated + allocationValue > parseFloat(baseItem.value) + 0.01) {
        const e = new Error(
          `Cannot allocate more than available. Available: ${(parseFloat(baseItem.value) - totalAllocated).toFixed(2)}`
        );
        e.statusCode = 400;
        throw e;
      }

      const allocation = {
        id: generateId('alc'),
        contractId: body.contractId,
        value: allocationValue,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
      };
      const newAllocs = allocs.concat(allocation);
      await repos.baseItems.updateById(id, {
        allocations: JSON.stringify(newAllocs),
        updatedAt: new Date().toISOString(),
      });

      await repos.caixa.create({
        id: generateId('cxa'),
        type: 'saida',
        description: `Alocação BASE: ${baseItem.description}`,
        value: allocationValue,
        date: allocation.date,
        contractId: body.contractId,
        baseItemId: id,
        category: 'base',
        notes: '',
        createdAt: new Date().toISOString(),
      });

      return {
        base: { items: await repos.baseItems.findAll() },
        caixa: { entries: await repos.caixa.findAll() },
        contracts: await repos.contracts.getEnvelope(),
      };
    });
    sendJson(res, env);
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = { handleGetBase, handlePostBase, handlePutBase, handleDeleteBase, handleAllocateBase };
