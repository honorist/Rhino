'use strict';
/**
 * @file Punch list / Qualidade — regras puras, sem I/O, testáveis com node:test
 * (test/punch.test.js). Um item de punch é uma pendência técnica / RNC / item de
 * inspeção por obra, com fluxo de 4 estados e prazo.
 *
 * Fluxo de status: aberto → em_andamento → resolvido → verificado. Quem executa
 * marca 'resolvido'; a qualidade confere e marca 'verificado'.
 *
 * Regras (definidas com o usuário em 2026-07-21):
 *  - BR-PUNCH-001: os carimbos de tempo derivam do status — 'resolvido' fixa
 *    resolvido_em; 'verificado' fixa verificado_em (e resolvido_em, se ainda
 *    nulo). Voltar para um status anterior limpa os carimbos posteriores (não
 *    fica "resolvido" fantasma num item reaberto).
 *  - BR-PUNCH-002: um item está VENCIDO quando tem prazo no passado e ainda não
 *    foi resolvido nem verificado.
 *  - BR-PUNCH-003: o resumo da obra conta total, por status, abertos (tudo que
 *    não está verificado), vencidos e a vencer em 7 dias.
 */

/** Estados na ordem do fluxo. */
const STATUS = ['aberto', 'em_andamento', 'resolvido', 'verificado'];
/** Tipos de item (o roadmap pede pendência, RNC e inspeção numa entidade só). */
const TIPOS = ['pendencia', 'rnc', 'inspecao'];
/** Severidades (mesmo vocabulário das ocorrências). */
const SEVERIDADES = ['baixa', 'media', 'alta', 'critica'];

const _STATUS_SET = new Set(STATUS);
/** Estados que consideram o item "encerrado" para efeito de vencimento. */
const _CONCLUIDOS = new Set(['resolvido', 'verificado']);

/** Normaliza um status desconhecido para 'aberto'. */
function normalizarStatus(s) {
  return _STATUS_SET.has(s) ? s : 'aberto';
}

/**
 * Carimbos de tempo derivados do status (BR-PUNCH-001). Passe o `agoraISO` (o
 * "agora" é injetado — a função é pura) e o item atual (para preservar um
 * resolvido_em já existente ao avançar para verificado).
 *
 * @param {string} novoStatus
 * @param {string} agoraISO       ex.: new Date().toISOString()
 * @param {{resolvidoEm?:string|null}} [atual]
 * @returns {{ resolvidoEm: string|null, verificadoEm: string|null }}
 */
function carimboStatus(novoStatus, agoraISO, atual = {}) {
  const st = normalizarStatus(novoStatus);
  if (st === 'verificado') {
    return { resolvidoEm: atual.resolvidoEm || agoraISO, verificadoEm: agoraISO };
  }
  if (st === 'resolvido') {
    return { resolvidoEm: atual.resolvidoEm || agoraISO, verificadoEm: null };
  }
  // aberto / em_andamento: reaberto — limpa os carimbos posteriores.
  return { resolvidoEm: null, verificadoEm: null };
}

/** Data (YYYY-MM-DD) de um ISO/date string, para comparar por dia. */
function _diaDe(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

/**
 * Item vencido: tem prazo no passado e não está resolvido/verificado (BR-PUNCH-002).
 * @param {{prazo?:string|null, status?:string}} item
 * @param {string} hojeISO  ex.: '2026-07-21' ou ISO completo
 */
function isVencido(item, hojeISO) {
  if (!item || !item.prazo) return false;
  if (_CONCLUIDOS.has(item.status)) return false;
  return _diaDe(item.prazo) < _diaDe(hojeISO);
}

/** Dias inteiros entre dois YYYY-MM-DD (b - a); null se algum inválido. */
function _diasEntre(aISO, bISO) {
  const a = new Date(_diaDe(aISO) + 'T00:00:00Z');
  const b = new Date(_diaDe(bISO) + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Resumo da obra (BR-PUNCH-003).
 * @param {Array<object>} itens
 * @param {string} hojeISO
 * @returns {{ total:number, porStatus:Record<string,number>, abertos:number, vencidos:number, aVencer7d:number }}
 */
function resumo(itens, hojeISO) {
  const lista = Array.isArray(itens) ? itens : [];
  const porStatus = { aberto: 0, em_andamento: 0, resolvido: 0, verificado: 0 };
  let abertos = 0;
  let vencidos = 0;
  let aVencer7d = 0;
  for (const it of lista) {
    const st = normalizarStatus(it && it.status);
    porStatus[st] += 1;
    if (st !== 'verificado') abertos += 1;
    if (isVencido(it, hojeISO)) vencidos += 1;
    else if (it && it.prazo && !_CONCLUIDOS.has(st)) {
      const d = _diasEntre(hojeISO, it.prazo);
      if (d !== null && d >= 0 && d <= 7) aVencer7d += 1;
    }
  }
  return { total: lista.length, porStatus, abertos, vencidos, aVencer7d };
}

module.exports = {
  STATUS,
  TIPOS,
  SEVERIDADES,
  normalizarStatus,
  carimboStatus,
  isVencido,
  resumo,
};
