'use strict';
/**
 * @file Controle de EPIs (item 9) — CRUD da ficha de entrega de EPIs por
 * colaborador (comprovação NR-06). Cada entrega tem descrição, CA, quantidade,
 * data de entrega, vida útil e data prevista de troca.
 *
 * Toda a REGRA vive em lib/epi.js (status da ficha, precisa-troca, resumo, e o
 * cálculo da data prevista de troca) — aqui só se orquestra HTTP + persistência
 * + validação inline (sem lib/validate, por convenção deste bloco de features).
 *
 * Envelope único ({ entregas, resumo }): como no punch list, cada mutação
 * devolve a verdade completa do colaborador (entregas já com o `status`
 * calculado e o resumo agregado) — o front re-renderiza a lista inteira sem
 * reconciliar patch parcial.
 */
const repos = require('../db/repos');
const { statusEpi, resumo, dataTrocaPrevista } = require('../lib/epi');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

/** Dia corrente em YYYY-MM-DD (injetado nas regras puras). */
function _hoje() {
  return new Date().toISOString().slice(0, 10);
}

/** Quantidade: inteiro positivo; qualquer coisa inválida cai em 1. */
function _sanitizeQtd(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Vida útil em meses: inteiro positivo, ou null (sem vida útil definida). */
function _sanitizeMeses(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Texto opcional: apara espaços; vazio vira null (coluna nullable). */
function _txt(v) {
  const s = (v == null ? '' : String(v)).trim();
  return s || null;
}

/**
 * Confere que o colaborador existe. Lança Error com statusCode 404 caso não.
 * @param {string} recursoId
 * @returns {Promise<object>}
 */
async function _assertRecurso(recursoId) {
  const recurso = await repos.recursos.findById(recursoId);
  if (!recurso) {
    const err = new Error('Colaborador não encontrado');
    err.statusCode = 404;
    throw err;
  }
  return recurso;
}

/**
 * Confere que a ficha existe e pertence ao colaborador. Lança 404 caso não.
 * @param {string} recursoId
 * @param {string} epiId
 * @returns {Promise<object>} a entrega atual (camelCase pelo repo).
 */
async function _assertEpiDoRecurso(recursoId, epiId) {
  const entrega = await repos.epiEntregas.findById(epiId);
  if (!entrega || entrega.recursoId !== recursoId) {
    const err = new Error('Ficha de EPI não encontrada para este colaborador');
    err.statusCode = 404;
    throw err;
  }
  return entrega;
}

/**
 * Monta o envelope do colaborador: entregas (cada uma com o `status` derivado)
 * e o resumo agregado.
 * @param {string} recursoId
 * @returns {Promise<{ entregas: object[], resumo: object }>}
 */
async function _envelope(recursoId) {
  const entregas = await repos.epiEntregas.findAll({ recursoId });
  const hoje = _hoje();
  return {
    entregas: entregas.map((e) => ({ ...e, status: statusEpi(e, hoje) })),
    resumo: resumo(entregas, hoje),
  };
}

/** GET /api/recursos/:id/epis — fichas de EPI do colaborador + resumo. */
async function handleListEpis(recursoId, res) {
  try {
    await _assertRecurso(recursoId);
    sendJson(res, await _envelope(recursoId));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/recursos/:id/epis — registra uma entrega de EPI. */
async function handlePostEpi(recursoId, body, res) {
  try {
    await _assertRecurso(recursoId);
    const b = body || {};
    const epi = (b.epi == null ? '' : String(b.epi)).trim();
    if (!epi) return sendError(res, 400, 'EPI é obrigatório');

    const dataEntrega = b.dataEntrega || null;
    const vidaUtilMeses = _sanitizeMeses(b.vidaUtilMeses);
    // Calcula a data de troca prevista se o cliente não mandou uma explícita.
    const trocaPrevista = b.dataTrocaPrevista || dataTrocaPrevista(dataEntrega, vidaUtilMeses) || null;
    const devolvido = !!b.devolvido;

    const data = {
      id: generateId('epi'),
      recursoId,
      epi,
      ca: _txt(b.ca),
      quantidade: _sanitizeQtd(b.quantidade),
      dataEntrega,
      vidaUtilMeses,
      dataTrocaPrevista: trocaPrevista,
      devolvido,
      // Devolver carimba a data (usa a informada, ou hoje). Não devolvido → sem data.
      dataDevolucao: devolvido ? (b.dataDevolucao || _hoje()) : null,
      observacoes: _txt(b.observacoes),
    };
    await repos.epiEntregas.create(data);
    sendJson(res, await _envelope(recursoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/recursos/:id/epis/:epiId — atualiza os campos presentes (whitelist). */
async function handlePutEpi(recursoId, epiId, body, res) {
  try {
    const atual = await _assertEpiDoRecurso(recursoId, epiId);
    const b = body || {};
    const patch = { updatedAt: new Date().toISOString() };

    if (b.epi !== undefined) {
      const epi = (b.epi == null ? '' : String(b.epi)).trim();
      if (!epi) return sendError(res, 400, 'EPI é obrigatório');
      patch.epi = epi;
    }
    if (b.ca !== undefined) patch.ca = _txt(b.ca);
    if (b.quantidade !== undefined) patch.quantidade = _sanitizeQtd(b.quantidade);
    if (b.observacoes !== undefined) patch.observacoes = _txt(b.observacoes);

    // Base do cálculo da troca: usa o novo valor quando enviado, senão o atual.
    const novaEntrega = b.dataEntrega !== undefined ? (b.dataEntrega || null) : atual.dataEntrega;
    const novaVida = b.vidaUtilMeses !== undefined ? _sanitizeMeses(b.vidaUtilMeses) : atual.vidaUtilMeses;
    if (b.dataEntrega !== undefined) patch.dataEntrega = novaEntrega;
    if (b.vidaUtilMeses !== undefined) patch.vidaUtilMeses = novaVida;
    if (b.dataTrocaPrevista !== undefined) {
      // Troca prevista informada explicitamente ganha (vazio limpa).
      patch.dataTrocaPrevista = b.dataTrocaPrevista || null;
    } else if (b.dataEntrega !== undefined || b.vidaUtilMeses !== undefined) {
      // Mudou a base e não veio troca manual → recalcula.
      patch.dataTrocaPrevista = dataTrocaPrevista(novaEntrega, novaVida);
    }

    // Devolução liga/desliga carimba (ou limpa) a data de devolução.
    if (b.devolvido !== undefined) {
      patch.devolvido = !!b.devolvido;
      patch.dataDevolucao = patch.devolvido
        ? (b.dataDevolucao || atual.dataDevolucao || _hoje())
        : null;
    } else if (b.dataDevolucao !== undefined) {
      patch.dataDevolucao = b.dataDevolucao || null;
    }

    await repos.epiEntregas.updateById(epiId, patch);
    sendJson(res, await _envelope(recursoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/recursos/:id/epis/:epiId — remove a ficha de EPI. */
async function handleDeleteEpi(recursoId, epiId, res) {
  try {
    await _assertEpiDoRecurso(recursoId, epiId);
    await repos.epiEntregas.removeById(epiId);
    sendJson(res, await _envelope(recursoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = { handleListEpis, handlePostEpi, handlePutEpi, handleDeleteEpi };
