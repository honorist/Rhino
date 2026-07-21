'use strict';
/**
 * @file SSMA — Desvios e incidentes de segurança por obra: regras puras, sem
 * I/O, testáveis com node:test (test/ssma.test.js).
 *
 * Uma ocorrência SSMA é um registro de desvio / quase-acidente / incidente /
 * acidente por contrato, com gravidade, causa, ação corretiva, responsável e
 * prazo, além dos campos que alimentam os indicadores de segurança do trabalho:
 * `comAfastamento` (o acidente gerou afastamento?) e `diasPerdidos`.
 *
 * Indicadores clássicos de SST (NR / OSHA), por milhão de homem-hora trabalhado
 * (HHT). Definidos com o usuário em 2026-07-20:
 *  - BR-SSMA-001: Taxa de Frequência (TF) = nº de acidentes com afastamento ×
 *    1.000.000 ÷ HHT. Sem HHT (0) a taxa é 0 — não há base para dividir.
 *  - BR-SSMA-002: Taxa de Gravidade (TG) = dias perdidos × 1.000.000 ÷ HHT.
 *    Mesma proteção: HHT 0 → 0.
 *  - BR-SSMA-003: o resumo da obra conta total, por tipo, por status, quantas
 *    tiveram afastamento, o total de dias perdidos e as duas taxas (TF/TG).
 * As duas taxas são arredondadas a 2 casas decimais.
 */

/** Tipos de ocorrência, do mais leve ao mais grave. */
const TIPOS = ['desvio', 'quase_acidente', 'incidente', 'acidente'];
/** Gravidades (mesmo vocabulário do punch list). */
const GRAVIDADES = ['baixa', 'media', 'alta', 'critica'];
/** Estados do fluxo de tratamento da ocorrência. */
const STATUS = ['aberto', 'em_investigacao', 'encerrado'];

const _TIPOS = new Set(TIPOS);
const _GRAV = new Set(GRAVIDADES);
const _STATUS = new Set(STATUS);

/** Normaliza um tipo desconhecido para 'desvio'. */
function normalizarTipo(t) {
  return _TIPOS.has(t) ? t : 'desvio';
}
/** Normaliza uma gravidade desconhecida para 'media'. */
function normalizarGravidade(g) {
  return _GRAV.has(g) ? g : 'media';
}
/** Normaliza um status desconhecido para 'aberto'. */
function normalizarStatus(s) {
  return _STATUS.has(s) ? s : 'aberto';
}

/** Arredonda a 2 casas decimais (coage não-número a 0). */
function _round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Taxa de Frequência — TF (BR-SSMA-001): acidentes com afastamento por milhão
 * de homem-hora trabalhado. HHT ≤ 0 → 0 (sem base para dividir).
 * @param {number} nAcidentes  nº de acidentes com afastamento (lost-time).
 * @param {number} hht         homem-hora trabalhado no período.
 * @returns {number}
 */
function calcTF(nAcidentes, hht) {
  const h = Number(hht) || 0;
  const n = Number(nAcidentes) || 0;
  return h > 0 ? _round2((n * 1e6) / h) : 0;
}

/**
 * Taxa de Gravidade — TG (BR-SSMA-002): dias perdidos por milhão de homem-hora
 * trabalhado. HHT ≤ 0 → 0.
 * @param {number} diasPerdidos
 * @param {number} hht
 * @returns {number}
 */
function calcTG(diasPerdidos, hht) {
  const h = Number(hht) || 0;
  const d = Number(diasPerdidos) || 0;
  return h > 0 ? _round2((d * 1e6) / h) : 0;
}

/**
 * Resumo da obra (BR-SSMA-003). A TF usa a contagem de ocorrências com
 * afastamento; a TG usa o total de dias perdidos.
 * @param {Array<object>} ocorrencias
 * @param {number} hht  homem-hora trabalhado (0 se indisponível → tf/tg = 0).
 * @returns {{ total:number, porTipo:Record<string,number>, porStatus:Record<string,number>, comAfastamento:number, diasPerdidos:number, tf:number, tg:number }}
 */
function resumo(ocorrencias, hht) {
  const lista = Array.isArray(ocorrencias) ? ocorrencias : [];
  const porTipo = { desvio: 0, quase_acidente: 0, incidente: 0, acidente: 0 };
  const porStatus = { aberto: 0, em_investigacao: 0, encerrado: 0 };
  let comAfastamento = 0;
  let diasPerdidos = 0;
  for (const o of lista) {
    porTipo[normalizarTipo(o && o.tipo)] += 1;
    porStatus[normalizarStatus(o && o.status)] += 1;
    if (o && o.comAfastamento) comAfastamento += 1;
    diasPerdidos += Number(o && o.diasPerdidos) || 0;
  }
  return {
    total: lista.length,
    porTipo,
    porStatus,
    comAfastamento,
    diasPerdidos,
    tf: calcTF(comAfastamento, hht),
    tg: calcTG(diasPerdidos, hht),
  };
}

module.exports = {
  TIPOS,
  GRAVIDADES,
  STATUS,
  normalizarTipo,
  normalizarGravidade,
  normalizarStatus,
  calcTF,
  calcTG,
  resumo,
};
