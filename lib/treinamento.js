'use strict';
/**
 * @file Matriz de treinamentos NR por colaborador — regras puras, sem I/O,
 * testáveis com node:test (test/treinamento.test.js). Um treinamento é um curso
 * normativo (NR-10, NR-35, integração, …) de um colaborador, com data de
 * realização, validade em meses e a data de validade derivada.
 *
 * Regras (definidas com o usuário em 2026-07-21):
 *  - BR-NR-001: `statusValidade` classifica um treinamento pela sua data de
 *    validade contra hoje — 'vigente', 'vencendo' (faltam ≤ 30 dias), 'vencido'
 *    (data no passado) ou 'sem_validade' (sem data de validade cadastrada, ex.:
 *    curso sem controle de prazo).
 *  - BR-NR-002: `podeAlocar` bloqueia a alocação quando alguma NR exigida está
 *    AUSENTE ou VENCIDA. Um 'sem_validade' NÃO bloqueia (curso permanente). Basta
 *    um treinamento não-vencido da NR para ela contar como coberta (renovações).
 *  - BR-NR-003: `resumo` agrega total, contagem por status e as NRs distintas.
 */

/** NRs mais comuns na construção/indústria — sugestões para a UI (não é enum). */
const NR_COMUNS = [
  'NR-05', 'NR-06', 'NR-10', 'NR-11', 'NR-12', 'NR-13',
  'NR-18', 'NR-20', 'NR-33', 'NR-34', 'NR-35',
];

/** Janela (em dias) em que um treinamento vigente passa a "vencendo". */
const DIAS_VENCENDO = 30;

/** Normaliza uma NR para comparar sem depender de caixa/espaços ('nr-10' → 'NR-10'). */
function normalizarNr(nr) {
  return String(nr || '').trim().toUpperCase();
}

/** Data (YYYY-MM-DD) de um ISO/date string, para comparar por dia. */
function _diaDe(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

/** Dias inteiros entre dois YYYY-MM-DD (b - a); null se algum inválido. */
function _diasEntre(aISO, bISO) {
  const a = new Date(_diaDe(aISO) + 'T00:00:00Z');
  const b = new Date(_diaDe(bISO) + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Status de validade de um treinamento (BR-NR-001).
 * @param {string|null|undefined} dataValidade  YYYY-MM-DD (ou nulo).
 * @param {string} hojeISO                       ex.: '2026-07-21' ou ISO completo.
 * @returns {'vigente'|'vencendo'|'vencido'|'sem_validade'}
 */
function statusValidade(dataValidade, hojeISO) {
  if (!dataValidade) return 'sem_validade';
  const dias = _diasEntre(hojeISO, dataValidade); // validade - hoje
  if (dias === null) return 'sem_validade';
  if (dias < 0) return 'vencido';
  if (dias <= DIAS_VENCENDO) return 'vencendo';
  return 'vigente';
}

/**
 * Verifica se um colaborador pode ser alocado numa frente que exige um conjunto
 * de NRs (BR-NR-002). Bloqueia se alguma exigida está ausente ou vencida.
 * @param {Array<{nr?:string, dataValidade?:string|null}>} treinamentos
 * @param {string[]} nrsExigidas
 * @param {string} hojeISO
 * @returns {{ ok: boolean, faltantes: string[], vencidos: string[] }}
 */
function podeAlocar(treinamentos, nrsExigidas, hojeISO) {
  const lista = Array.isArray(treinamentos) ? treinamentos : [];
  // Dedup das exigidas normalizadas, preservando a ordem de entrada.
  const exigidas = [];
  for (const raw of Array.isArray(nrsExigidas) ? nrsExigidas : []) {
    const nr = normalizarNr(raw);
    if (nr && !exigidas.includes(nr)) exigidas.push(nr);
  }
  const faltantes = [];
  const vencidos = [];
  for (const nr of exigidas) {
    const doNr = lista.filter((t) => normalizarNr(t && t.nr) === nr);
    if (doNr.length === 0) {
      faltantes.push(nr);
      continue;
    }
    // Coberta se PELO MENOS UM treinamento da NR não está vencido
    // (vigente, vencendo ou sem_validade); renovações contam.
    const algumOk = doNr.some((t) => statusValidade(t && t.dataValidade, hojeISO) !== 'vencido');
    if (!algumOk) vencidos.push(nr);
  }
  return { ok: faltantes.length === 0 && vencidos.length === 0, faltantes, vencidos };
}

/**
 * Resumo da matriz de um colaborador (BR-NR-003).
 * @param {Array<object>} treinamentos
 * @param {string} hojeISO
 * @returns {{ total:number, porStatus:Record<string,number>, vencidos:number, vencendo:number, nrs:string[] }}
 */
function resumo(treinamentos, hojeISO) {
  const lista = Array.isArray(treinamentos) ? treinamentos : [];
  const porStatus = { vigente: 0, vencendo: 0, vencido: 0, sem_validade: 0 };
  const nrs = new Set();
  for (const t of lista) {
    const st = statusValidade(t && t.dataValidade, hojeISO);
    porStatus[st] += 1;
    const nr = normalizarNr(t && t.nr);
    if (nr) nrs.add(nr);
  }
  return {
    total: lista.length,
    porStatus,
    vencidos: porStatus.vencido,
    vencendo: porStatus.vencendo,
    nrs: [...nrs],
  };
}

module.exports = {
  NR_COMUNS,
  DIAS_VENCENDO,
  normalizarNr,
  statusValidade,
  podeAlocar,
  resumo,
};
