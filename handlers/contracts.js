'use strict';
/**
 * @file Handlers do CRUD PRINCIPAL de Contratos. Extraído do server.js.
 * Os sub-recursos (saídas/orçamento/RDOs/aditivos/marcos/ocorrências) seguem em
 * outros pontos do server.js (extração separada). `retencaoPercent` é percentual
 * (não dinheiro) → segue parseFloat.
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { parseOptionalMoney } = require('../lib/validate');

async function handleGetContracts(res, query) {
  try {
    const lite = !!(query && (query.lite === '1' || query.lite === 'true'));
    sendJson(res, await repos.contracts.getEnvelope({ lite }));
  } catch (e) { sendError(res, 500, e.message); }
}

/**
 * UM contrato com os filhos só DELE (organograma, RDOs, aditivos, marcos,
 * ocorrências) + as suas saídas.
 *
 * Existe porque abrir uma obra puxava `/api/contracts` inteiro, que roda
 * `findAllWithChildren()` — um `SELECT * FROM rdos WHERE contract_id IN (todos)`
 * sem paginação. Numa empresa com 20 obras isso significa baixar os RDOs de
 * todas elas (com os JSONB de mão de obra, equipamentos, atividades e fotos)
 * pra renderizar uma. `findByIdWithChildren` já existia e já fazia o certo;
 * faltava a rota.
 */
async function handleGetContract(id, res) {
  try {
    const contract = await repos.contracts.findByIdWithChildren(id);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const saidas = await db.getMany(
      `SELECT * FROM saidas WHERE contract_id = $1 ORDER BY date DESC, created_at DESC`,
      [id]
    );
    sendJson(res, { contract, saidas });
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
      value: parseOptionalMoney(body.value, 'value'), currency: body.currency || 'BRL',
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
    if (body.value !== undefined) allowed.value = parseOptionalMoney(body.value, 'value');
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

module.exports = {
  handleGetContract, handleGetContracts, handlePostContract, handlePutContract, handleDeleteContract };
