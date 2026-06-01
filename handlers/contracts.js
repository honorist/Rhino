'use strict';
/**
 * @file Handlers do CRUD PRINCIPAL de Contratos. Extraído do server.js.
 * Os sub-recursos (saídas/orçamento/RDOs/aditivos/marcos/ocorrências) seguem em
 * outros pontos do server.js (extração separada). `retencaoPercent` é percentual
 * (não dinheiro) → segue parseFloat.
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money');

async function handleGetContracts(res, query) {
  try {
    const lite = !!(query && (query.lite === '1' || query.lite === 'true'));
    sendJson(res, await repos.contracts.getEnvelope({ lite }));
  } catch (e) { sendError(res, 500, e.message); }
}

async function handlePostContract(body, res) {
  try {
    if (!body.name || !body.client) return sendError(res, 400, 'Nome e cliente são obrigatórios');
    const contract = {
      id: generateId('ctr'),
      name: body.name, contractNumber: body.contractNumber || '', client: body.client,
      clientId: body.clientId || null, clientDocument: body.clientDocument || '',
      clientEmail: body.clientEmail || '', clientPhone: body.clientPhone || '',
      value: money.parse(body.value), currency: body.currency || 'BRL',
      startDate: body.startDate || null, endDate: body.endDate || null, tendencyDate: body.tendencyDate || null,
      status: body.status || 'ativo', endereco: body.endereco || '', lat: body.lat || '', lng: body.lng || '',
      notes: body.notes || '', retencaoPercent: parseFloat(body.retencaoPercent) || 0, budget: '[]',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await repos.contracts.create(contract);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutContract(id, body, res) {
  try {
    const allowed = {};
    const fields = ['name', 'client', 'clientId', 'clientDocument', 'clientEmail', 'clientPhone', 'currency', 'status', 'notes', 'lat', 'lng', 'endereco', 'contractNumber'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.value !== undefined) allowed.value = money.parse(body.value);
    if (body.retencaoPercent !== undefined) allowed.retencaoPercent = parseFloat(body.retencaoPercent) || 0;
    for (const f of ['startDate', 'endDate', 'tendencyDate']) {
      if (body[f] !== undefined) allowed[f] = body[f] || null;
    }
    allowed.updatedAt = new Date().toISOString();
    const result = await repos.contracts.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Contract not found');
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteContract(id, res) {
  try {
    // FK CASCADE remove saidas/organograma/rdos; o cascade manual (no repo) limpa
    // caixa, contas_pagar, notas_fiscais e investimentos vinculados ao contrato.
    await repos.contracts.removeByIdCascade(id);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

module.exports = { handleGetContracts, handlePostContract, handlePutContract, handleDeleteContract };
