'use strict';
/**
 * @file Ponto / banco de horas por colaborador (item 6) — CRUD das marcações
 * diárias de jornada de um recurso.
 *
 * Cada ponto é uma marcação (data, entrada, saída, intervalo) de um colaborador.
 * A REGRA de cálculo vive em lib/ponto.js (horas trabalhadas com virada de
 * madrugada e desconto de intervalo, saldo do dia, banco de horas, resumo do
 * período) — aqui só se orquestra HTTP + persistência.
 *
 * Envelope { pontos, resumo }: como no punch/contratos, toda mutação devolve a
 * folha de ponto inteira do colaborador já com o resumo agregado, para o front
 * não precisar reconciliar patch parcial.
 *
 * Validação é INLINE (não usa lib/validate): colaborador existe, data
 * obrigatória. `horasTrabalhadas` é DERIVADA no servidor sempre que entrada E
 * saída vierem — o cliente nunca dita as horas.
 */
const repos = require('../db/repos');
const { calcHorasTrabalhadas, resumo, JORNADA_PADRAO } = require('../lib/ponto');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

/** Competência no formato YYYY-MM (mês da folha de ponto). */
const _COMPETENCIA_RE = /^\d{4}-\d{2}$/;

/**
 * Confere que o ponto existe e pertence ao recurso. Lança Error com
 * `statusCode = 404` caso contrário (molde de _assertItemDoContrato do punch).
 * @param {string} recursoId
 * @param {string} pontoId
 * @returns {Promise<object>} o ponto atual (já em camelCase pelo repo).
 */
async function _assertPontoDoRecurso(recursoId, pontoId) {
  const ponto = await repos.pontos.findById(pontoId);
  if (!ponto || ponto.recursoId !== recursoId) {
    const err = new Error('Registro de ponto não encontrado para este colaborador');
    err.statusCode = 404;
    throw err;
  }
  return ponto;
}

/**
 * Monta o envelope: pontos do colaborador (opcionalmente só da competência
 * YYYY-MM) + resumo agregado (dias, horas trabalhadas, saldo do banco de horas).
 * @param {string} recursoId
 * @param {string} [competencia]  YYYY-MM; ignorada se não bater no formato.
 * @returns {Promise<{ pontos: object[], resumo: object }>}
 */
async function _envelope(recursoId, competencia) {
  let pontos = await repos.pontos.findAll({ recursoId });
  if (competencia && _COMPETENCIA_RE.test(competencia)) {
    pontos = pontos.filter((p) => String(p.data || '').slice(0, 7) === competencia);
  }
  return { pontos, resumo: resumo(pontos) };
}

/**
 * Deriva os campos calculados de um corpo de ponto. Só recalcula
 * `horasTrabalhadas` quando entrada E saída vêm (com virada de madrugada e
 * desconto do intervalo); senão respeita o valor informado (ou 0).
 * @param {object} body
 * @returns {{entrada:string|null, saida:string|null, intervaloMin:number, jornadaPrevista:number, horasTrabalhadas:number}}
 */
function _camposCalculados(body) {
  const entrada = body.entrada || null;
  const saida = body.saida || null;
  const intervaloMin = parseInt(body.intervaloMin, 10) || 0;
  const jornadaPrevista =
    body.jornadaPrevista === undefined || body.jornadaPrevista === null || body.jornadaPrevista === ''
      ? JORNADA_PADRAO
      : (Number(body.jornadaPrevista) || 0);
  const horasTrabalhadas =
    entrada && saida
      ? calcHorasTrabalhadas(entrada, saida, intervaloMin)
      : (Number(body.horasTrabalhadas) || 0);
  return { entrada, saida, intervaloMin, jornadaPrevista, horasTrabalhadas };
}

/** GET /api/recursos/:id/ponto — folha de ponto + resumo (filtro ?competencia). */
async function handleListPonto(recursoId, res, competencia) {
  try {
    const recurso = await repos.recursos.findById(recursoId);
    if (!recurso) return sendError(res, 404, 'Colaborador não encontrado');
    sendJson(res, await _envelope(recursoId, competencia));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/recursos/:id/ponto — cria uma marcação. */
async function handlePostPonto(recursoId, body, res) {
  try {
    const recurso = await repos.recursos.findById(recursoId);
    if (!recurso) return sendError(res, 404, 'Colaborador não encontrado');
    if (!body || !body.data) return sendError(res, 400, 'Data é obrigatória');
    const calc = _camposCalculados(body);
    const agora = new Date().toISOString();
    const registro = {
      id: generateId('pnt'),
      recursoId,
      data: body.data,
      entrada: calc.entrada,
      saida: calc.saida,
      intervaloMin: calc.intervaloMin,
      horasTrabalhadas: calc.horasTrabalhadas,
      jornadaPrevista: calc.jornadaPrevista,
      observacoes: body.observacoes || '',
      createdAt: agora,
      updatedAt: agora,
    };
    await repos.pontos.create(registro);
    sendJson(res, await _envelope(recursoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/recursos/:id/ponto/:pontoId — atualiza os campos presentes. */
async function handlePutPonto(recursoId, pontoId, body, res) {
  try {
    const atual = await _assertPontoDoRecurso(recursoId, pontoId);
    const patch = { updatedAt: new Date().toISOString() };
    if (body.data !== undefined) {
      if (!body.data) return sendError(res, 400, 'Data é obrigatória');
      patch.data = body.data;
    }
    if (body.observacoes !== undefined) patch.observacoes = body.observacoes || '';

    // Se algum campo que afeta o cálculo veio, recalcula as horas sobre o estado
    // resultante (atual + patch), para nunca gravar horas dessincronizadas de
    // entrada/saída/intervalo.
    const mexeuCalculo = ['entrada', 'saida', 'intervaloMin', 'jornadaPrevista', 'horasTrabalhadas']
      .some((k) => body[k] !== undefined);
    if (mexeuCalculo) {
      const merged = {
        entrada: body.entrada !== undefined ? (body.entrada || null) : atual.entrada,
        saida: body.saida !== undefined ? (body.saida || null) : atual.saida,
        intervaloMin: body.intervaloMin !== undefined ? body.intervaloMin : atual.intervaloMin,
        jornadaPrevista: body.jornadaPrevista !== undefined ? body.jornadaPrevista : atual.jornadaPrevista,
        horasTrabalhadas: body.horasTrabalhadas !== undefined ? body.horasTrabalhadas : atual.horasTrabalhadas,
      };
      const calc = _camposCalculados(merged);
      patch.entrada = calc.entrada;
      patch.saida = calc.saida;
      patch.intervaloMin = calc.intervaloMin;
      patch.jornadaPrevista = calc.jornadaPrevista;
      patch.horasTrabalhadas = calc.horasTrabalhadas;
    }
    await repos.pontos.updateById(pontoId, patch);
    sendJson(res, await _envelope(recursoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/recursos/:id/ponto/:pontoId — remove a marcação. */
async function handleDeletePonto(recursoId, pontoId, res) {
  try {
    await _assertPontoDoRecurso(recursoId, pontoId);
    await repos.pontos.removeById(pontoId);
    sendJson(res, await _envelope(recursoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = { handleListPonto, handlePostPonto, handlePutPonto, handleDeletePonto };
