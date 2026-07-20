'use strict';
/**
 * @file Handlers de Cláusulas (biblioteca reusável de cláusulas de proposta) e
 * da Apresentação Global (texto institucional / cases / SSMA que entram nas
 * propostas). Extraído do server.js (desmembramento), sem alteração de lógica.
 *
 * Cláusulas usam repos.clausulas; a Apresentação é um registro único guardado
 * em app_settings sob a chave `proposta_apresentacao`.
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

// ============ Cláusulas (biblioteca reusável) ============
async function handleGetClausulas(res, query) {
  try {
    const filtros = {
      categoria: query?.categoria || undefined,
      termo: query?.termo || undefined,
      ativa:
        query?.ativa === '0' || query?.ativa === 'false'
          ? false
          : query?.ativa === '1' || query?.ativa === 'true'
            ? true
            : undefined,
    };
    const clausulas = await repos.clausulas.buscar(filtros);
    sendJson(res, { clausulas });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostClausula(body, res) {
  try {
    if (!body.titulo || !body.texto || !body.categoria) {
      return sendError(res, 400, 'Título, texto e categoria são obrigatórios');
    }
    const clausula = {
      id: generateId('cla'),
      titulo: body.titulo,
      texto: body.texto,
      categoria: body.categoria,
      tags: Array.isArray(body.tags) ? body.tags : [],
      ativa: body.ativa !== false,
    };
    await repos.clausulas.create(clausula);
    sendJson(res, { clausulas: await repos.clausulas.findAll() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutClausula(id, body, res) {
  try {
    const allowed = {};
    for (const f of ['titulo', 'texto', 'categoria', 'ativa']) {
      if (body[f] !== undefined) allowed[f] = body[f];
    }
    if (Array.isArray(body.tags)) allowed.tags = body.tags;
    const result = await repos.clausulas.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Cláusula não encontrada');
    sendJson(res, { clausulas: await repos.clausulas.findAll() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteClausula(id, res) {
  try {
    await repos.clausulas.removeById(id);
    sendJson(res, { clausulas: await repos.clausulas.findAll() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Apresentação Global (configuração) ============
async function handleGetApresentacao(res) {
  try {
    const value = (await repos.appSettings.get('proposta_apresentacao')) || {};
    sendJson(res, { apresentacao: value });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePutApresentacao(body, res) {
  try {
    const allowed = {};
    for (const k of ['apresentacao', 'casesSucesso', 'segurancaSaude']) {
      if (body[k] !== undefined) allowed[k] = String(body[k] || '');
    }
    const novo = await repos.appSettings.patch('proposta_apresentacao', allowed);
    sendJson(res, { apresentacao: novo });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = {
  handleGetClausulas,
  handlePostClausula,
  handlePutClausula,
  handleDeleteClausula,
  handleGetApresentacao,
  handlePutApresentacao,
};
