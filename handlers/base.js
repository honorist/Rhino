'use strict';
/**
 * @file Handlers da BASE (custos-base) — CRUD. Extraído do server.js
 * (desmembramento Fase A). O `allocate` permanece no server.js por ter lógica
 * de alocação contra contratos.
 */
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

module.exports = { handleGetBase, handlePostBase, handlePutBase, handleDeleteBase };
