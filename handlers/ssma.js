'use strict';
/**
 * @file SSMA — Desvios e incidentes de segurança por obra (roadmap item 7).
 *
 * CRUD das ocorrências de SSMA de um contrato mais os indicadores de segurança
 * (Taxa de Frequência e Taxa de Gravidade). Toda a REGRA (taxas, resumo) vive em
 * lib/ssma.js — aqui só se orquestra HTTP + persistência.
 *
 * Envelope { ocorrencias, resumo }: como no punch list, o front re-renderiza a
 * lista inteira da obra a cada mutação, então toda resposta devolve a verdade
 * completa (as ocorrências e o resumo agregado com TF/TG já calculados).
 *
 * HHT (homem-hora trabalhado) das taxas: somado dos RDOs da obra
 * (totais.totalHomemHora). Pode ser sobrescrito por `?hht=NNNN` na query do GET
 * — útil quando o HHT oficial vem de fora do sistema (planilha da segurança).
 * Sem RDOs e sem override, hht = 0 e as taxas ficam 0 (ver BR-SSMA-001/002).
 */
const repos = require('../db/repos');
const ssma = require('../lib/ssma');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

/**
 * Confere que a ocorrência existe e pertence ao contrato. Lança Error com
 * `statusCode = 404` caso contrário (molde _assertItemDoContrato do punch).
 * @param {string} contractId
 * @param {string} ocorrId
 * @returns {Promise<object>} a ocorrência atual (já em camelCase pelo repo).
 */
async function _assertOcorrenciaDoContrato(contractId, ocorrId) {
  const oc = await repos.ssmaOcorrencias.findById(ocorrId);
  if (!oc || oc.contractId !== contractId) {
    const err = new Error('Ocorrência SSMA não encontrada neste contrato');
    err.statusCode = 404;
    throw err;
  }
  return oc;
}

/**
 * HHT da obra. Override numérico da query (`?hht=`) tem prioridade; senão soma
 * `totais.totalHomemHora` de todos os RDOs do contrato. Retorna 0 se nada
 * disponível (as taxas caem para 0, conforme BR-SSMA-001/002).
 * @param {string} contractId
 * @param {Record<string,string>} [query]
 * @returns {Promise<number>}
 */
async function _hhtDoContrato(contractId, query) {
  const raw = query && query.hht;
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const rdos = await repos.rdos.findAll({ contractId });
  let hht = 0;
  for (const r of rdos || []) {
    const t = r && r.totais;
    hht += (t && Number(t.totalHomemHora)) || 0;
  }
  return hht;
}

/**
 * Monta o envelope da obra: a lista de ocorrências e o resumo agregado
 * (total, por tipo, por status, com afastamento, dias perdidos, TF, TG).
 * @param {string} contractId
 * @param {number} hht
 * @returns {Promise<{ ocorrencias: object[], resumo: object }>}
 */
async function _envelope(contractId, hht) {
  const ocorrencias = await repos.ssmaOcorrencias.findAll({ contractId });
  return { ocorrencias, resumo: ssma.resumo(ocorrencias, hht) };
}

/** GET /api/contracts/:id/ssma — lista + resumo (TF/TG) das ocorrências. */
async function handleListSsma(contractId, res, query) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const hht = await _hhtDoContrato(contractId, query);
    sendJson(res, await _envelope(contractId, hht));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/contracts/:id/ssma — cria uma ocorrência SSMA. */
async function handlePostSsma(contractId, body, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    if (!body || !body.descricao || !String(body.descricao).trim()) {
      return sendError(res, 400, 'Descrição é obrigatória');
    }
    const agora = new Date().toISOString();
    const status = ssma.normalizarStatus(body.status);
    const item = {
      id: generateId('ssma'),
      contractId,
      tipo: ssma.normalizarTipo(body.tipo),
      data: body.data || new Date().toISOString().split('T')[0],
      gravidade: ssma.normalizarGravidade(body.gravidade),
      descricao: String(body.descricao).trim(),
      causa: body.causa || '',
      acaoCorretiva: body.acaoCorretiva || '',
      responsavelId: body.responsavelId || null,
      prazo: body.prazo || null,
      status,
      comAfastamento: !!body.comAfastamento,
      diasPerdidos: parseInt(body.diasPerdidos, 10) || 0,
      // Carimbo de encerramento derivado do status inicial (raro, mas possível).
      encerradoEm: status === 'encerrado' ? agora : null,
      createdAt: agora,
      updatedAt: agora,
    };
    await repos.ssmaOcorrencias.create(item);
    sendJson(res, await _envelope(contractId, await _hhtDoContrato(contractId)));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/contracts/:id/ssma/:ocorrId — atualiza os campos presentes. */
async function handlePutSsma(contractId, ocorrId, body, res) {
  try {
    const atual = await _assertOcorrenciaDoContrato(contractId, ocorrId);
    const allowed = { updatedAt: new Date().toISOString() };
    if (body.tipo !== undefined) allowed.tipo = ssma.normalizarTipo(body.tipo);
    if (body.gravidade !== undefined) allowed.gravidade = ssma.normalizarGravidade(body.gravidade);
    if (body.data !== undefined) allowed.data = body.data || null;
    if (body.descricao !== undefined) {
      const d = String(body.descricao).trim();
      if (!d) return sendError(res, 400, 'Descrição é obrigatória');
      allowed.descricao = d;
    }
    if (body.causa !== undefined) allowed.causa = body.causa || '';
    if (body.acaoCorretiva !== undefined) allowed.acaoCorretiva = body.acaoCorretiva || '';
    if (body.responsavelId !== undefined) allowed.responsavelId = body.responsavelId || null;
    if (body.prazo !== undefined) allowed.prazo = body.prazo || null;
    if (body.comAfastamento !== undefined) allowed.comAfastamento = !!body.comAfastamento;
    if (body.diasPerdidos !== undefined) allowed.diasPerdidos = parseInt(body.diasPerdidos, 10) || 0;
    if (body.status !== undefined) {
      const st = ssma.normalizarStatus(body.status);
      allowed.status = st;
      // Encerrar carimba encerrado_em (preserva um já existente); reabrir limpa.
      allowed.encerradoEm = st === 'encerrado'
        ? (atual.encerradoEm || new Date().toISOString())
        : null;
    }
    await repos.ssmaOcorrencias.updateById(ocorrId, allowed);
    sendJson(res, await _envelope(contractId, await _hhtDoContrato(contractId)));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/contracts/:id/ssma/:ocorrId — remove a ocorrência. */
async function handleDeleteSsma(contractId, ocorrId, res) {
  try {
    await _assertOcorrenciaDoContrato(contractId, ocorrId);
    await repos.ssmaOcorrencias.removeById(ocorrId);
    sendJson(res, await _envelope(contractId, await _hhtDoContrato(contractId)));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = { handleListSsma, handlePostSsma, handlePutSsma, handleDeleteSsma };
