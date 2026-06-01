'use strict';
/**
 * @file Handlers de Clientes — CRUD. Inclui credenciais do portal do cliente
 * (hash bcrypt) e propagação de endereço/coords para contratos vinculados.
 * Extraído do server.js (desmembramento).
 */
const bcrypt = require('bcryptjs');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

async function envelope() { return { clientes: await repos.clientes.findAll() }; }

async function handleGetClientes(res) {
  try { sendJson(res, await envelope()); } catch (e) { sendError(res, 500, e.message); }
}

async function handlePostCliente(body, res) {
  try {
    const cliente = {
      id: generateId('cli'),
      nome: body.nome || '', empresa: body.empresa || '', cargo: body.cargo || '',
      setor: body.setor || '', telefone: body.telefone || '', email: body.email || '',
      endereco: body.endereco || '', lat: body.lat || '', lng: body.lng || '',
      notas: body.notas || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    if (body.portalEmail) {
      cliente.portalEmail = body.portalEmail.trim().toLowerCase();
      if (body.portalSenha) {
        if (String(body.portalSenha).length < 8) return sendError(res, 400, 'Senha do portal precisa ter no mínimo 8 caracteres');
        cliente.portalPasswordHash = await bcrypt.hash(body.portalSenha, 10);
      }
    }
    await repos.clientes.create(cliente);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutCliente(id, body, res) {
  try {
    const allowed = {};
    const fields = ['nome', 'empresa', 'cargo', 'setor', 'telefone', 'email', 'endereco', 'notas', 'lat', 'lng'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.portalEmail !== undefined) {
      allowed.portalEmail = body.portalEmail ? body.portalEmail.trim().toLowerCase() : null;
    }
    if (body.portalSenha) {
      if (String(body.portalSenha).length < 8) return sendError(res, 400, 'Senha do portal precisa ter no mínimo 8 caracteres');
      allowed.portalPasswordHash = await bcrypt.hash(body.portalSenha, 10);
    }
    if (body.removerPortalAcesso) {
      allowed.portalEmail = null;
      allowed.portalPasswordHash = null;
    }
    allowed.updatedAt = new Date().toISOString();

    const result = await repos.clientes.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Cliente não encontrado');

    // Propaga endereço/lat/lng para contratos vinculados que ainda não tenham
    // coordenadas — para aparecerem no Mapa de Obras sem editar um a um.
    const isEmpty = (v) => v === undefined || v === null || v === '';
    if (!isEmpty(result.lat) && !isEmpty(result.lng)) {
      try {
        const vinculados = await repos.contracts.findAll({ clientId: id });
        for (const ct of vinculados) {
          if (isEmpty(ct.lat) || isEmpty(ct.lng)) {
            await repos.contracts.updateById(ct.id, {
              lat: result.lat, lng: result.lng,
              endereco: isEmpty(ct.endereco) ? (result.endereco || '') : ct.endereco,
            });
          }
        }
      } catch (syncErr) {
        console.error('[clientes] falha ao propagar endereço para contratos:', syncErr.message);
      }
    }
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteCliente(id, res) {
  try { await repos.clientes.removeById(id); sendJson(res, await envelope()); }
  catch (e) { sendError(res, 400, e.message); }
}

module.exports = { handleGetClientes, handlePostCliente, handlePutCliente, handleDeleteCliente };
