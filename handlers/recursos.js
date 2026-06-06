'use strict';
/**
 * @file Handlers do CRUD PRINCIPAL de Recursos (colaboradores). Extraído do
 * server.js. O CPF é cifrado/decifrado no repo (db/repos/recursos.js); aqui é
 * MASCARADO na LEITURA para quem não tem permissão de edição de recursos (LGPD).
 * Sub-recursos (folgas/documentos/passagens) seguem no server.js (extração separada).
 */
const repos = require('../db/repos');
const perms = require('../lib/permissions');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money');

async function _podeVerCpf(user) {
  if (perms.isSuperAdmin(user)) return true;
  const abas = await perms.loadAbas(user);
  if (!abas) return true; // admin sem perfil restritivo
  return abas.includes('edit:#/recursos');
}

/** Mascara um CPF preservando só 3 dígitos: "•••.•••.789-••". */
function _mascararCpf(cpf) {
  const s = String(cpf || '').replace(/\D/g, '');
  if (!s) return cpf || '';
  if (s.length !== 11) return '•••••'; // formato inesperado → oculta tudo
  return `•••.•••.${s.slice(6, 9)}-••`;
}

async function handleGetRecursos(req, res) {
  try {
    const recursos = await repos.recursos.findAll(); // repo já decifra o CPF
    const verCpf = await _podeVerCpf(req.user);
    const out = verCpf ? recursos : recursos.map((r) => ({ ...r, cpf: _mascararCpf(r.cpf) }));
    sendJson(res, { recursos: out });
  } catch (e) { sendError(res, 500, e.message); }
}

async function handlePostRecurso(body, res) {
  try {
    const recurso = {
      id: generateId('rec'),
      nome: body.nome || '', cpf: body.cpf || '', dataNascimento: body.dataNascimento || null,
      genero: body.genero || '', telefone: body.telefone || '', email: body.email || '',
      endereco: body.endereco || '', cidade: body.cidade || '', estado: body.estado || '', lat: body.lat || '', lng: body.lng || '',
      status: body.status || 'candidato', profissao: body.profissao || '', dataAdmissao: body.dataAdmissao || null,
      salario: money.parse(body.salario), elegivelVale: !!body.elegivelVale, cnh: body.cnh || '', pis: body.pis || '',
      dataDesligamento: body.dataDesligamento || null, motivoDesligamento: body.motivoDesligamento || '',
      obsDesligamento: body.obsDesligamento || '', notas: body.notas || '', rdoCategoria: body.rdoCategoria || '',
      folgas: '[]', documentos: '[]', historicoAlocacoes: '[]',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await repos.recursos.create(recurso);
    sendJson(res, { recursos: await repos.recursos.findAll() });
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutRecurso(id, body, res) {
  try {
    const allowed = {};
    const fields = ['nome', 'cpf', 'genero', 'telefone', 'email', 'endereco', 'cidade', 'estado', 'lat', 'lng',
      'status', 'profissao', 'cnh', 'pis', 'motivoDesligamento', 'obsDesligamento', 'notas', 'rdoCategoria'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    // LGPD: nunca grava CPF mascarado — se a UI ecoar a máscara, ignora e mantém o real.
    if (allowed.cpf !== undefined && /•/.test(String(allowed.cpf))) delete allowed.cpf;
    for (const f of ['dataNascimento', 'dataAdmissao', 'dataDesligamento']) {
      if (body[f] !== undefined) allowed[f] = body[f] || null;
    }
    if (body.salario !== undefined) allowed.salario = money.parse(body.salario);
    if (body.elegivelVale !== undefined) allowed.elegivelVale = !!body.elegivelVale;
    if (body.alocacaoAtual !== undefined) {
      allowed.alocacaoAtual = body.alocacaoAtual ? JSON.stringify(body.alocacaoAtual) : null;
    }
    allowed.updatedAt = new Date().toISOString();
    const result = await repos.recursos.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Recurso não encontrado');
    sendJson(res, { recursos: await repos.recursos.findAll() });
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteRecurso(id, res) {
  try {
    await repos.recursos.removeById(id);
    sendJson(res, { recursos: await repos.recursos.findAll() });
  } catch (e) { sendError(res, 400, e.message); }
}

module.exports = { handleGetRecursos, handlePostRecurso, handlePutRecurso, handleDeleteRecurso };
