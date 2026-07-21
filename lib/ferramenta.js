'use strict';
/**
 * @file Ferramentaria — cadastro de ferramentas/instrumentos e controle de
 * calibração: regras puras, sem I/O, testáveis com node:test
 * (test/ferramenta.test.js).
 *
 * Uma ferramenta tem um status operacional (disponível / em uso / em calibração
 * / inativa) e, quando é instrumento de medição (`requerCalibracao`), um
 * histórico de calibrações. A conformidade de calibração é derivada da validade
 * mais recente vs. uma data de referência (hoje, injetada pelo caller).
 *
 * Regras (definidas com o usuário em 2026-07-21):
 *  - BR-FERR-001: `proximaCalibracao(ultimaData, periodicidadeMeses)` — a
 *    próxima calibração vence em `ultimaData + periodicidadeMeses` meses. Sem
 *    última data válida → null. Periodicidade ausente/≤0 cai no padrão de 12
 *    meses. Ajusta o dia ao último dia do mês-alvo (31/jan + 1 mês → 28/29 fev).
 *  - BR-FERR-002: `situacaoCalibracao(validade, dataRef)` → 'vencida' se a
 *    validade já passou (ou é ausente/inválida — sem certificado válido não há
 *    conformidade), 'vencendo' se vence em ≤ 30 dias, senão 'em_dia'.
 *  - BR-FERR-003: `resumo(ferramentas, calibracoesPorFerramenta, dataRef)` —
 *    contagens por status operacional e, só para as que exigem calibração, por
 *    situação de calibração (em_dia / vencendo / vencida), usando a última
 *    calibração APROVADA de cada uma.
 */

/** Estados operacionais da ferramenta. */
const STATUS = ['disponivel', 'em_uso', 'em_calibracao', 'inativa'];
/** Resultados possíveis de uma calibração. */
const RESULTADOS = ['aprovado', 'reprovado'];
/** Dias de antecedência que marcam uma calibração como "vencendo". */
const DIAS_VENCENDO = 30;

const _STATUS = new Set(STATUS);
const _RESULTADOS = new Set(RESULTADOS);
const _MS_DIA = 86400000;

/** Normaliza um status desconhecido para 'disponivel'. */
function normalizarStatus(s) {
  return _STATUS.has(s) ? s : 'disponivel';
}
/** Normaliza um resultado desconhecido para 'aprovado'. */
function normalizarResultado(r) {
  return _RESULTADOS.has(r) ? r : 'aprovado';
}

/** Zero-pad a 2 dígitos. */
function _pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Extrai {y, m, d} de uma data 'YYYY-MM-DD' (aceita ISO com hora e Date).
 * @param {string|Date} v
 * @returns {{y:number, m:number, d:number} | null}
 */
function _parseYMD(v) {
  if (v == null || v === '') return null;
  let s;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    s = v.toISOString();
  } else {
    s = String(v);
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** Dias desde a época (UTC, meia-noite) de um {y,m,d}. */
function _daysUTC({ y, m, d }) {
  return Math.floor(Date.UTC(y, m - 1, d) / _MS_DIA);
}

/**
 * Próxima calibração (BR-FERR-001): última data + periodicidade em meses.
 * @param {string|Date} ultimaData        Data da última calibração.
 * @param {number} periodicidadeMeses     Meses entre calibrações (padrão 12).
 * @returns {string|null}                 'YYYY-MM-DD' ou null (sem data válida).
 */
function proximaCalibracao(ultimaData, periodicidadeMeses) {
  const u = _parseYMD(ultimaData);
  if (!u) return null;
  let n = parseInt(periodicidadeMeses, 10);
  if (!Number.isFinite(n) || n <= 0) n = 12;
  const total = u.m - 1 + n; // índice de mês a partir do início do ano
  const y = u.y + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12; // 0..11
  // Ajusta o dia ao último dia do mês-alvo (evita "31 de fevereiro").
  const ultimoDia = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(u.d, ultimoDia);
  return `${y}-${_pad(m + 1)}-${_pad(d)}`;
}

/**
 * Situação de calibração (BR-FERR-002) comparando a validade com dataRef.
 * Validade ausente/inválida → 'vencida' (sem certificado válido = não conforme).
 * @param {string|Date} validade
 * @param {string|Date} [dataRef]  Referência (padrão: hoje).
 * @returns {'em_dia'|'vencendo'|'vencida'}
 */
function situacaoCalibracao(validade, dataRef) {
  const v = _parseYMD(validade);
  if (!v) return 'vencida';
  const ref = _parseYMD(dataRef) || _parseYMD(new Date());
  const diff = _daysUTC(v) - _daysUTC(ref);
  if (diff < 0) return 'vencida';
  if (diff <= DIAS_VENCENDO) return 'vencendo';
  return 'em_dia';
}

/**
 * Última calibração APROVADA de uma ferramenta (a mais recente por data; empate
 * cai na maior validade). Calibrações reprovadas não contam como válidas.
 * @param {Array<object>} calibracoes
 * @returns {object|null}
 */
function ultimaCalibracao(calibracoes) {
  const lista = Array.isArray(calibracoes) ? calibracoes : [];
  let best = null;
  let bestKey = '';
  for (const c of lista) {
    if (!c) continue;
    if (normalizarResultado(c.resultado) === 'reprovado') continue;
    const key = `${String(c.data || '')}|${String(c.validade || '')}`;
    if (!best || key > bestKey) {
      best = c;
      bestKey = key;
    }
  }
  return best;
}

/**
 * Resumo do parque de ferramentas (BR-FERR-003).
 * @param {Array<object>} ferramentas               Cadastro (camelCase).
 * @param {Record<string, object[]>} calibracoesPorFerramenta  Mapa id → calibrações.
 * @param {string|Date} [dataRef]                   Referência (padrão: hoje).
 * @returns {{ total:number, porStatus:Record<string,number>, porSituacao:Record<string,number>, requerCalibracao:number }}
 */
function resumo(ferramentas, calibracoesPorFerramenta, dataRef) {
  const lista = Array.isArray(ferramentas) ? ferramentas : [];
  const mapa = calibracoesPorFerramenta && typeof calibracoesPorFerramenta === 'object'
    ? calibracoesPorFerramenta
    : {};
  const porStatus = { disponivel: 0, em_uso: 0, em_calibracao: 0, inativa: 0 };
  const porSituacao = { em_dia: 0, vencendo: 0, vencida: 0 };
  let requerCalibracao = 0;
  for (const f of lista) {
    porStatus[normalizarStatus(f && f.status)] += 1;
    if (f && f.requerCalibracao) {
      requerCalibracao += 1;
      const ult = ultimaCalibracao(mapa[f.id]);
      const validade = ult ? ult.validade : null;
      porSituacao[situacaoCalibracao(validade, dataRef)] += 1;
    }
  }
  return { total: lista.length, porStatus, porSituacao, requerCalibracao };
}

module.exports = {
  STATUS,
  RESULTADOS,
  DIAS_VENCENDO,
  normalizarStatus,
  normalizarResultado,
  proximaCalibracao,
  situacaoCalibracao,
  ultimaCalibracao,
  resumo,
};
