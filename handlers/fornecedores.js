'use strict';
/**
 * @file Handlers de Fornecedores — CRUD. Extraído do server.js (desmembramento).
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { validateBody, schemas } = require('../lib/validate');

function normalizeMateriais(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

async function envelope() { return { fornecedores: await repos.fornecedores.findAll() }; }

async function handleGetFornecedores(res) {
  try { sendJson(res, await envelope()); } catch (e) { sendError(res, 500, e.message); }
}

async function handlePostFornecedor(body, res) {
  try {
    const p = validateBody(schemas.fornecedorPost, body);
    const fornecedor = {
      id: generateId('for'),
      nome: p.nome, cnpj: p.cnpj, endereco: p.endereco,
      telefone: p.telefone, email: p.email, pessoaContato: p.pessoaContato,
      materiais: JSON.stringify(normalizeMateriais(body.materiais)),
      banco: p.banco, agencia: p.agencia, conta: p.conta,
      chavePix: p.chavePix, notas: p.notas,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await repos.fornecedores.create(fornecedor);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutFornecedor(id, body, res) {
  try {
    const allowed = validateBody(schemas.fornecedorPut, body);
    if (body.materiais !== undefined) allowed.materiais = JSON.stringify(normalizeMateriais(body.materiais));
    allowed.updatedAt = new Date().toISOString();
    const result = await repos.fornecedores.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Fornecedor não encontrado');
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteFornecedor(id, res) {
  try { await repos.fornecedores.removeById(id); sendJson(res, await envelope()); }
  catch (e) { sendError(res, 400, e.message); }
}

module.exports = { handleGetFornecedores, handlePostFornecedor, handlePutFornecedor, handleDeleteFornecedor };
