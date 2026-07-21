'use strict';
/**
 * @file Apontamento de HH por colaborador × atividade — regra pura, sem I/O,
 * testável com node:test (test/rdo-apontamento.test.js).
 *
 * Complementa lib/rdo-hh.js (que calcula HH por FUNÇÃO). Aqui a chave é a PESSOA
 * (recurso) e a ATIVIDADE do cronograma: normaliza os apontamentos de um RDO e
 * consolida a produtividade da obra (HH previsto por atividade × HH realizado
 * somado dos apontamentos).
 *
 * Regras (definidas com o usuário em 2026-07-20):
 *  - BR-APONT-001: horas de um apontamento nunca são negativas (viram 0) e são
 *    arredondadas a 2 casas.
 *  - BR-APONT-002: um apontamento precisa de IDENTIDADE — ao menos recurso OU
 *    função — e de horas > 0; sem isso é descartado (linha em branco do form).
 *  - BR-APONT-003: HH realizado de uma atividade = Σ horas dos apontamentos com
 *    aquele atividade_id.
 *  - BR-APONT-004: produtividade % = HH realizado ÷ HH previsto × 100 (0 e status
 *    'sem_plano' quando o previsto é 0, sem divisão por zero); saldo = previsto −
 *    realizado; realizado acima do previsto → status 'estourado'.
 *  - BR-APONT-005: apontamentos sem atividade não se perdem — somam no bucket
 *    "sem atividade".
 */
const money = require('./money');

/** Arredonda horas a 2 casas, nunca negativas (BR-APONT-001). */
function _horas(v) {
  const h = money.round2(money.parse(v));
  return h > 0 ? h : 0;
}

/**
 * Normaliza uma linha de apontamento vinda do form.
 * @param {object} linha {recursoId?, atividadeId?, funcao?, horas?, observacoes?}
 * @returns {{recursoId:string|null, atividadeId:string|null, funcao:string, horas:number, observacoes:string} | null}
 *   null quando a linha não tem identidade nem horas (BR-APONT-002).
 */
function normalizarApontamento(linha) {
  const l = linha || {};
  const recursoId = l.recursoId ? String(l.recursoId) : null;
  const atividadeId = l.atividadeId ? String(l.atividadeId) : null;
  const funcao = String(l.funcao || '').trim();
  const horas = _horas(l.horas);
  // BR-APONT-002: sem identidade OU sem horas → linha vazia, descarta.
  if ((!recursoId && !funcao) || horas <= 0) return null;
  return {
    recursoId,
    atividadeId,
    funcao,
    horas,
    observacoes: String(l.observacoes || '').trim(),
  };
}

/** Normaliza e filtra uma lista de apontamentos (descarta as linhas vazias). */
function normalizarApontamentos(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizarApontamento).filter(Boolean);
}

/**
 * Consolida a produtividade de HH da obra: para cada atividade, o previsto
 * (hh_plan) contra o realizado (Σ horas apontadas). Apontamentos sem atividade
 * caem num bucket à parte.
 *
 * @param {object} p
 * @param {Array<{id:string, nome?:string, hhPlan?:number}>} p.atividades
 * @param {Array<{atividadeId?:string|null, horas?:number}>} p.apontamentos
 * @returns {{
 *   porAtividade: Array<{atividadeId:string, nome:string, hhPlan:number, hhReal:number, saldo:number, pct:number, status:string}>,
 *   semAtividade: number,
 *   totalHhPlan: number,
 *   totalHhReal: number
 * }}
 */
function computeProdutividade({ atividades, apontamentos } = {}) {
  const ativs = Array.isArray(atividades) ? atividades : [];
  const apts = Array.isArray(apontamentos) ? apontamentos : [];

  // BR-APONT-003: soma horas por atividade_id.
  const realPorAtiv = new Map();
  let semAtividade = 0;
  for (const a of apts) {
    const h = _horas(a && a.horas);
    if (h <= 0) continue;
    const aid = a && a.atividadeId ? String(a.atividadeId) : null;
    if (!aid) {
      semAtividade += h; // BR-APONT-005
      continue;
    }
    realPorAtiv.set(aid, (realPorAtiv.get(aid) || 0) + h);
  }

  const porAtividade = ativs.map((at) => {
    const hhPlan = money.round2(money.parse(at.hhPlan));
    const hhReal = money.round2(realPorAtiv.get(String(at.id)) || 0);
    const saldo = money.round2(hhPlan - hhReal);
    // BR-APONT-004.
    let pct = 0;
    let status = 'sem_plano';
    if (hhPlan > 0) {
      pct = money.round2((hhReal / hhPlan) * 100);
      status = hhReal > hhPlan ? 'estourado' : 'ok';
    }
    return { atividadeId: String(at.id), nome: at.nome || '', hhPlan, hhReal, saldo, pct, status };
  });

  const totalHhPlan = money.round2(money.sum(porAtividade, (a) => a.hhPlan));
  const totalHhReal = money.round2(
    money.sum(porAtividade, (a) => a.hhReal) + semAtividade
  );

  return { porAtividade, semAtividade: money.round2(semAtividade), totalHhPlan, totalHhReal };
}

module.exports = { normalizarApontamento, normalizarApontamentos, computeProdutividade };
