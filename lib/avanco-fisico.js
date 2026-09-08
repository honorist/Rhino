'use strict';
/**
 * @file Avanço físico da obra — FONTE ÚNICA. Regra pura, sem I/O, testável
 * (test/avanco-fisico.test.js).
 *
 * Por que este arquivo existe: o mesmo indicador era calculado em 6 lugares que
 * não reconciliavam entre si — ponderado por peso no cronograma
 * (js/views/contrato/cronograma.js:61), média simples no data book
 * (lib/data-book.js:68-69), EV/BAC no EVM, avanço por quantidade medida na
 * Medição, e um rótulo "% executado" na Visão Geral que na verdade mostrava o
 * % FATURADO. Quatro números diferentes com o mesmo nome de negócio.
 *
 * A definição canônica é a PONDERADA POR PESO: é a única que responde "quanto
 * da obra foi executado fisicamente". EV/BAC é financeiro agregado e avanço por
 * quantidade medida é por serviço — coisas legítimas, mas outras perguntas.
 *
 * Regras:
 *  - BR-AVANCO-001: Σ(pesoPct × execPct) / Σ pesoPct, quando Σ pesoPct > 0.
 *    É a fórmula que o cronograma já usava.
 *  - BR-AVANCO-002: havendo atividades mas nenhum peso preenchido, cai na média
 *    simples de execPct — o comportamento atual do data book, mantido para o
 *    indicador não regredir em obra cujo cronograma não pesou as etapas.
 *  - BR-AVANCO-003: sem atividades → `pct: null` e `base: 'sem_dados'`, NUNCA 0.
 *    "0% executado" e "não medido" são estados diferentes; tratá-los como o
 *    mesmo é o que faz lib/data-book.js:82-83 devolver `pronto:false` sem
 *    explicar que o cronograma está vazio. Quem consome decide como exibir.
 *
 * Percentuais em 1 casa decimal, igual a lib/data-book.js (o principal
 * consumidor) — assim o número não muda de forma ao trocar de fonte.
 */

/** Meta de avanço para a obra ser considerada fisicamente concluída. */
const META_EXEC_PCT = 100;

/** Arredonda para 1 casa decimal (mesma régua de lib/data-book.js). */
function _round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

/**
 * Lê a 1ª chave presente (camelCase de db.getMany primeiro, snake_case como
 * fallback para rows crus) — mesmo helper de lib/evm.js.
 */
function _pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/** Peso (0-100) da atividade; ausente/inválido → 0. */
function _pesoPct(a) {
  return parseFloat(_pick(a, ['pesoPct', 'peso_pct'])) || 0;
}

/**
 * Avanço (0-100) da atividade; ausente/inválido → 0. Limitado a [0, 100]:
 * avanço FÍSICO não passa de "pronto", e um exec_pct de 150 lançado por engano
 * não pode empurrar o total da obra acima de 100%.
 */
function _execPct(a) {
  const v = parseFloat(_pick(a, ['execPct', 'exec_pct'])) || 0;
  return Math.min(100, Math.max(0, v));
}

/**
 * Avanço físico da obra a partir das atividades do cronograma.
 *
 * @param {Array<{pesoPct?:number|string, peso_pct?:number|string,
 *                execPct?:number|string, exec_pct?:number|string}>} [atividades]
 *        Atividades de topo do cronograma (a mesma base da Curva S / EVM).
 * @returns {{ pct:number|null, base:'peso'|'media'|'sem_dados',
 *             totalPeso:number, n:number }}
 *          `pct` é null quando não há o que medir (BR-AVANCO-003); `base` diz
 *          COMO foi calculado, para a tela poder ser honesta com o usuário
 *          ("ponderado" vs "média — pesos não preenchidos").
 */
function avancoFisicoPonderado(atividades) {
  const ativs = Array.isArray(atividades) ? atividades : [];
  const n = ativs.length;

  // BR-AVANCO-003: nada a medir. Não é 0% — é "não medido".
  if (n === 0) return { pct: null, base: 'sem_dados', totalPeso: 0, n: 0 };

  const totalPeso = ativs.reduce((s, a) => s + _pesoPct(a), 0);

  // BR-AVANCO-001: ponderado pelo peso declarado de cada etapa.
  if (totalPeso > 0) {
    const somaPonderada = ativs.reduce((s, a) => s + _pesoPct(a) * _execPct(a), 0);
    return { pct: _round1(somaPonderada / totalPeso), base: 'peso', totalPeso: _round1(totalPeso), n };
  }

  // BR-AVANCO-002: cronograma sem pesos — média simples, como o data book faz.
  const media = ativs.reduce((s, a) => s + _execPct(a), 0) / n;
  return { pct: _round1(media), base: 'media', totalPeso: 0, n };
}

module.exports = { avancoFisicoPonderado, META_EXEC_PCT };
