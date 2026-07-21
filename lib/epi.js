'use strict';
/**
 * @file Controle de EPIs — regras puras, sem I/O, testáveis com node:test
 * (test/epi.test.js). Uma "entrega" é a ficha de um EPI dado a um colaborador
 * (comprovação NR-06): descrição, CA, quantidade, data de entrega, vida útil e
 * data prevista de troca. A partir daí derivamos se o EPI precisa ser trocado,
 * o status da ficha e o resumo por colaborador.
 *
 * O "hoje" é sempre INJETADO (parâmetro `hojeISO`) — nada de `new Date()` aqui,
 * para as funções continuarem puras e determinísticas no teste.
 *
 * Regras (definidas com o usuário em 2026-07-21):
 *  - BR-EPI-001: um EPI PRECISA DE TROCA quando NÃO foi devolvido e a data de
 *    troca prevista já está no passado (antes de hoje). Sem data prevista, nunca
 *    "vence" sozinho.
 *  - BR-EPI-002: o status da ficha é 'devolvido' (se devolvido), senão 'trocar'
 *    (se precisa troca), senão 'ativo'. Devolução tem prioridade sobre troca —
 *    um EPI devolvido não pende troca.
 *  - BR-EPI-003: o resumo do colaborador conta total, ativos, a trocar e
 *    devolvidos. As três categorias particionam o total (ativos + aTrocar +
 *    devolvidos === total).
 */

/** Status possíveis de uma ficha de EPI, na ordem de leitura. */
const STATUS = ['ativo', 'trocar', 'devolvido'];

/** Data (YYYY-MM-DD) de um ISO/date string, para comparar por dia. */
function _diaDe(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

/**
 * Data prevista de troca = data de entrega + vida útil (em meses). Puro e
 * determinístico; o dia é preservado, com "clamp" para o último dia do mês de
 * destino quando o mês não tem aquele dia (ex.: 31/01 + 1 mês → 28/02).
 *
 * @param {string|null|undefined} dataEntrega   YYYY-MM-DD.
 * @param {number|string|null|undefined} vidaUtilMeses
 * @returns {string|null}  YYYY-MM-DD, ou null se faltar entrada ou vida útil ≤ 0.
 */
function dataTrocaPrevista(dataEntrega, vidaUtilMeses) {
  const dia = _diaDe(dataEntrega);
  const meses = parseInt(vidaUtilMeses, 10);
  if (!dia || !Number.isFinite(meses) || meses <= 0) return null;
  const m = dia.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]); // 1..12
  const d = Number(m[3]);
  const base = new Date(Date.UTC(y, mo - 1, d));
  if (isNaN(base.getTime())) return null;
  const totalMonth = base.getUTCMonth() + meses;
  const targetYear = base.getUTCFullYear() + Math.floor(totalMonth / 12);
  const targetMonth = ((totalMonth % 12) + 12) % 12;
  // Último dia do mês de destino (dia 0 do mês seguinte).
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return new Date(Date.UTC(targetYear, targetMonth, day)).toISOString().slice(0, 10);
}

/**
 * BR-EPI-001. Precisa de troca: não devolvido e troca prevista no passado.
 * @param {string|null|undefined} dataTrocaPrev  YYYY-MM-DD.
 * @param {string} hojeISO                        '2026-07-21' ou ISO completo.
 * @param {boolean} [devolvido]
 * @returns {boolean}
 */
function precisaTroca(dataTrocaPrev, hojeISO, devolvido) {
  if (devolvido) return false;
  const troca = _diaDe(dataTrocaPrev);
  if (!troca) return false;
  return troca < _diaDe(hojeISO);
}

/**
 * BR-EPI-002. Status da ficha: 'devolvido' > 'trocar' > 'ativo'.
 * @param {{dataTrocaPrevista?:string|null, devolvido?:boolean}} entrega
 * @param {string} hojeISO
 * @returns {'ativo'|'trocar'|'devolvido'}
 */
function statusEpi(entrega, hojeISO) {
  const e = entrega || {};
  if (e.devolvido) return 'devolvido';
  if (precisaTroca(e.dataTrocaPrevista, hojeISO, e.devolvido)) return 'trocar';
  return 'ativo';
}

/**
 * BR-EPI-003. Resumo do colaborador. As três categorias particionam o total.
 * @param {Array<object>} entregas
 * @param {string} hojeISO
 * @returns {{ total:number, ativos:number, aTrocar:number, devolvidos:number }}
 */
function resumo(entregas, hojeISO) {
  const lista = Array.isArray(entregas) ? entregas : [];
  let ativos = 0;
  let aTrocar = 0;
  let devolvidos = 0;
  for (const e of lista) {
    const st = statusEpi(e, hojeISO);
    if (st === 'devolvido') devolvidos += 1;
    else if (st === 'trocar') aTrocar += 1;
    else ativos += 1;
  }
  return { total: lista.length, ativos, aTrocar, devolvidos };
}

module.exports = {
  STATUS,
  dataTrocaPrevista,
  precisaTroca,
  statusEpi,
  resumo,
};
