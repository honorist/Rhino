'use strict';
/**
 * @file Data book / prontidão de comissionamento por obra (item 12) — regra
 * pura, sem I/O, testável (test/data-book.test.js). NÃO gera PDF: só consolida
 * se a obra está PRONTA para a entrega/comissionamento, a partir de dados já
 * carregados (itens de punch list + avanço físico das atividades).
 *
 * A geração do PDF do data book (capa, índice, anexos, evidências) fica para a
 * FASE 2 — aqui entregamos só o indicador de prontidão que alimenta o painel/
 * checklist da obra.
 *
 * Regras (MVP, definidas com o item 12 do roadmap):
 *  - BR-DATABOOK-001: a prontidão da punch list conta total, verificados
 *    (status 'verificado'), abertos (todo o resto) e o % verificado. Sem itens
 *    de punch nada está pendente → 100% verificado e nenhum aberto.
 *  - BR-DATABOOK-002: a obra está PRONTA quando NÃO há item de punch em aberto
 *    E o avanço físico médio das atividades atingiu a meta (100%). Cada bloqueio
 *    vira uma linha em `pendencias` (texto pronto para exibir).
 */

/** Avanço físico médio (%) mínimo para a obra ser considerada pronta. */
const META_EXEC_PCT = 100;
/** Status que marca um item de punch como encerrado pela qualidade. */
const STATUS_VERIFICADO = 'verificado';

/** Arredonda para 1 casa decimal (evita dízimas na apresentação). */
function _round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

/**
 * Lê o avanço (0-100) de uma atividade, aceitando `execPct` (camelCase, como
 * db.getMany devolve) ou `exec_pct` (snake). Valor não-numérico vira 0.
 * @param {object} a
 * @returns {number}
 */
function _execPctDe(a) {
  if (!a || typeof a !== 'object') return 0;
  const v = a.execPct !== undefined ? a.execPct : a.exec_pct;
  return parseFloat(v) || 0;
}

/**
 * Prontidão da obra para comissionamento (BR-DATABOOK-001/002). Puro: recebe os
 * dados já carregados pelo handler; não faz I/O.
 *
 * @param {object} [p]
 * @param {Array<{status?:string}>} [p.punchItens]              Itens de punch list da obra.
 * @param {Array<{execPct?:number, exec_pct?:number}>} [p.atividades]  Atividades do cronograma.
 * @returns {{
 *   punch: { total:number, abertos:number, verificados:number, pctVerificado:number },
 *   fisico: { execMedio:number },
 *   pronto: boolean,
 *   pendencias: string[]
 * }}
 */
function prontidao({ punchItens, atividades } = {}) {
  const itens = Array.isArray(punchItens) ? punchItens : [];
  const ativs = Array.isArray(atividades) ? atividades : [];

  // ── Punch list (BR-DATABOOK-001) ──
  const total = itens.length;
  const verificados = itens.filter((it) => it && it.status === STATUS_VERIFICADO).length;
  const abertos = total - verificados;
  const pctVerificado = total > 0 ? _round1((verificados / total) * 100) : 100;

  // ── Avanço físico: média simples do exec_pct das atividades ──
  const execMedio =
    ativs.length > 0 ? _round1(ativs.reduce((s, a) => s + _execPctDe(a), 0) / ativs.length) : 0;

  // ── Prontidão + pendências (BR-DATABOOK-002) ──
  const pendencias = [];
  if (abertos > 0) {
    pendencias.push(`${abertos} item(ns) de punch list ainda não verificado(s).`);
  }
  if (ativs.length === 0) {
    pendencias.push('Cronograma sem atividades — avanço físico não medido.');
  } else if (execMedio < META_EXEC_PCT) {
    pendencias.push(`Avanço físico em ${execMedio}% (meta ${META_EXEC_PCT}%).`);
  }

  // Sem atividades, execMedio = 0 < META → nunca fica pronto (avanço não medido).
  const pronto = abertos === 0 && execMedio >= META_EXEC_PCT;

  return {
    punch: { total, abertos, verificados, pctVerificado },
    fisico: { execMedio },
    pronto,
    pendencias,
  };
}

module.exports = { prontidao, META_EXEC_PCT };
