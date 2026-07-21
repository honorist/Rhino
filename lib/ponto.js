'use strict';
/**
 * @file Ponto / banco de horas por colaborador — regras puras, sem I/O,
 * testáveis com node:test (test/ponto.test.js).
 *
 * Um registro de ponto é uma marcação diária (data, entrada, saída, intervalo)
 * de um recurso. A partir dela derivam as horas trabalhadas do dia, o saldo do
 * dia (frente à jornada prevista) e o saldo acumulado (banco de horas).
 *
 * Reaproveita lib/rdo-hh.js (duracaoLiquidaHoras) como fonte da verdade da
 * duração entre dois horários "HH:MM" — inclusive a virada de madrugada
 * (saída ≤ entrada → +24h) — para não duplicar essa lógica.
 *
 * Regras (definidas com o usuário em 2026-07-21):
 *  - BR-PONTO-001: horas trabalhadas = duração líquida (entrada→saída, tratando
 *    a virada de madrugada) menos o intervalo (refeição) em minutos; nunca
 *    negativa. Sem entrada ou sem saída válidas → 0.
 *  - BR-PONTO-002: saldo do dia = horas trabalhadas − jornada prevista (default
 *    8h). Positivo = hora extra; negativo = hora devida.
 *  - BR-PONTO-003: o resumo do período soma dias marcados, horas trabalhadas e
 *    o saldo acumulado (banco de horas).
 *
 * Todos os retornos numéricos são arredondados a 2 casas.
 */
const { duracaoLiquidaHoras } = require('./rdo-hh');

/** Jornada diária padrão (horas) quando o ponto não informa uma. */
const JORNADA_PADRAO = 8;

/** Arredonda para 2 casas, corrigindo drift de float. Inválido → 0. */
function _round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** Resolve a jornada prevista: undefined/null/inválido caem no padrão de 8h;
 *  um 0 explícito é respeitado (dia sem jornada). */
function _jornada(v) {
  if (v === undefined || v === null || v === '') return JORNADA_PADRAO;
  const x = Number(v);
  return Number.isFinite(x) ? x : JORNADA_PADRAO;
}

/**
 * Horas trabalhadas de uma marcação (BR-PONTO-001). Usa duracaoLiquidaHoras
 * (lib/rdo-hh) para a duração bruta entre entrada e saída — que já trata a
 * virada da madrugada — e desconta o intervalo (em minutos).
 *
 * @param {string} entrada           "HH:MM"
 * @param {string} saida             "HH:MM"
 * @param {number} [intervaloMin=0]  Minutos de intervalo (refeição) a descontar.
 * @returns {number} horas trabalhadas (>= 0, 2 casas). 0 se faltar entrada/saída.
 */
function calcHorasTrabalhadas(entrada, saida, intervaloMin = 0) {
  if (!entrada || !saida) return 0;
  const bruto = duracaoLiquidaHoras(entrada, saida); // 0 se algum horário inválido
  const intervalo = (Number(intervaloMin) || 0) / 60;
  return _round2(Math.max(0, bruto - intervalo));
}

/**
 * Saldo do dia (BR-PONTO-002): horas trabalhadas menos a jornada prevista.
 * Positivo = hora extra; negativo = hora devida.
 *
 * @param {number} horasTrabalhadas
 * @param {number} [jornadaPrevista=8]
 * @returns {number} saldo em horas (pode ser negativo), 2 casas.
 */
function saldoDia(horasTrabalhadas, jornadaPrevista) {
  const h = Number(horasTrabalhadas) || 0;
  return _round2(h - _jornada(jornadaPrevista));
}

/**
 * Saldo do banco de horas: soma dos saldos diários dos pontos. Cada ponto
 * contribui com (horasTrabalhadas − jornadaPrevista), usando os campos já
 * persistidos (snake→camel pelo db/index.js).
 *
 * @param {Array<{horasTrabalhadas?:number, jornadaPrevista?:number}>} pontos
 * @returns {number} saldo acumulado em horas (±, 2 casas).
 */
function saldoBancoHoras(pontos) {
  const lista = Array.isArray(pontos) ? pontos : [];
  const total = lista.reduce(
    (s, p) => s + saldoDia(p && p.horasTrabalhadas, p && p.jornadaPrevista),
    0
  );
  return _round2(total);
}

/**
 * Resumo do período (BR-PONTO-003).
 *
 * @param {Array<object>} pontos
 * @returns {{ dias:number, horasTrabalhadas:number, saldo:number }}
 */
function resumo(pontos) {
  const lista = Array.isArray(pontos) ? pontos : [];
  const horas = lista.reduce((s, p) => s + (Number(p && p.horasTrabalhadas) || 0), 0);
  return {
    dias: lista.length,
    horasTrabalhadas: _round2(horas),
    saldo: saldoBancoHoras(lista),
  };
}

module.exports = {
  JORNADA_PADRAO,
  calcHorasTrabalhadas,
  saldoDia,
  saldoBancoHoras,
  resumo,
};
