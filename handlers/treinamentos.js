'use strict';
/**
 * @file Matriz de treinamentos NR por colaborador (feature 8) — CRUD dos
 * treinamentos normativos (NR-10, NR-35, integração, …) de um recurso.
 *
 * Toda a REGRA vive em lib/treinamento.js (status de validade, bloqueio de
 * alocação, resumo). Aqui só se orquestra HTTP + persistência: valida que o
 * recurso existe, calcula a data de validade quando não vier informada
 * (data_realizacao + validade_meses) e devolve sempre o ENVELOPE
 * `{ treinamentos }` com o `statusValidade` de cada item já calculado — o
 * front re-renderiza a matriz inteira a cada mutação (mesmo padrão do punch).
 *
 * Validação é INLINE (não usa lib/validate): os campos são poucos e simples.
 */
const repos = require('../db/repos');
const { statusValidade } = require('../lib/treinamento');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

/** Dia corrente em YYYY-MM-DD. */
function _hoje() {
  return new Date().toISOString().slice(0, 10);
}

/** Aceita só uma data YYYY-MM-DD; qualquer outra coisa vira null. */
function _asDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Inteiro >= 0; usa `def` quando ausente/vazio/ inválido. */
function _asInt(v, def) {
  if (v === undefined || v === null || v === '') return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

/** String enxuta (trim) ou ''. */
function _asStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * data_validade derivada: data_realizacao + `meses`. Retorna null se a data-base
 * for inválida ou `meses` não for positivo (treinamento sem controle de prazo).
 * Usa UTC para não depender do fuso do servidor.
 * @param {string|null} dataISO  YYYY-MM-DD
 * @param {number} meses
 * @returns {string|null} YYYY-MM-DD
 */
function _addMeses(dataISO, meses) {
  if (!_asDate(dataISO)) return null;
  const m = Number(meses);
  if (!Number.isFinite(m) || m <= 0) return null;
  const [y, mo, d] = dataISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + m);
  return dt.toISOString().slice(0, 10);
}

/** Confere que o recurso existe; lança Error com statusCode 404 caso não. */
async function _assertRecurso(recursoId) {
  const rec = await repos.recursos.findById(recursoId);
  if (!rec) {
    const err = new Error('Recurso não encontrado');
    err.statusCode = 404;
    throw err;
  }
  return rec;
}

/** Confere que o treinamento existe E pertence ao recurso; 404 caso não. */
async function _assertTreinamentoDoRecurso(recursoId, trId) {
  const t = await repos.treinamentos.findById(trId);
  if (!t || t.recursoId !== recursoId) {
    const err = new Error('Treinamento não encontrado para este colaborador');
    err.statusCode = 404;
    throw err;
  }
  return t;
}

/** Envelope da matriz: cada treinamento com o `statusValidade` do dia. */
async function _envelope(recursoId) {
  const lista = await repos.treinamentos.findAll({ recursoId });
  const hoje = _hoje();
  return {
    treinamentos: lista.map((t) => ({ ...t, statusValidade: statusValidade(t.dataValidade, hoje) })),
  };
}

/** GET /api/recursos/:id/treinamentos — matriz do colaborador. */
async function handleListTreinamentos(recursoId, res) {
  try {
    await _assertRecurso(recursoId);
    sendJson(res, await _envelope(recursoId));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/recursos/:id/treinamentos — cria um treinamento. */
async function handlePostTreinamento(recursoId, body, res) {
  try {
    await _assertRecurso(recursoId);
    const nr = _asStr(body.nr);
    if (!nr) return sendError(res, 400, 'NR é obrigatória');

    if (body.dataRealizacao && !_asDate(body.dataRealizacao)) {
      return sendError(res, 400, 'dataRealizacao inválida (use YYYY-MM-DD)');
    }
    if (body.dataValidade && !_asDate(body.dataValidade)) {
      return sendError(res, 400, 'dataValidade inválida (use YYYY-MM-DD)');
    }

    const dataRealizacao = _asDate(body.dataRealizacao);
    const validadeMeses = _asInt(body.validadeMeses, 12);
    // data_validade explícita vence; senão deriva de realização + meses.
    let dataValidade = _asDate(body.dataValidade);
    if (!dataValidade) dataValidade = _addMeses(dataRealizacao, validadeMeses);

    const data = {
      id: generateId('trn'),
      recursoId,
      nr,
      descricao: _asStr(body.descricao),
      dataRealizacao,
      validadeMeses,
      dataValidade,
      instituicao: _asStr(body.instituicao),
      certificadoUrl: _asStr(body.certificadoUrl),
    };
    await repos.treinamentos.create(data);
    sendJson(res, await _envelope(recursoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/recursos/:id/treinamentos/:trId — atualiza os campos presentes. */
async function handlePutTreinamento(recursoId, trId, body, res) {
  try {
    const atual = await _assertTreinamentoDoRecurso(recursoId, trId);
    const patch = {};

    if (body.nr !== undefined) {
      const nr = _asStr(body.nr);
      if (!nr) return sendError(res, 400, 'NR não pode ser vazia');
      patch.nr = nr;
    }
    if (body.descricao !== undefined) patch.descricao = _asStr(body.descricao);
    if (body.instituicao !== undefined) patch.instituicao = _asStr(body.instituicao);
    if (body.certificadoUrl !== undefined) patch.certificadoUrl = _asStr(body.certificadoUrl);

    if (body.dataRealizacao !== undefined) {
      if (!body.dataRealizacao) patch.dataRealizacao = null;
      else {
        const d = _asDate(body.dataRealizacao);
        if (!d) return sendError(res, 400, 'dataRealizacao inválida (use YYYY-MM-DD)');
        patch.dataRealizacao = d;
      }
    }
    if (body.validadeMeses !== undefined) {
      patch.validadeMeses = _asInt(body.validadeMeses, atual.validadeMeses ?? 12);
    }

    // data_validade: explícita vence; senão recalcula quando realização/meses
    // mudaram (mantém a matriz coerente sem obrigar o cliente a recalcular).
    if (body.dataValidade !== undefined) {
      if (!body.dataValidade) patch.dataValidade = null;
      else {
        const d = _asDate(body.dataValidade);
        if (!d) return sendError(res, 400, 'dataValidade inválida (use YYYY-MM-DD)');
        patch.dataValidade = d;
      }
    } else if (patch.dataRealizacao !== undefined || patch.validadeMeses !== undefined) {
      const dr = patch.dataRealizacao !== undefined ? patch.dataRealizacao : atual.dataRealizacao;
      const vm = patch.validadeMeses !== undefined ? patch.validadeMeses : atual.validadeMeses;
      const derived = _addMeses(dr, vm);
      if (derived) patch.dataValidade = derived;
    }

    await repos.treinamentos.updateById(trId, patch);
    sendJson(res, await _envelope(recursoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/recursos/:id/treinamentos/:trId — remove o treinamento. */
async function handleDeleteTreinamento(recursoId, trId, res) {
  try {
    await _assertTreinamentoDoRecurso(recursoId, trId);
    await repos.treinamentos.removeById(trId);
    sendJson(res, await _envelope(recursoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = {
  handleListTreinamentos,
  handlePostTreinamento,
  handlePutTreinamento,
  handleDeleteTreinamento,
};
