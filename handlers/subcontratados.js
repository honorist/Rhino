'use strict';
/**
 * @file Subcontratados (empreiteiros) e suas medições (roadmap item 14).
 *
 * Dois níveis de CRUD:
 *  - Subcontratados: cadastro GLOBAL (não por obra). A listagem já vem enriquecida
 *    com o `resumo` (totais medido/pago/saldo) de cada empreiteiro — computado a
 *    partir de UMA leitura de todas as medições, agrupada em memória (evita N+1).
 *  - Medições: sub-recurso por subcontratado. Espelha o handler de SSMA: checagem
 *    de posse com 404 e resposta em envelope { medicoes, resumo } — o front
 *    re-renderiza o boletim inteiro a cada mutação, então toda resposta devolve a
 *    verdade completa (as medições e o resumo agregado já calculado).
 *
 * Toda a REGRA (totais, saldo, agregações, normalização de status) vive em
 * lib/subcontratado.js; aqui só se orquestra HTTP + persistência.
 */
const repos = require('../db/repos');
const sub = require('../lib/subcontratado');
const money = require('../lib/money');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

/**
 * Confere que o subcontratado existe. Lança Error com `statusCode = 404` caso
 * contrário. Retorna o cadastro (já em camelCase pelo repo).
 * @param {string} subId
 * @returns {Promise<object>}
 */
async function _assertSubcontratado(subId) {
  const s = await repos.subcontratados.findById(subId);
  if (!s) {
    const err = new Error('Subcontratado não encontrado');
    err.statusCode = 404;
    throw err;
  }
  return s;
}

/**
 * Confere que a medição existe e pertence ao subcontratado (molde de posse do
 * punch/SSMA). Lança 404 caso contrário.
 * @param {string} subId
 * @param {string} medId
 * @returns {Promise<object>} a medição atual.
 */
async function _assertMedicaoDoSubcontratado(subId, medId) {
  const m = await repos.subcontratoMedicoes.findById(medId);
  if (!m || m.subcontratadoId !== subId) {
    const err = new Error('Medição não encontrada neste subcontratado');
    err.statusCode = 404;
    throw err;
  }
  return m;
}

/**
 * Envelope do boletim de um subcontratado: a lista de medições e o resumo
 * agregado (quantidade, totais, saldo, por status, por competência).
 * @param {string} subId
 * @returns {Promise<{ medicoes: object[], resumo: object }>}
 */
async function _envelope(subId) {
  const medicoes = await repos.subcontratoMedicoes.findAll({ subcontratadoId: subId });
  return { medicoes, resumo: sub.resumo(medicoes) };
}

/** Coleta os campos gravaveis de uma medição a partir do body (usado no create). */
function _valorPercent(v, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

// ─────────────────────────── Subcontratados (CRUD) ──────────────────────────

/**
 * GET /api/subcontratados — lista o cadastro completo, cada item enriquecido com
 * o `resumo` das suas medições. Uma única leitura de medições, agrupada em memória.
 */
async function handleListSubcontratados(res) {
  try {
    const [lista, medicoes] = await Promise.all([
      repos.subcontratados.findAll(),
      repos.subcontratoMedicoes.findAll(),
    ]);
    const porSub = new Map();
    for (const m of medicoes || []) {
      const k = m.subcontratadoId;
      if (!porSub.has(k)) porSub.set(k, []);
      porSub.get(k).push(m);
    }
    sendJson(res, lista.map((s) => ({ ...s, resumo: sub.resumo(porSub.get(s.id) || []) })));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/subcontratados — cria um subcontratado. `nome` é obrigatório. */
async function handlePostSubcontratado(body, res) {
  try {
    const nome = (body && body.nome ? String(body.nome) : '').trim();
    if (!nome) return sendError(res, 400, 'Nome é obrigatório');
    const agora = new Date().toISOString();
    const data = {
      id: generateId('subc'),
      nome,
      cnpj: (body.cnpj || '').trim(),
      especialidade: (body.especialidade || '').trim(),
      contato: (body.contato || '').trim(),
      telefone: (body.telefone || '').trim(),
      status: sub.normalizarStatusCadastro(body.status),
      observacoes: (body.observacoes || '').trim(),
      createdAt: agora,
      updatedAt: agora,
    };
    const criado = await repos.subcontratados.create(data);
    sendJson(res, { ...criado, resumo: sub.resumo([]) });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/subcontratados/:id — atualiza só os campos presentes. */
async function handlePutSubcontratado(id, body, res) {
  try {
    await _assertSubcontratado(id);
    const patch = { updatedAt: new Date().toISOString() };
    if (body.nome !== undefined) {
      const n = String(body.nome).trim();
      if (!n) return sendError(res, 400, 'Nome é obrigatório');
      patch.nome = n;
    }
    if (body.cnpj !== undefined) patch.cnpj = (body.cnpj || '').trim();
    if (body.especialidade !== undefined) patch.especialidade = (body.especialidade || '').trim();
    if (body.contato !== undefined) patch.contato = (body.contato || '').trim();
    if (body.telefone !== undefined) patch.telefone = (body.telefone || '').trim();
    if (body.status !== undefined) patch.status = sub.normalizarStatusCadastro(body.status);
    if (body.observacoes !== undefined) patch.observacoes = (body.observacoes || '').trim();
    const atualizado = await repos.subcontratados.updateById(id, patch);
    const medicoes = await repos.subcontratoMedicoes.findAll({ subcontratadoId: id });
    sendJson(res, { ...atualizado, resumo: sub.resumo(medicoes) });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/subcontratados/:id — remove o subcontratado (medições caem em cascata). */
async function handleDeleteSubcontratado(id, res) {
  try {
    await _assertSubcontratado(id);
    await repos.subcontratados.removeById(id);
    sendJson(res, { ok: true, id });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// ────────────────────────── Medições (sub-recurso) ──────────────────────────

/** GET /api/subcontratados/:id/medicoes — lista + resumo das medições. */
async function handleListMedicoes(subId, res) {
  try {
    await _assertSubcontratado(subId);
    sendJson(res, await _envelope(subId));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/subcontratados/:id/medicoes — cria uma medição. `competencia` obrigatória. */
async function handlePostMedicao(subId, body, res) {
  try {
    await _assertSubcontratado(subId);
    const competencia = (body && body.competencia ? String(body.competencia) : '').trim();
    if (!competencia) return sendError(res, 400, 'Competência é obrigatória (AAAA-MM)');
    const agora = new Date().toISOString();
    const item = {
      id: generateId('scmed'),
      subcontratadoId: subId,
      contractId: body.contractId || null,
      competencia,
      descricao: (body.descricao || '').trim(),
      valor: money.parse(body.valor),
      percentual: _valorPercent(body.percentual, 0),
      status: sub.normalizarStatus(body.status),
      data: body.data || null,
      createdAt: agora,
      updatedAt: agora,
    };
    await repos.subcontratoMedicoes.create(item);
    sendJson(res, await _envelope(subId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/subcontratados/:id/medicoes/:medId — atualiza os campos presentes. */
async function handlePutMedicao(subId, medId, body, res) {
  try {
    await _assertMedicaoDoSubcontratado(subId, medId);
    const patch = { updatedAt: new Date().toISOString() };
    if (body.competencia !== undefined) {
      const c = String(body.competencia).trim();
      if (!c) return sendError(res, 400, 'Competência é obrigatória (AAAA-MM)');
      patch.competencia = c;
    }
    if (body.contractId !== undefined) patch.contractId = body.contractId || null;
    if (body.descricao !== undefined) patch.descricao = (body.descricao || '').trim();
    if (body.valor !== undefined) patch.valor = money.parse(body.valor);
    if (body.percentual !== undefined) patch.percentual = _valorPercent(body.percentual, 0);
    if (body.status !== undefined) patch.status = sub.normalizarStatus(body.status);
    if (body.data !== undefined) patch.data = body.data || null;
    await repos.subcontratoMedicoes.updateById(medId, patch);
    sendJson(res, await _envelope(subId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/subcontratados/:id/medicoes/:medId — remove a medição. */
async function handleDeleteMedicao(subId, medId, res) {
  try {
    await _assertMedicaoDoSubcontratado(subId, medId);
    await repos.subcontratoMedicoes.removeById(medId);
    sendJson(res, await _envelope(subId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = {
  handleListSubcontratados,
  handlePostSubcontratado,
  handlePutSubcontratado,
  handleDeleteSubcontratado,
  handleListMedicoes,
  handlePostMedicao,
  handlePutMedicao,
  handleDeleteMedicao,
};
