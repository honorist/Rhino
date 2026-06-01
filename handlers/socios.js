'use strict';
/**
 * @file Handlers de Sócios — CRUD. Extraído do server.js (desmembramento Fase A).
 * `participacao` é PERCENTUAL (não dinheiro) → segue como parseFloat.
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

async function envelope() {
  return { socios: await repos.socios.findAll() };
}

async function handleGetSocios(res) {
  try { sendJson(res, await envelope()); }
  catch (e) { sendError(res, 500, e.message); }
}

async function handlePostSocio(body, res) {
  try {
    if (!body.name) return sendError(res, 400, 'Nome é obrigatório');
    const socio = {
      id: generateId('soc'),
      name: body.name,
      document: body.document || '',
      email: body.email || '',
      phone: body.phone || '',
      participacao: parseFloat(body.participacao) || 0,
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.socios.create(socio);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutSocio(id, body, res) {
  try {
    const allowed = {};
    const fields = ['name', 'document', 'email', 'phone', 'participacao', 'notes'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (allowed.participacao !== undefined) allowed.participacao = parseFloat(allowed.participacao) || 0;
    allowed.updatedAt = new Date().toISOString();

    const result = await repos.socios.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Sócio não encontrado');
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteSocio(id, res) {
  try {
    await repos.socios.removeById(id);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

module.exports = { handleGetSocios, handlePostSocio, handlePutSocio, handleDeleteSocio };
