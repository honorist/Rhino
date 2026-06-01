'use strict';
/**
 * @file Handlers de Tipos da BASE (custos administrativos customizáveis) — CRUD.
 * Extraído do server.js (desmembramento).
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

function slugify(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || ('tipo_' + Date.now().toString(36));
}

async function envelope() { return { tipos: await repos.tiposBase.findAll() }; }

async function handleGetTiposBase(res) {
  try { sendJson(res, await envelope()); } catch (e) { sendError(res, 500, e.message); }
}

async function handlePostTipoBase(body, res) {
  try {
    const label = (body.label || '').trim();
    if (!label) return sendError(res, 400, 'Nome do tipo é obrigatório');
    const baseKey = slugify(body.key || label);
    const existentes = (await repos.tiposBase.findAll()).map((t) => t.key);
    let k = baseKey, n = 2;
    while (existentes.includes(k)) { k = `${baseKey}_${n++}`; }
    const tipo = { id: generateId('tpb'), key: k, label, icon: body.icon || '🔹', cor: body.cor || '#718096', sistema: false };
    await repos.tiposBase.create(tipo);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutTipoBase(id, body, res) {
  try {
    const current = await repos.tiposBase.findById(id);
    if (!current) return sendError(res, 404, 'Tipo não encontrado');
    const allowed = {};
    if (body.label) allowed.label = body.label.trim();
    if (body.icon) allowed.icon = body.icon;
    if (body.cor) allowed.cor = body.cor;
    if (!current.sistema && body.key) allowed.key = slugify(body.key);
    await repos.tiposBase.updateById(id, allowed);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteTipoBase(id, res) {
  try {
    const tipo = await repos.tiposBase.findById(id);
    if (!tipo) return sendError(res, 404, 'Tipo não encontrado');
    if (tipo.sistema) return sendError(res, 400, 'Não é possível excluir tipos do sistema');
    const baseItems = await repos.baseItems.findAll();
    if (baseItems.some((b) => b.type === tipo.key)) {
      return sendError(res, 400, 'Tipo em uso por itens da BASE. Remova ou reclassifique os itens antes de excluir.');
    }
    await repos.tiposBase.removeById(id);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

module.exports = { handleGetTiposBase, handlePostTipoBase, handlePutTipoBase, handleDeleteTipoBase };
