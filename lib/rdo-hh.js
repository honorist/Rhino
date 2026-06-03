'use strict';
/**
 * @file Cálculo de Homem-Hora (HH) do RDO — módulo puro, sem dependências.
 *
 * Usado pelo servidor (handlers/contract-rdos.js, lib/rdo-pdf.js) como fonte
 * da verdade do HH, e espelhado no cliente (rdo-form.js) para preview ao vivo.
 *
 * Regras do modelo de fornecimento de HH (Passarelli):
 *  - HH de uma faixa = efetivo × horas TRABALHADAS;
 *  - o intervalo entre blocos do turno (ex.: 11:30–12:30) é refeição e NÃO conta;
 *  - turnos que viram a madrugada são suportados (fim ≤ início → +24h).
 */

/** Converte "HH:MM" em horas decimais (ex.: "07:30" → 7.5). Retorna null se inválido. */
function parseHora(hhmm) {
  if (hhmm == null) return null;
  const m = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h + min / 60;
}

/**
 * Duração líquida entre início e fim, em horas. Trata virada de madrugada:
 * se o fim for menor ou igual ao início, assume que passou da meia-noite (+24h).
 * Ex.: ("22:00","06:00") → 8; ("07:00","16:00") → 9; ("07:00","07:00") → 24.
 *
 * @param {string} horaIni  "HH:MM"
 * @param {string} horaFim  "HH:MM"
 * @returns {number} horas (>= 0); 0 se alguma hora for inválida.
 */
function duracaoLiquidaHoras(horaIni, horaFim) {
  const a = parseHora(horaIni);
  const b = parseHora(horaFim);
  if (a == null || b == null) return 0;
  let dur = b - a;
  if (dur <= 0) dur += 24; // vira a madrugada
  return dur;
}

/**
 * Horas trabalhadas em uma string de turno com um ou mais blocos separados por
 * "/", descontando os intervalos entre blocos (refeição). Aceita "às"/"ás".
 * Ex.: "07:00 às 11:30 /12:30 às 16:00" → 8 (4.5 + 3.5; a refeição 11:30–12:30
 * não conta). "17:00 às 03:00" → 10.
 *
 * @param {string} turno
 * @returns {number} horas trabalhadas.
 */
function horasDoTurno(turno) {
  if (!turno) return 0;
  const txt = String(turno).replace(/ás/g, 'às');
  let total = 0;
  for (const seg of txt.split('/')) {
    const m = seg.match(/(\d{1,2}:\d{2})\s*às\s*(\d{1,2}:\d{2})/);
    if (!m) continue;
    total += duracaoLiquidaHoras(m[1], m[2]);
  }
  return total;
}

/**
 * HH de uma linha: efetivo × horas (já líquidas de refeição).
 * @param {number} efetivo
 * @param {number} horas
 * @returns {number}
 */
function homemHora(efetivo, horas) {
  const e = Number(efetivo) || 0;
  const h = Number(horas) || 0;
  return e * h;
}

/**
 * Soma o HH de um array de detalhamento. Cada item pode trazer `horaTotalHH`
 * pré-calculado, ou `efetivo` + (`qtdHoras` | `horas`) para recálculo.
 *
 * @param {Array<{horaTotalHH?:number, efetivo?:number, qtdHoras?:number, horas?:number}>} detalhe
 * @returns {number}
 */
function totalHomemHora(detalhe) {
  if (!Array.isArray(detalhe)) return 0;
  return detalhe.reduce((s, d) => {
    if (d && d.horaTotalHH != null) return s + (Number(d.horaTotalHH) || 0);
    const horas = d && (d.qtdHoras != null ? d.qtdHoras : d.horas);
    return s + homemHora(d && d.efetivo, horas);
  }, 0);
}

/**
 * Normaliza uma linha de detalhamento garantindo `qtdHoras`, `horaTrabalho` e
 * `horaTotalHH` coerentes. Ordem de precedência para as horas:
 *   1. `horaIni`+`horaFim` (entrada manual) → duração líquida menos refeição;
 *   2. `horaTrabalho` em texto ("07:00 às 11:30 /12:30 às 16:00") → soma blocos;
 *   3. `qtdHoras`/`horas` informado diretamente.
 *
 * @param {object} linha {funcao, horaIni?, horaFim?, refeicaoMin?, horaTrabalho?, qtdHoras?, horas?, efetivo}
 * @returns {{funcao, horaIni, horaFim, refeicaoMin, horaTrabalho, qtdHoras, efetivo, horaTotalHH}}
 */
function normalizarLinha(linha) {
  const l = linha || {};
  const horaIni = l.horaIni || '';
  const horaFim = l.horaFim || '';
  const refeicaoMin = Number(l.refeicaoMin) || 0;
  let qtdHoras;
  let horaTrabalho = l.horaTrabalho || '';

  if (horaIni && horaFim) {
    const bruto = duracaoLiquidaHoras(horaIni, horaFim);
    qtdHoras = Math.max(0, bruto - refeicaoMin / 60);
    horaTrabalho = `${horaIni} às ${horaFim}` + (refeicaoMin ? ` (ref. ${refeicaoMin}min)` : '');
  } else if (horaTrabalho) {
    qtdHoras = horasDoTurno(horaTrabalho);
  } else {
    qtdHoras = l.qtdHoras != null ? Number(l.qtdHoras) : (l.horas != null ? Number(l.horas) : 0);
  }
  qtdHoras = Math.round((Number(qtdHoras) || 0) * 100) / 100;
  const efetivo = Number(l.efetivo) || 0;
  return {
    funcao: l.funcao || '',
    horaIni,
    horaFim,
    refeicaoMin,
    horaTrabalho,
    qtdHoras,
    efetivo,
    horaTotalHH: Math.round(efetivo * qtdHoras * 100) / 100,
  };
}

module.exports = {
  parseHora,
  duracaoLiquidaHoras,
  horasDoTurno,
  homemHora,
  totalHomemHora,
  normalizarLinha,
};
