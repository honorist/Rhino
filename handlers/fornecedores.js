'use strict';
/**
 * @file Handlers de Fornecedores — CRUD. Extraído do server.js (desmembramento).
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

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
    const fornecedor = {
      id: generateId('for'),
      nome: body.nome || '', cnpj: body.cnpj || '', endereco: body.endereco || '',
      telefone: body.telefone || '', email: body.email || '', pessoaContato: body.pessoaContato || '',
      materiais: JSON.stringify(normalizeMateriais(body.materiais)),
      banco: body.banco || '', agencia: body.agencia || '', conta: body.conta || '',
      chavePix: body.chavePix || '', notas: body.notas || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await repos.fornecedores.create(fornecedor);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutFornecedor(id, body, res) {
  try {
    const allowed = {};
    const fields = ['nome', 'cnpj', 'endereco', 'telefone', 'email', 'pessoaContato', 'banco', 'agencia', 'conta', 'chavePix', 'notas'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
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
