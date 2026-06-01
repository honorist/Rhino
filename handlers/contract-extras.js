'use strict';
/**
 * @file Sub-recursos "leves" de Contratos: Orçamento (budget), Aditivos, Marcos
 * e Ocorrências. Extraído do server.js. Todos devolvem o envelope do contrato.
 * Comparações de orçamento usam parseFloat (leitura) — correto.
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money');

// ── Orçamento (budget) ──
async function handlePostBudgetItem(contractId, body, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const novoValor = money.parse(body.value);
    const budget = contract.budget || [];
    const totalAtual = budget.reduce((s, b) => s + (parseFloat(b.value) || 0), 0);
    if (contract.value > 0 && totalAtual + novoValor > parseFloat(contract.value) + 0.01) {
      return sendError(res, 400,
        `Orçamento ultrapassa o valor do contrato. Disponível: R$ ${(parseFloat(contract.value) - totalAtual).toFixed(2).replace('.', ',')}`);
    }
    const item = {
      id: generateId('bud'), contractId,
      description: body.description || '', type: body.type || 'outros',
      value: novoValor, notes: body.notes || '', createdAt: new Date().toISOString(),
    };
    await repos.contracts.addBudgetItem(contractId, item);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutBudgetItem(contractId, itemId, body, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const budget = contract.budget || [];
    const idx = budget.findIndex((b) => b.id === itemId);
    if (idx === -1) return sendError(res, 404, 'Item não encontrado');
    const patch = { ...body };
    if (patch.value !== undefined) patch.value = money.parse(patch.value);
    if (patch.value !== undefined && contract.value > 0) {
      const outros = budget.reduce((s, b, i) => i === idx ? s : s + (parseFloat(b.value) || 0), 0);
      if (outros + patch.value > parseFloat(contract.value) + 0.01) {
        return sendError(res, 400,
          `Orçamento ultrapassa o valor do contrato. Disponível: R$ ${(parseFloat(contract.value) - outros).toFixed(2).replace('.', ',')}`);
      }
    }
    await repos.contracts.updateBudgetItem(contractId, itemId, patch);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteBudgetItem(contractId, itemId, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    await repos.contracts.removeBudgetItem(contractId, itemId);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

// ── Aditivos ──
async function handlePostAditivo(contractId, body, res) {
  try {
    if (!body.descricao) return sendError(res, 400, 'Descrição é obrigatória');
    const item = {
      id: generateId('adi'), contractId, numero: body.numero || '', tipo: body.tipo || 'valor',
      descricao: body.descricao, valorDelta: money.parse(body.valorDelta), diasDelta: parseInt(body.diasDelta) || 0,
      data: body.data || null, aprovado: !!body.aprovado, createdAt: new Date().toISOString(),
    };
    await repos.aditivos.create(item);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutAditivo(contractId, id, body, res) {
  try {
    const allowed = {};
    const fields = ['numero', 'tipo', 'descricao', 'data'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.valorDelta !== undefined) allowed.valorDelta = money.parse(body.valorDelta);
    if (body.diasDelta !== undefined) allowed.diasDelta = parseInt(body.diasDelta) || 0;
    if (body.aprovado !== undefined) allowed.aprovado = !!body.aprovado;
    const result = await repos.aditivos.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Aditivo não encontrado');
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteAditivo(contractId, id, res) {
  try {
    await repos.aditivos.removeById(id);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

// ── Marcos / Checklist ──
async function handlePostMarco(contractId, body, res) {
  try {
    if (!body.titulo) return sendError(res, 400, 'Título é obrigatório');
    const item = {
      id: generateId('mrc'), contractId, titulo: body.titulo, descricao: body.descricao || '',
      prazo: body.prazo || null, concluido: false, concluidoEm: null,
      ordem: parseInt(body.ordem) || 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await repos.marcos.create(item);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutMarco(contractId, id, body, res) {
  try {
    const allowed = { updatedAt: new Date().toISOString() };
    const fields = ['titulo', 'descricao', 'prazo', 'ordem'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.concluido !== undefined) {
      allowed.concluido = !!body.concluido;
      allowed.concluidoEm = body.concluido ? (body.concluidoEm || new Date().toISOString().split('T')[0]) : null;
    }
    const result = await repos.marcos.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Marco não encontrado');
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteMarco(contractId, id, res) {
  try {
    await repos.marcos.removeById(id);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

// ── Ocorrências ──
async function handlePostOcorrencia(contractId, body, res) {
  try {
    if (!body.descricao) return sendError(res, 400, 'Descrição é obrigatória');
    const item = {
      id: generateId('ocr'), contractId, tipo: body.tipo || 'geral', severidade: body.severidade || 'media',
      descricao: body.descricao, data: body.data || new Date().toISOString().split('T')[0],
      encerrada: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await repos.ocorrencias.create(item);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutOcorrencia(contractId, id, body, res) {
  try {
    const allowed = { updatedAt: new Date().toISOString() };
    const fields = ['tipo', 'severidade', 'descricao', 'data'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.encerrada !== undefined) allowed.encerrada = !!body.encerrada;
    const result = await repos.ocorrencias.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Ocorrência não encontrada');
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteOcorrencia(contractId, id, res) {
  try {
    await repos.ocorrencias.removeById(id);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

module.exports = {
  handlePostBudgetItem, handlePutBudgetItem, handleDeleteBudgetItem,
  handlePostAditivo, handlePutAditivo, handleDeleteAditivo,
  handlePostMarco, handlePutMarco, handleDeleteMarco,
  handlePostOcorrencia, handlePutOcorrencia, handleDeleteOcorrencia,
};
