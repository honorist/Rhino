'use strict';
/**
 * @file Equipamentos próprios/locados (roadmap item 16).
 *
 * CRUD dos equipamentos da empresa (cadastro global) + CRUD das locações de cada
 * equipamento a obras. Toda a REGRA (custo acumulado, resumo do parque, alerta de
 * devolução) vive em lib/equipamento.js — aqui só se orquestra HTTP + persistência.
 *
 * Envelope dos equipamentos { equipamentos, resumo }: como na frota, o front
 * recarrega a tela inteira a cada mutação, então toda resposta devolve a verdade
 * completa (a lista + o resumo agregado próprios/locados/status/custo mensal).
 *
 * Envelope das locações { locacoes, alertas }: cada locação já vem com o
 * `custoAcumulado` calculado até hoje (ou até a devolução), e `alertas` traz as
 * locações ativas vencidas/vencendo (≤15 dias) — ver BR-EQP-001/003.
 */
const repos = require('../db/repos');
const equipamento = require('../lib/equipamento');
const money = require('../lib/money');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

/** Dia de hoje em YYYY-MM-DD (base do custo acumulado e do alerta). */
function _hoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Envelope do parque: lista de equipamentos + resumo agregado (próprios vs
 * locados, por status, custo mensal de locação).
 * @returns {Promise<{ equipamentos: object[], resumo: object }>}
 */
async function _envelope() {
  const equipamentos = await repos.equipamentos.findAll();
  return { equipamentos, resumo: equipamento.resumo(equipamentos) };
}

/**
 * Envelope das locações de um equipamento: cada locação com o custo acumulado
 * (até hoje ou até o fim) e os alertas de devolução.
 * @param {string} equipId
 * @returns {Promise<{ locacoes: object[], alertas: object[] }>}
 */
async function _envelopeLocacoes(equipId) {
  const hoje = _hoje();
  const locacoes = await repos.equipamentoLocacoes.findAll({ equipamentoId: equipId });
  const comCusto = locacoes.map((l) => ({
    ...l,
    custoAcumulado: equipamento.custoLocacaoAcumulado(l.dataInicio, l.dataFim, l.valorMensal, hoje),
  }));
  return { locacoes: comCusto, alertas: equipamento.alertaDevolucao(locacoes, hoje) };
}

/**
 * Confere que o equipamento existe. Lança Error com `statusCode = 404` caso não.
 * @param {string} equipId
 * @returns {Promise<object>} o equipamento atual (camelCase pelo repo).
 */
async function _assertEquipamento(equipId) {
  const eq = await repos.equipamentos.findById(equipId);
  if (!eq) {
    const err = new Error('Equipamento não encontrado');
    err.statusCode = 404;
    throw err;
  }
  return eq;
}

/**
 * Confere que a locação existe e pertence ao equipamento (molde do punch/ssma).
 * @param {string} equipId
 * @param {string} locId
 * @returns {Promise<object>} a locação atual.
 */
async function _assertLocacaoDoEquipamento(equipId, locId) {
  const loc = await repos.equipamentoLocacoes.findById(locId);
  if (!loc || loc.equipamentoId !== equipId) {
    const err = new Error('Locação não encontrada neste equipamento');
    err.statusCode = 404;
    throw err;
  }
  return loc;
}

// ============ Equipamentos ============

/** GET /api/equipamentos — lista + resumo do parque. */
async function handleListEquipamentos(res) {
  try {
    sendJson(res, await _envelope());
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/equipamentos — cria um equipamento. */
async function handlePostEquipamento(body, res) {
  try {
    if (!body || !body.nome || !String(body.nome).trim()) {
      return sendError(res, 400, 'Nome é obrigatório');
    }
    const agora = new Date().toISOString();
    const item = {
      id: generateId('eqp'),
      nome: String(body.nome).trim(),
      tipo: (body.tipo || '').trim(),
      propriedade: equipamento.normalizarPropriedade(body.propriedade),
      fornecedorId: body.fornecedorId || null,
      valorAquisicao: money.parse(body.valorAquisicao),
      valorLocacaoMensal: money.parse(body.valorLocacaoMensal),
      status: equipamento.normalizarStatus(body.status),
      localizacao: (body.localizacao || '').trim(),
      createdAt: agora,
      updatedAt: agora,
    };
    await repos.equipamentos.create(item);
    sendJson(res, await _envelope());
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/equipamentos/:id — atualiza os campos presentes. */
async function handlePutEquipamento(id, body, res) {
  try {
    await _assertEquipamento(id);
    const allowed = { updatedAt: new Date().toISOString() };
    if (body.nome !== undefined) {
      const n = String(body.nome).trim();
      if (!n) return sendError(res, 400, 'Nome é obrigatório');
      allowed.nome = n;
    }
    if (body.tipo !== undefined) allowed.tipo = (body.tipo || '').trim();
    if (body.propriedade !== undefined) allowed.propriedade = equipamento.normalizarPropriedade(body.propriedade);
    if (body.fornecedorId !== undefined) allowed.fornecedorId = body.fornecedorId || null;
    if (body.valorAquisicao !== undefined) allowed.valorAquisicao = money.parse(body.valorAquisicao);
    if (body.valorLocacaoMensal !== undefined) allowed.valorLocacaoMensal = money.parse(body.valorLocacaoMensal);
    if (body.status !== undefined) allowed.status = equipamento.normalizarStatus(body.status);
    if (body.localizacao !== undefined) allowed.localizacao = (body.localizacao || '').trim();
    await repos.equipamentos.updateById(id, allowed);
    sendJson(res, await _envelope());
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/equipamentos/:id — remove o equipamento (e suas locações, CASCADE). */
async function handleDeleteEquipamento(id, res) {
  try {
    await _assertEquipamento(id);
    await repos.equipamentos.removeById(id);
    sendJson(res, await _envelope());
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// ============ Locações ============

/** GET /api/equipamentos/:id/locacoes — locações + custo acumulado + alertas. */
async function handleListLocacoes(equipId, res) {
  try {
    await _assertEquipamento(equipId);
    sendJson(res, await _envelopeLocacoes(equipId));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/equipamentos/:id/locacoes — cria uma locação do equipamento. */
async function handlePostLocacao(equipId, body, res) {
  try {
    const eq = await _assertEquipamento(equipId);
    const agora = new Date().toISOString();
    const item = {
      id: generateId('eqploc'),
      equipamentoId: equipId,
      contractId: body.contractId || null,
      dataInicio: body.dataInicio || null,
      dataFim: body.dataFim || null,
      // Sem valor informado, herda o valor mensal de locação do equipamento.
      valorMensal: body.valorMensal !== undefined && body.valorMensal !== ''
        ? money.parse(body.valorMensal)
        : money.parse(eq.valorLocacaoMensal),
      status: equipamento.normalizarStatusLocacao(body.status),
      createdAt: agora,
      updatedAt: agora,
    };
    await repos.equipamentoLocacoes.create(item);
    sendJson(res, await _envelopeLocacoes(equipId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/equipamentos/:id/locacoes/:locId — atualiza os campos presentes. */
async function handlePutLocacao(equipId, locId, body, res) {
  try {
    await _assertLocacaoDoEquipamento(equipId, locId);
    const allowed = { updatedAt: new Date().toISOString() };
    if (body.contractId !== undefined) allowed.contractId = body.contractId || null;
    if (body.dataInicio !== undefined) allowed.dataInicio = body.dataInicio || null;
    if (body.dataFim !== undefined) allowed.dataFim = body.dataFim || null;
    if (body.valorMensal !== undefined) allowed.valorMensal = money.parse(body.valorMensal);
    if (body.status !== undefined) allowed.status = equipamento.normalizarStatusLocacao(body.status);
    await repos.equipamentoLocacoes.updateById(locId, allowed);
    sendJson(res, await _envelopeLocacoes(equipId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/equipamentos/:id/locacoes/:locId — remove a locação. */
async function handleDeleteLocacao(equipId, locId, res) {
  try {
    await _assertLocacaoDoEquipamento(equipId, locId);
    await repos.equipamentoLocacoes.removeById(locId);
    sendJson(res, await _envelopeLocacoes(equipId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = {
  handleListEquipamentos,
  handlePostEquipamento,
  handlePutEquipamento,
  handleDeleteEquipamento,
  handleListLocacoes,
  handlePostLocacao,
  handlePutLocacao,
  handleDeleteLocacao,
};
