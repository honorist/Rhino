'use strict';
/**
 * @file Handlers de Templates de Documento — CRUD. Extraído do server.js.
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

async function envelope() { return { templates: await repos.docTemplates.findAll() }; }

async function handleGetDocTemplates(res) {
  try { sendJson(res, await envelope()); } catch (e) { sendError(res, 500, e.message); }
}

async function handlePostDocTemplate(body, res) {
  try {
    const template = {
      id: generateId('tpl'),
      nome: body.nome || '', tipoDocumento: body.tipoDocumento || '', empresaId: body.empresaId || null,
      checklist: JSON.stringify(Array.isArray(body.checklist) ? body.checklist : []),
      periodicidadeMeses: Number.isFinite(parseInt(body.periodicidadeMeses)) ? parseInt(body.periodicidadeMeses) : 12,
      metadata: JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      body: body.body || null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await repos.docTemplates.create(template);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutDocTemplate(id, body, res) {
  try {
    const allowed = {};
    const fields = ['nome', 'tipoDocumento', 'empresaId', 'body'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.checklist !== undefined) allowed.checklist = JSON.stringify(Array.isArray(body.checklist) ? body.checklist : []);
    if (body.metadata !== undefined) allowed.metadata = JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {});
    if (body.periodicidadeMeses !== undefined) allowed.periodicidadeMeses = Number.isFinite(parseInt(body.periodicidadeMeses)) ? parseInt(body.periodicidadeMeses) : 12;
    allowed.updatedAt = new Date().toISOString();
    const result = await repos.docTemplates.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Não encontrado');
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteDocTemplate(id, res) {
  try { await repos.docTemplates.removeById(id); sendJson(res, await envelope()); }
  catch (e) { sendError(res, 400, e.message); }
}

module.exports = { handleGetDocTemplates, handlePostDocTemplate, handlePutDocTemplate, handleDeleteDocTemplate };
