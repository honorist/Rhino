'use strict';
/**
 * @file EVM — Earned Value Management (Gestão de Valor Agregado) por obra:
 * regras puras, sem I/O, testáveis com node:test (test/evm.test.js).
 *
 * A partir das atividades do cronograma (mesma base da Curva S: atividades de
 * topo, `parent_id IS NULL`) e do custo realizado da obra (AC, injetado pelo
 * handler a partir do caixa/DRE), calcula os indicadores clássicos de valor
 * agregado numa DATA DE REFERÊNCIA. Regras definidas com o usuário em 2026-07-21:
 *
 *  - BR-EVM-001: BAC (Budget At Completion) = Σ custo_plan das atividades — o
 *    orçamento total planejado da obra, a MESMA soma que alimenta a Curva S.
 *  - BR-EVM-002: progresso PLANEJADO de uma atividade numa data é LINEAR entre o
 *    início e o fim planejados: 0 antes do início, 1 depois do fim, fração no
 *    meio. Sem data de início OU de fim → 0 (não há como planejar a curva).
 *  - BR-EVM-003: PV (Planned Value) = Σ custo_plan_i × progressoPlanejado_i(dataRef).
 *  - BR-EVM-004: EV (Earned Value) = Σ custo_plan_i × (exec_pct_i / 100) — o quanto
 *    de orçamento já foi "ganho" pelo avanço físico real.
 *  - BR-EVM-005: SV (Schedule Variance) = EV − PV; CV (Cost Variance) = EV − AC.
 *    Positivo = adiantado / dentro do custo; negativo = atrasado / estourado.
 *  - BR-EVM-006: SPI = PV>0 ? EV/PV : 0; CPI = AC>0 ? EV/AC : 0 (2 casas). Sem
 *    PV/AC não há base para o índice → 0 (protege divisão por zero).
 *  - BR-EVM-007: EAC (Estimate At Completion) = CPI>0 ? BAC/CPI : BAC — projeta o
 *    custo final mantendo a eficiência atual; sem CPI, cai no próprio BAC.
 *  - BR-EVM-008: ETC (Estimate To Complete) = EAC − AC; VAC (Variance At
 *    Completion) = BAC − EAC (positivo = folga, negativo = estouro projetado).
 * Índices e valores são arredondados a 2 casas (lib/money).
 */
const money = require('./money');

/**
 * Lê a 1ª chave presente de uma lista (camelCase vinda de db.getMany primeiro,
 * snake_case como fallback para chamadas com rows crus). Ignora null/undefined.
 * @param {object|null|undefined} obj
 * @param {string[]} keys
 * @returns {*}
 */
function _pick(obj, keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/** Custo planejado da atividade (BRL, 2 casas), aceitando número ou string. */
function _custoPlan(a) {
  return money.parse(_pick(a, ['custoPlan', 'custo_plan']));
}
/** Percentual executado (0-100) da atividade; inválido → 0. */
function _execPct(a) {
  return Number(_pick(a, ['execPct', 'exec_pct'])) || 0;
}
/** Data de início planejado (string YYYY-MM-DD ou Date). */
function _inicio(a) {
  return _pick(a, ['dataInicioPlan', 'data_inicio_plan']);
}
/** Data de fim planejado (string YYYY-MM-DD ou Date). */
function _fim(a) {
  return _pick(a, ['dataFimPlan', 'data_fim_plan']);
}
/** Nome da atividade (string; vazio se ausente). */
function _nome(a) {
  const n = _pick(a, ['nome', 'name']);
  return n == null ? '' : String(n);
}

/**
 * Converte uma data (string YYYY-MM-DD ou Date) em timestamp (ms). Vazio ou
 * inválido → null. Strings YYYY-MM-DD são interpretadas em UTC, mantendo a
 * comparação consistente com a data de referência (mesma origem de parse).
 * @param {string|Date|null|undefined} v
 * @returns {number|null}
 */
function _toTime(v) {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Progresso planejado (0..1) de uma atividade numa data de referência
 * (BR-EVM-002). Linear entre início e fim: 0 antes do início, 1 depois do fim,
 * fração no meio. Sem início/fim válidos (ou data de referência inválida) → 0.
 * @param {string|Date} dataInicio  início planejado (YYYY-MM-DD).
 * @param {string|Date} dataFim     fim planejado (YYYY-MM-DD).
 * @param {string|Date} dataRef     data de referência do cálculo.
 * @returns {number} fração em [0, 1].
 */
function progressoPlanejado(dataInicio, dataFim, dataRef) {
  const ini = _toTime(dataInicio);
  const fim = _toTime(dataFim);
  const ref = _toTime(dataRef);
  if (ini == null || fim == null || ref == null) return 0;
  if (ref <= ini) return 0; // ainda não começou (ou exatamente no início)
  if (ref >= fim) return 1; // já terminou (cobre também janela degenerada fim<=ini)
  // Aqui fim > ini e ini < ref < fim: divisão segura.
  return (ref - ini) / (fim - ini);
}

/**
 * Indicadores EVM da obra numa data de referência (BR-EVM-001..008).
 * @param {Array<object>} atividades  atividades do cronograma. Rows camelCase de
 *   db.getMany: `custoPlan`, `execPct`, `dataInicioPlan`, `dataFimPlan`, `nome`,
 *   `id` (snake_case também é aceito).
 * @param {number|string} ac  custo realizado da obra (AC, base caixa) — injetado
 *   pelo handler a partir do DRE/caixa.
 * @param {string|Date} dataRef  data de referência (quem chama decide o default).
 * @returns {{
 *   bac:number, pv:number, ev:number, ac:number, sv:number, cv:number,
 *   spi:number, cpi:number, eac:number, etc:number, vac:number,
 *   porAtividade: Array<{ id:(string|null), nome:string, pv:number, ev:number, custoPlan:number, execPct:number }>
 * }}
 */
function evm(atividades, ac, dataRef) {
  const lista = Array.isArray(atividades) ? atividades : [];
  const acVal = money.parse(ac);

  let bac = 0;
  let pv = 0;
  let ev = 0;
  const porAtividade = [];

  for (const a of lista) {
    const custoPlan = _custoPlan(a);
    const execPct = _execPct(a);
    const prog = progressoPlanejado(_inicio(a), _fim(a), dataRef); // BR-EVM-002
    const pvI = custoPlan * prog; // BR-EVM-003
    const evI = custoPlan * (execPct / 100); // BR-EVM-004
    bac += custoPlan; // BR-EVM-001
    pv += pvI;
    ev += evI;
    porAtividade.push({
      id: a && a.id != null ? a.id : null,
      nome: _nome(a),
      pv: money.round2(pvI),
      ev: money.round2(evI),
      custoPlan: money.round2(custoPlan),
      execPct: money.round2(execPct),
    });
  }

  bac = money.round2(bac);
  pv = money.round2(pv);
  ev = money.round2(ev);

  // BR-EVM-005: variações (positivo bom, negativo ruim).
  const sv = money.round2(ev - pv);
  const cv = money.round2(ev - acVal);
  // BR-EVM-006: índices protegidos de divisão por zero.
  const spi = pv > 0 ? money.round2(ev / pv) : 0;
  const cpi = acVal > 0 ? money.round2(ev / acVal) : 0;
  // BR-EVM-007: projeção de custo final mantendo o CPI atual (sem CPI → BAC).
  const eac = cpi > 0 ? money.round2(bac / cpi) : bac;
  // BR-EVM-008: quanto falta gastar e folga/estouro projetado.
  const etc = money.round2(eac - acVal);
  const vac = money.round2(bac - eac);

  return { bac, pv, ev, ac: acVal, sv, cv, spi, cpi, eac, etc, vac, porAtividade };
}

module.exports = { evm, progressoPlanejado };
