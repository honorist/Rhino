'use strict';
/**
 * @file Punch list / Qualidade (item 11) — CRUD dos itens de qualidade por obra.
 *
 * Um item de punch é uma pendência técnica / RNC / item de inspeção de um
 * contrato, com fluxo de 4 estados (aberto → em_andamento → resolvido →
 * verificado), responsável e prazo. Toda a REGRA vive em lib/punch.js (carimbos
 * de tempo derivados do status, vencimento, resumo da obra) — aqui só se
 * orquestra HTTP + persistência + notificação in-app.
 *
 * Por que todo handler devolve o mesmo ENVELOPE ({ itens, resumo }): o front
 * re-renderiza a lista inteira da obra a cada mutação (mesmo padrão do
 * envelope de contratos). Assim o cliente nunca precisa reconciliar patch
 * parcial — ele recebe a verdade completa (itens com o flag `vencido` já
 * calculado e o resumo agregado) numa única resposta.
 *
 * Nota: este handler não importa `db` — não faz SQL direto; a foto (BYTEA +
 * JSONB) mora em handlers/punch-fotos.js, que é quem usa transação.
 */
const repos = require('../db/repos');
const { carimboStatus, isVencido, resumo } = require('../lib/punch');
const { validateBody, schemas } = require('../lib/validate');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

/**
 * Confere que o item existe e pertence ao contrato. Lança Error com
 * `statusCode = 404` caso contrário (mesmo molde de _assertRdoDoContrato).
 * @param {string} contractId
 * @param {string} itemId
 * @returns {Promise<object>} o item atual (já em camelCase pelo repo).
 */
async function _assertItemDoContrato(contractId, itemId) {
  const item = await repos.punchItens.findById(itemId);
  if (!item || item.contractId !== contractId) {
    const err = new Error('Item de qualidade não encontrado neste contrato');
    err.statusCode = 404;
    throw err;
  }
  return item;
}

/**
 * Monta o envelope da obra: a lista de itens (cada um com o flag `vencido`
 * derivado do prazo × hoje) e o resumo agregado (total, por status, abertos,
 * vencidos, a vencer em 7 dias). `hoje` é o dia corrente em YYYY-MM-DD.
 * @param {string} contractId
 * @returns {Promise<{ itens: object[], resumo: object }>}
 */
async function _envelope(contractId) {
  const itens = await repos.punchItens.findAll({ contractId });
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    itens: itens.map((it) => ({ ...it, vencido: isVencido(it, hoje) })),
    resumo: resumo(itens, hoje),
  };
}

/**
 * Notifica in-app o responsável por um item (fire-and-forget): falha em
 * notificar NUNCA bloqueia o fluxo principal — só loga. Molde: notificarRh de
 * handlers/recrutamento.js.
 * @param {string|null|undefined} responsavelId
 * @param {object} item     item já persistido (usa titulo/prazo).
 * @param {string} contractId
 * @param {'atribuido'|'atualizado'} acao
 */
async function notificarResponsavel(responsavelId, item, contractId, acao) {
  if (!responsavelId) return;
  try {
    await repos.notificacoes.create({
      id: generateId('not'),
      destinatario: responsavelId,
      tipo: 'punch.' + acao,
      titulo: 'Qualidade: ' + item.titulo,
      mensagem:
        'Item de qualidade ' +
        (acao === 'atribuido' ? 'atribuído a você' : 'atualizado') +
        (item.prazo ? ' — prazo ' + item.prazo : ''),
      link: '#/contratos/' + contractId,
    });
  } catch (e) {
    // Notificar é acessório — não pode derrubar o CRUD.
    console.warn('[punch] notificarResponsavel falhou:', e && e.message ? e.message : e);
  }
}

/** GET /api/contracts/:id/punch — lista + resumo dos itens de qualidade da obra. */
async function handleListPunch(contractId, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    sendJson(res, await _envelope(contractId));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/contracts/:id/punch — cria um item de qualidade. */
async function handlePostPunch(contractId, body, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const out = validateBody(schemas.punchPost, body);
    const agora = new Date().toISOString();
    // Carimbos derivam do status inicial (BR-PUNCH-001): 'aberto' → ambos null.
    const carimbo = carimboStatus(out.status, agora);
    const data = {
      id: generateId('punch'),
      contractId,
      ...out,
      resolvidoEm: carimbo.resolvidoEm,
      verificadoEm: carimbo.verificadoEm,
      fotos: JSON.stringify([]),
    };
    const criado = await repos.punchItens.create(data);
    await notificarResponsavel(out.responsavelId, criado, contractId, 'atribuido');
    sendJson(res, await _envelope(contractId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/contracts/:id/punch/:itemId — atualiza os campos presentes. */
async function handlePutPunch(contractId, itemId, body, res) {
  try {
    const atual = await _assertItemDoContrato(contractId, itemId);
    const out = validateBody(schemas.punchPut, body);
    // Mudança de status recarimba resolvido_em/verificado_em (BR-PUNCH-001),
    // preservando um resolvido_em já existente ao avançar para verificado.
    if (out.status !== undefined) {
      const c = carimboStatus(out.status, new Date().toISOString(), { resolvidoEm: atual.resolvidoEm });
      out.resolvidoEm = c.resolvidoEm;
      out.verificadoEm = c.verificadoEm;
    }
    await repos.punchItens.updateById(itemId, out);
    // Notifica só se a atribuição realmente mudou para um novo responsável.
    if (out.responsavelId !== undefined && out.responsavelId && out.responsavelId !== atual.responsavelId) {
      await notificarResponsavel(out.responsavelId, { ...atual, ...out }, contractId, 'atribuido');
    }
    sendJson(res, await _envelope(contractId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/contracts/:id/punch/:itemId — remove o item (fotos caem por CASCADE). */
async function handleDeletePunch(contractId, itemId, res) {
  try {
    await _assertItemDoContrato(contractId, itemId);
    await repos.punchItens.removeById(itemId);
    sendJson(res, await _envelope(contractId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = { handleListPunch, handlePostPunch, handlePutPunch, handleDeletePunch };
