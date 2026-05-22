'use strict';
/**
 * @file Máquina de estados do fluxo de Solicitação de Compra.
 *
 * Regra de negócio crítica — extraída dos handlers de server.js
 * (handleAvaliar/Aprovar/Comprar/Receber/Rejeitar/CancelarSolicitacao) para
 * ter uma única fonte da verdade, testável.
 *
 * Fluxo feliz (5 etapas):
 *   pendente_avaliacao → pendente_aprovacao → aprovada → comprada → recebida
 *
 * Saídas:
 *   rejeitar  — a partir de pendente_aprovacao
 *   cancelar  — a partir de qualquer status, EXCETO aprovada e cancelada
 */

// Etapas do fluxo feliz, em ordem.
const ETAPAS = ['pendente_avaliacao', 'pendente_aprovacao', 'aprovada', 'comprada', 'recebida'];

// Estados terminais — não admitem avanço no fluxo.
const TERMINAIS = ['recebida', 'rejeitada', 'cancelada'];

// Para cada ação: status(es) de origem aceitos e status resultante.
// `cancelar` é especial (de: null) — tratado por NAO_CANCELAVEL abaixo.
const TRANSICOES = {
  avaliar:  { de: ['pendente_avaliacao'], para: 'pendente_aprovacao' },
  aprovar:  { de: ['pendente_aprovacao'], para: 'aprovada' },
  rejeitar: { de: ['pendente_aprovacao'], para: 'rejeitada' },
  comprar:  { de: ['aprovada'],           para: 'comprada' },
  receber:  { de: ['comprada'],           para: 'recebida' },
  cancelar: { de: null,                   para: 'cancelada' },
};

// Cancelar é bloqueado apenas nestes status (preserva o guard original do server).
const NAO_CANCELAVEL = ['aprovada', 'cancelada'];

/**
 * É possível aplicar `acao` a uma solicitação que está em `status`?
 * @param {string} status
 * @param {string} acao  avaliar | aprovar | rejeitar | comprar | receber | cancelar
 * @returns {boolean}
 */
function podeTransicionar(status, acao) {
  const t = TRANSICOES[acao];
  if (!t) return false;
  if (acao === 'cancelar') return !NAO_CANCELAVEL.includes(status);
  return t.de.includes(status);
}

/**
 * Status resultante de aplicar `acao` em `status`, ou `null` se a transição
 * não for válida.
 * @param {string} status
 * @param {string} acao
 * @returns {string|null}
 */
function proximoStatus(status, acao) {
  return podeTransicionar(status, acao) ? TRANSICOES[acao].para : null;
}

/**
 * @param {string} status
 * @returns {boolean}  true se for um estado terminal.
 */
function isTerminal(status) {
  return TERMINAIS.includes(status);
}

module.exports = { ETAPAS, TERMINAIS, TRANSICOES, podeTransicionar, proximoStatus, isTerminal };
