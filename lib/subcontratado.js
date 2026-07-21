'use strict';
/**
 * @file Subcontratados (empreiteiros) — regras puras do boletim de medições, sem
 * I/O, testáveis com node:test (test/subcontratado.test.js).
 *
 * Uma medição é o quanto um subcontratado fatura contra a Rhino numa competência
 * (YYYY-MM): tem um `valor`, um `percentual` (avanço físico do escopo dele) e um
 * `status` que evolui em três estados — prevista → medida → paga. A regra de
 * negócio aqui é apenas somar corretamente esses valores por diferentes recortes.
 *
 * Toda a aritmética monetária passa por lib/money (soma em centavos) para conter
 * drift de float — e porque o driver do Postgres devolve NUMERIC como string, que
 * `money` já sabe coagir.
 *
 * Regras (definidas com o roadmap — item 14):
 *  - BR-SUB-001: totalMedido = Σ valor das medições já MEDIDAS. "Medido" é trabalho
 *    formalmente aprovado, então inclui o que já foi PAGO (paga ⊂ medido). Ou seja,
 *    status ∈ {medida, paga}.
 *  - BR-SUB-002: totalPago = Σ valor das medições com status = paga.
 *  - BR-SUB-003: saldo (a pagar) = totalMedido − totalPago. Como paga ⊂ medido, é
 *    sempre ≥ 0 — é quanto já foi medido mas ainda não foi quitado.
 *  - BR-SUB-004: resumoPorStatus reparte { quantidade, valor } em prevista / medida
 *    / paga. A soma dos três `valor` reconstitui o total de todas as medições.
 *  - BR-SUB-005: porCompetencia agrega por competência (YYYY-MM), somando cada
 *    status e o total, ordenado por competência ascendente. Competência ausente
 *    cai no bucket '' (sem competência) e ordena antes das demais.
 *  - BR-SUB-006: resumo junta tudo (quantidade, totalPrevisto, totalMedido,
 *    totalPago, saldo, porStatus, porCompetencia) — é a verdade devolvida ao front.
 */
const money = require('./money');

/** Estados do ciclo de vida de uma medição, do previsto ao pago. */
const STATUS = ['prevista', 'medida', 'paga'];
const _STATUS = new Set(STATUS);

/** Status do cadastro do subcontratado. */
const STATUS_CADASTRO = ['ativo', 'inativo'];

/** Normaliza um status de medição desconhecido para 'prevista'. */
function normalizarStatus(s) {
  return _STATUS.has(s) ? s : 'prevista';
}

/** Normaliza o status de cadastro do subcontratado; default 'ativo'. */
function normalizarStatusCadastro(s) {
  return s === 'inativo' ? 'inativo' : 'ativo';
}

/** Lista defensiva: array de medições ou []. */
function _lista(medicoes) {
  return Array.isArray(medicoes) ? medicoes : [];
}

/** Soma `valor` das medições cujo status passa no predicado (em centavos, via money). */
function _somaPorStatus(medicoes, pred) {
  return money.sum(_lista(medicoes).filter((m) => pred(normalizarStatus(m && m.status))), (m) => m.valor);
}

/**
 * BR-SUB-001 — Total já medido: soma das medições com status ∈ {medida, paga}.
 * @param {Array<object>} medicoes
 * @returns {number} reais, 2 casas.
 */
function totalMedido(medicoes) {
  return _somaPorStatus(medicoes, (st) => st === 'medida' || st === 'paga');
}

/**
 * BR-SUB-002 — Total pago: soma das medições com status = paga.
 * @param {Array<object>} medicoes
 * @returns {number}
 */
function totalPago(medicoes) {
  return _somaPorStatus(medicoes, (st) => st === 'paga');
}

/**
 * BR-SUB-003 — Saldo a pagar: o que já foi medido mas ainda não foi pago.
 * @param {Array<object>} medicoes
 * @returns {number}
 */
function saldo(medicoes) {
  return money.round2(totalMedido(medicoes) - totalPago(medicoes));
}

/**
 * BR-SUB-004 — Resumo por status: { quantidade, valor } de cada estado.
 * @param {Array<object>} medicoes
 * @returns {Record<'prevista'|'medida'|'paga', { quantidade:number, valor:number }>}
 */
function resumoPorStatus(medicoes) {
  const out = {
    prevista: { quantidade: 0, valor: 0 },
    medida: { quantidade: 0, valor: 0 },
    paga: { quantidade: 0, valor: 0 },
  };
  for (const st of STATUS) {
    const doStatus = _lista(medicoes).filter((m) => normalizarStatus(m && m.status) === st);
    out[st] = { quantidade: doStatus.length, valor: money.sum(doStatus, (m) => m.valor) };
  }
  return out;
}

/**
 * BR-SUB-005 — Agregação por competência (YYYY-MM). Cada bucket soma cada status
 * e o total, mais a quantidade. Ordenado por competência ascendente ('' primeiro).
 * @param {Array<object>} medicoes
 * @returns {Array<{ competencia:string, prevista:number, medida:number, paga:number, total:number, quantidade:number }>}
 */
function porCompetencia(medicoes) {
  const mapa = new Map();
  for (const m of _lista(medicoes)) {
    const comp = m && m.competencia ? String(m.competencia) : '';
    if (!mapa.has(comp)) mapa.set(comp, []);
    mapa.get(comp).push(m);
  }
  return Array.from(mapa.keys())
    .sort()
    .map((comp) => {
      const grupo = mapa.get(comp);
      return {
        competencia: comp,
        prevista: money.sum(grupo.filter((m) => normalizarStatus(m.status) === 'prevista'), (m) => m.valor),
        medida: money.sum(grupo.filter((m) => normalizarStatus(m.status) === 'medida'), (m) => m.valor),
        paga: money.sum(grupo.filter((m) => normalizarStatus(m.status) === 'paga'), (m) => m.valor),
        total: money.sum(grupo, (m) => m.valor),
        quantidade: grupo.length,
      };
    });
}

/**
 * BR-SUB-006 — Resumo completo de um subcontratado a partir das suas medições.
 * @param {Array<object>} medicoes
 * @returns {{ quantidade:number, totalPrevisto:number, totalMedido:number, totalPago:number, saldo:number, porStatus:object, porCompetencia:object[] }}
 */
function resumo(medicoes) {
  const lista = _lista(medicoes);
  const porStatus = resumoPorStatus(lista);
  return {
    quantidade: lista.length,
    totalPrevisto: porStatus.prevista.valor,
    totalMedido: totalMedido(lista),
    totalPago: totalPago(lista),
    saldo: saldo(lista),
    porStatus,
    porCompetencia: porCompetencia(lista),
  };
}

module.exports = {
  STATUS,
  STATUS_CADASTRO,
  normalizarStatus,
  normalizarStatusCadastro,
  totalMedido,
  totalPago,
  saldo,
  resumoPorStatus,
  porCompetencia,
  resumo,
};
