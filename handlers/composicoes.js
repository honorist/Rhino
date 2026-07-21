'use strict';
/**
 * @file Composições de custo unitário (Feature 4) — CRUD do catálogo GLOBAL
 * (não por obra) que alimenta o orçamento de propostas. A REGRA (custo unitário,
 * normalização de insumos, resumo por tipo) vive em lib/composicao.js; aqui só se
 * orquestra HTTP + persistência. Validação inline (descricao obrigatória) — não
 * usa lib/validate.
 *
 * Toda resposta de mutação devolve a composição já com o `custoUnitario` e o
 * `resumo` (por tipo) calculados, para o front não recalcular. `itens` é JSONB:
 * gravado com JSON.stringify (o pg serializaria um array JS como array PG, não
 * JSONB, se não viesse string) e lido já parseado como array.
 */
const repos = require('../db/repos');
const { custoUnitario, resumoPorTipo, normalizaItens } = require('../lib/composicao');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

/**
 * `itens` como array, seja qual for a origem: array já parseado (leitura real do
 * pg) ou string JSON (eco do INSERT nos testes com repo dublado).
 * @param {unknown} v
 * @returns {Array<object>}
 */
function _parseItens(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Anexa custoUnitario + resumo a uma composição lida/gravada. */
function _withCusto(c) {
  const itens = _parseItens(c.itens);
  return { ...c, custoUnitario: custoUnitario(itens), resumo: resumoPorTipo(itens) };
}

/** GET /api/composicoes — catálogo completo, cada item com custo calculado. */
async function handleListComposicoes(res) {
  try {
    const lista = await repos.composicoes.findAll();
    sendJson(res, lista.map(_withCusto));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/composicoes — cria uma composição. `descricao` é obrigatória. */
async function handlePostComposicao(body, res) {
  try {
    const descricao = (body.descricao || '').trim();
    if (!descricao) return sendError(res, 400, 'Descrição é obrigatória');
    const agora = new Date().toISOString();
    const data = {
      id: generateId('comp'),
      codigo: (body.codigo || '').trim() || null,
      descricao,
      unidade: (body.unidade || '').trim() || 'un',
      itens: JSON.stringify(normalizaItens(body.itens)),
      ativo: body.ativo === undefined ? true : !!body.ativo,
      createdAt: agora,
      updatedAt: agora,
    };
    const criado = await repos.composicoes.create(data);
    sendJson(res, _withCusto(criado));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/composicoes/:id — atualiza só os campos presentes. */
async function handlePutComposicao(id, body, res) {
  try {
    const atual = await repos.composicoes.findById(id);
    if (!atual) return sendError(res, 404, 'Composição não encontrada');
    const patch = { updatedAt: new Date().toISOString() };
    if (body.codigo !== undefined) patch.codigo = (body.codigo || '').trim() || null;
    if (body.descricao !== undefined) {
      const d = (body.descricao || '').trim();
      if (!d) return sendError(res, 400, 'Descrição é obrigatória');
      patch.descricao = d;
    }
    if (body.unidade !== undefined) patch.unidade = (body.unidade || '').trim() || 'un';
    if (body.itens !== undefined) patch.itens = JSON.stringify(normalizaItens(body.itens));
    if (body.ativo !== undefined) patch.ativo = !!body.ativo;
    const atualizado = await repos.composicoes.updateById(id, patch);
    sendJson(res, _withCusto(atualizado));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/composicoes/:id — remove a composição do catálogo. */
async function handleDeleteComposicao(id, res) {
  try {
    const atual = await repos.composicoes.findById(id);
    if (!atual) return sendError(res, 404, 'Composição não encontrada');
    await repos.composicoes.removeById(id);
    sendJson(res, { ok: true, id });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = {
  handleListComposicoes,
  handlePostComposicao,
  handlePutComposicao,
  handleDeleteComposicao,
};
