'use strict';
/**
 * @file Equipamentos próprios/locados (item 16) — regras puras, sem I/O,
 * testáveis com node:test (test/equipamento.test.js).
 *
 * Um equipamento é um ativo da empresa (próprio ou locado de terceiro) com
 * status operacional; uma locação é a janela em que ele ficou alocado (a uma
 * obra ou não), com início, fim e valor mensal. As regras cobrem o custo de
 * locação acumulado, o resumo do parque e o alerta de devolução.
 *
 * Regras (definidas com o usuário em 2026-07-21):
 *  - BR-EQP-001: `custoLocacaoAcumulado` = meses corridos (fração ok) entre o
 *    início e o fim efetivo × valor mensal. O fim efetivo é o MENOR entre a data
 *    de referência (hoje) e a data de fim da locação — não se cobra depois de
 *    devolver, nem se projeta além de hoje. Convenção de proração: mês = 30 dias
 *    (padrão de locação de equipamento). Início ausente, fim efetivo ≤ início,
 *    ou datas inválidas → custo 0. Arredonda a 2 casas.
 *  - BR-EQP-002: `resumo` conta próprios vs locados, a distribuição por status
 *    operacional e o custo mensal de locação total (soma do valor mensal apenas
 *    dos equipamentos LOCADOS — um próprio não gera custo de locação).
 *  - BR-EQP-003: `alertaDevolucao` devolve as locações ATIVAS cujo fim já passou
 *    ('vencida') ou está a ≤ 15 dias ('vencendo') da data de referência. Locação
 *    sem data de fim não alerta (sem prazo de devolução). Cada item recebe
 *    `diasRestantes` (fim − ref) e `situacao`.
 */

/** Propriedades possíveis de um equipamento. */
const PROPRIEDADES = ['proprio', 'locado'];
/** Status operacional de um equipamento. */
const STATUS = ['disponivel', 'em_uso', 'manutencao', 'devolvido'];
/** Estados de uma locação. */
const STATUS_LOCACAO = ['ativa', 'encerrada'];

const _PROP = new Set(PROPRIEDADES);
const _STATUS = new Set(STATUS);
const _STATUS_LOC = new Set(STATUS_LOCACAO);

/** Dias corridos que contam como 1 mês na proração da locação (BR-EQP-001). */
const DIAS_POR_MES = 30;
/** Janela (em dias) em que uma locação ativa passa a "vencendo" (BR-EQP-003). */
const DIAS_ALERTA_DEVOLUCAO = 15;

/** Normaliza uma propriedade desconhecida para 'proprio'. */
function normalizarPropriedade(p) {
  return _PROP.has(p) ? p : 'proprio';
}
/** Normaliza um status operacional desconhecido para 'disponivel'. */
function normalizarStatus(s) {
  return _STATUS.has(s) ? s : 'disponivel';
}
/** Normaliza um status de locação desconhecido para 'ativa'. */
function normalizarStatusLocacao(s) {
  return _STATUS_LOC.has(s) ? s : 'ativa';
}

/** Arredonda a 2 casas decimais (coage não-número a 0). */
function _round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Data (YYYY-MM-DD) de um ISO/date string, para comparar por dia. */
function _diaDe(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

/** Dias inteiros entre dois YYYY-MM-DD (b − a); null se algum inválido. */
function _diasEntre(aISO, bISO) {
  const a = new Date(_diaDe(aISO) + 'T00:00:00Z');
  const b = new Date(_diaDe(bISO) + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Custo de locação acumulado (BR-EQP-001): meses corridos (fração) entre início
 * e o fim efetivo × valor mensal. Fim efetivo = menor entre dataRef e dataFim.
 * @param {string|null|undefined} dataInicio  YYYY-MM-DD.
 * @param {string|null|undefined} dataFim      YYYY-MM-DD (nulo = ainda em curso).
 * @param {number} valorMensal
 * @param {string} dataRef                     YYYY-MM-DD (normalmente hoje).
 * @returns {number}  Custo acumulado (2 casas). 0 se não computável.
 */
function custoLocacaoAcumulado(dataInicio, dataFim, valorMensal, dataRef) {
  if (!dataInicio) return 0;
  // Fim efetivo: o menor dia entre a referência e o fim (o que existir).
  const candidatos = [dataFim, dataRef].filter((d) => d);
  if (candidatos.length === 0) return 0;
  let fim = candidatos[0];
  for (const c of candidatos) {
    if (_diasEntre(c, fim) > 0) fim = c; // fim − c > 0 → c é anterior → menor
  }
  const dias = _diasEntre(dataInicio, fim);
  if (dias === null || dias <= 0) return 0;
  const meses = dias / DIAS_POR_MES;
  return _round2(meses * (Number(valorMensal) || 0));
}

/**
 * Resumo do parque de equipamentos (BR-EQP-002).
 * @param {Array<object>} equipamentos
 * @returns {{ total:number, proprios:number, locados:number, porStatus:Record<string,number>, custoLocacaoMensal:number }}
 */
function resumo(equipamentos) {
  const lista = Array.isArray(equipamentos) ? equipamentos : [];
  const porStatus = { disponivel: 0, em_uso: 0, manutencao: 0, devolvido: 0 };
  let proprios = 0;
  let locados = 0;
  let custoLocacaoMensal = 0;
  for (const e of lista) {
    porStatus[normalizarStatus(e && e.status)] += 1;
    if (normalizarPropriedade(e && e.propriedade) === 'locado') {
      locados += 1;
      custoLocacaoMensal += Number(e && e.valorLocacaoMensal) || 0;
    } else {
      proprios += 1;
    }
  }
  return {
    total: lista.length,
    proprios,
    locados,
    porStatus,
    custoLocacaoMensal: _round2(custoLocacaoMensal),
  };
}

/**
 * Alerta de devolução (BR-EQP-003): locações ativas vencidas ou vencendo em
 * ≤ 15 dias. Locação sem data de fim não alerta.
 * @param {Array<object>} locacoes
 * @param {string} dataRef  YYYY-MM-DD (normalmente hoje).
 * @returns {Array<object>}  Cada locação alertada + `diasRestantes` e `situacao`
 *   ('vencida' | 'vencendo'), da mais crítica (menor diasRestantes) para a menos.
 */
function alertaDevolucao(locacoes, dataRef) {
  const lista = Array.isArray(locacoes) ? locacoes : [];
  const alertas = [];
  for (const l of lista) {
    if (!l || normalizarStatusLocacao(l.status) !== 'ativa') continue;
    if (!l.dataFim) continue;
    const dias = _diasEntre(dataRef, l.dataFim); // fim − ref
    if (dias === null) continue;
    if (dias < 0) {
      alertas.push({ ...l, diasRestantes: dias, situacao: 'vencida' });
    } else if (dias <= DIAS_ALERTA_DEVOLUCAO) {
      alertas.push({ ...l, diasRestantes: dias, situacao: 'vencendo' });
    }
  }
  alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);
  return alertas;
}

module.exports = {
  PROPRIEDADES,
  STATUS,
  STATUS_LOCACAO,
  DIAS_POR_MES,
  DIAS_ALERTA_DEVOLUCAO,
  normalizarPropriedade,
  normalizarStatus,
  normalizarStatusLocacao,
  custoLocacaoAcumulado,
  resumo,
  alertaDevolucao,
};
