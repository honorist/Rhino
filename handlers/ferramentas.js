'use strict';
/**
 * @file Ferramentaria — cadastro de ferramentas/instrumentos + controle de
 * calibração (roadmap item 15).
 *
 * CRUD do catálogo GLOBAL de ferramentas mais o sub-recurso de calibrações de
 * cada uma. Toda a REGRA (próxima calibração, situação em_dia/vencendo/vencida,
 * resumo do parque) vive em lib/ferramenta.js — aqui só se orquestra HTTP +
 * persistência.
 *
 * Enriquecimento: cada ferramenta devolvida vem com o histórico `calibracoes`
 * (mais recente primeiro), a `ultimaCalibracao` aprovada e os campos derivados
 * `situacaoCalibracao` e `proximaCalibracao` (null quando não requer calibração)
 * — assim o front pinta o badge de conformidade sem recalcular regra no browser.
 *
 * Envelopes:
 *  - GET  /api/ferramentas                       → { ferramentas, resumo }
 *  - POST /api/ferramentas                       → { ferramenta }   (a criada, enriquecida)
 *  - PUT  /api/ferramentas/:id                   → { ferramenta }   (a atualizada)
 *  - DELETE /api/ferramentas/:id                 → { ok: true }
 *  - GET  /api/ferramentas/:id/calibracoes       → { ferramenta, calibracoes }
 *  - POST /api/ferramentas/:id/calibracoes       → { ferramenta, calibracoes }
 *  - DELETE /api/ferramentas/:id/calibracoes/:calId → { ferramenta, calibracoes }
 */
const repos = require('../db/repos');
const ferr = require('../lib/ferramenta');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

/** Data de referência (hoje) para as regras de vencimento — 'YYYY-MM-DD'. */
function _hoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Confere que a ferramenta existe. Lança Error com `statusCode = 404` caso não.
 * @param {string} ferramentaId
 * @returns {Promise<object>} a ferramenta atual (camelCase pelo repo).
 */
async function _assertFerramenta(ferramentaId) {
  const f = await repos.ferramentas.findById(ferramentaId);
  if (!f) {
    const err = new Error('Ferramenta não encontrada');
    err.statusCode = 404;
    throw err;
  }
  return f;
}

/**
 * Confere que a calibração existe e pertence à ferramenta (molde ssma).
 * @param {string} ferramentaId
 * @param {string} calId
 * @returns {Promise<object>} a calibração atual.
 */
async function _assertCalibracaoDaFerramenta(ferramentaId, calId) {
  const cal = await repos.ferramentaCalibracoes.findById(calId);
  if (!cal || cal.ferramentaId !== ferramentaId) {
    const err = new Error('Calibração não encontrada nesta ferramenta');
    err.statusCode = 404;
    throw err;
  }
  return cal;
}

/**
 * Anexa histórico e campos derivados de calibração a uma ferramenta.
 * @param {object} ferramenta
 * @param {object[]} calibracoes  Histórico (data DESC).
 * @param {string} dataRef        Referência 'YYYY-MM-DD'.
 * @returns {object}
 */
function _enrich(ferramenta, calibracoes, dataRef) {
  const cals = Array.isArray(calibracoes) ? calibracoes : [];
  const ultima = ferr.ultimaCalibracao(cals);
  const requer = !!ferramenta.requerCalibracao;
  return {
    ...ferramenta,
    calibracoes: cals,
    ultimaCalibracao: ultima || null,
    situacaoCalibracao: requer ? ferr.situacaoCalibracao(ultima ? ultima.validade : null, dataRef) : null,
    proximaCalibracao: requer && ultima && ultima.data
      ? ferr.proximaCalibracao(ultima.data, ferramenta.periodicidadeMeses)
      : null,
  };
}

/** Busca as calibrações de UMA ferramenta (data DESC). */
async function _calibracoesDe(ferramentaId) {
  return repos.ferramentaCalibracoes.findAll({ ferramentaId });
}

/**
 * Envelope de UMA ferramenta enriquecida + suas calibrações (para o detalhe e
 * as mutações de calibração).
 * @param {string} ferramentaId
 * @returns {Promise<{ ferramenta: object, calibracoes: object[] }>}
 */
async function _envelopeFerramenta(ferramentaId) {
  const ferramenta = await repos.ferramentas.findById(ferramentaId);
  const calibracoes = await _calibracoesDe(ferramentaId);
  return { ferramenta: _enrich(ferramenta, calibracoes, _hoje()), calibracoes };
}

/** GET /api/ferramentas — lista enriquecida + resumo do parque. */
async function handleListFerramentas(res) {
  try {
    const dataRef = _hoje();
    const ferramentas = await repos.ferramentas.findAll();
    const todasCals = await repos.ferramentaCalibracoes.findAll();
    const porFerramenta = {};
    for (const c of todasCals) {
      (porFerramenta[c.ferramentaId] || (porFerramenta[c.ferramentaId] = [])).push(c);
    }
    const enriquecidas = ferramentas.map((f) => _enrich(f, porFerramenta[f.id] || [], dataRef));
    sendJson(res, {
      ferramentas: enriquecidas,
      resumo: ferr.resumo(ferramentas, porFerramenta, dataRef),
    });
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/ferramentas — cria uma ferramenta no catálogo. */
async function handlePostFerramenta(body, res) {
  try {
    if (!body || !body.nome || !String(body.nome).trim()) {
      return sendError(res, 400, 'Nome é obrigatório');
    }
    const agora = new Date().toISOString();
    const periodicidade = parseInt(body.periodicidadeMeses, 10);
    const ferramenta = {
      id: generateId('ferr'),
      nome: String(body.nome).trim(),
      codigo: body.codigo || '',
      tipo: body.tipo || '',
      requerCalibracao: !!body.requerCalibracao,
      periodicidadeMeses: Number.isFinite(periodicidade) && periodicidade > 0 ? periodicidade : 12,
      localizacao: body.localizacao || '',
      responsavelId: body.responsavelId || null,
      status: ferr.normalizarStatus(body.status),
      createdAt: agora,
      updatedAt: agora,
    };
    await repos.ferramentas.create(ferramenta);
    sendJson(res, { ferramenta: _enrich(ferramenta, [], _hoje()) });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/ferramentas/:id — atualiza os campos presentes. */
async function handlePutFerramenta(ferramentaId, body, res) {
  try {
    await _assertFerramenta(ferramentaId);
    const allowed = { updatedAt: new Date().toISOString() };
    if (body.nome !== undefined) {
      const nome = String(body.nome).trim();
      if (!nome) return sendError(res, 400, 'Nome é obrigatório');
      allowed.nome = nome;
    }
    if (body.codigo !== undefined) allowed.codigo = body.codigo || '';
    if (body.tipo !== undefined) allowed.tipo = body.tipo || '';
    if (body.requerCalibracao !== undefined) allowed.requerCalibracao = !!body.requerCalibracao;
    if (body.periodicidadeMeses !== undefined) {
      const n = parseInt(body.periodicidadeMeses, 10);
      allowed.periodicidadeMeses = Number.isFinite(n) && n > 0 ? n : 12;
    }
    if (body.localizacao !== undefined) allowed.localizacao = body.localizacao || '';
    if (body.responsavelId !== undefined) allowed.responsavelId = body.responsavelId || null;
    if (body.status !== undefined) allowed.status = ferr.normalizarStatus(body.status);
    await repos.ferramentas.updateById(ferramentaId, allowed);
    const calibracoes = await _calibracoesDe(ferramentaId);
    const atual = await repos.ferramentas.findById(ferramentaId);
    sendJson(res, { ferramenta: _enrich(atual, calibracoes, _hoje()) });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/ferramentas/:id — remove a ferramenta (e suas calibrações). */
async function handleDeleteFerramenta(ferramentaId, res) {
  try {
    await _assertFerramenta(ferramentaId);
    await repos.ferramentas.removeById(ferramentaId);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** GET /api/ferramentas/:id/calibracoes — histórico + ferramenta enriquecida. */
async function handleListCalibracoes(ferramentaId, res) {
  try {
    await _assertFerramenta(ferramentaId);
    sendJson(res, await _envelopeFerramenta(ferramentaId));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/ferramentas/:id/calibracoes — registra uma calibração. */
async function handlePostCalibracao(ferramentaId, body, res) {
  try {
    await _assertFerramenta(ferramentaId);
    const agora = new Date().toISOString();
    const calibracao = {
      id: generateId('cal'),
      ferramentaId,
      data: body.data || _hoje(),
      validade: body.validade || null,
      certificado: body.certificado || '',
      resultado: ferr.normalizarResultado(body.resultado),
      observacoes: body.observacoes || '',
      createdAt: agora,
      updatedAt: agora,
    };
    await repos.ferramentaCalibracoes.create(calibracao);
    sendJson(res, await _envelopeFerramenta(ferramentaId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/ferramentas/:id/calibracoes/:calId — remove uma calibração. */
async function handleDeleteCalibracao(ferramentaId, calId, res) {
  try {
    await _assertCalibracaoDaFerramenta(ferramentaId, calId);
    await repos.ferramentaCalibracoes.removeById(calId);
    sendJson(res, await _envelopeFerramenta(ferramentaId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = {
  handleListFerramentas,
  handlePostFerramenta,
  handlePutFerramenta,
  handleDeleteFerramenta,
  handleListCalibracoes,
  handlePostCalibracao,
  handleDeleteCalibracao,
};
