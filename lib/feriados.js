/**
 * @file Feriados nacionais BR + utilitários de dias úteis.
 *
 * Os feriados móveis (Carnaval, Sexta-Feira Santa, Corpus Christi) são
 * derivados da Páscoa via algoritmo de Gauss/Meeus. Os fixos são hardcoded.
 * Resultados por ano são cacheados em `_cache` (Map) — primeiro acesso ao ano
 * computa, demais reutilizam.
 *
 * Todas as datas são manipuladas em UTC para evitar bugs de DST (no Brasil
 * o horário de verão foi extinto em 2019, mas mantemos UTC por consistência).
 */

/**
 * Calcula a data da Páscoa para um ano usando o algoritmo de Gauss/Meeus.
 *
 * @param {number} year
 * @returns {Date}  Data UTC da Páscoa naquele ano.
 */
function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Adiciona N dias a uma data, em UTC. Aceita N negativo para subtrair.
 *
 * @param {Date} date
 * @param {number} days
 * @returns {Date}
 */
function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Converte Date para string ISO `YYYY-MM-DD` (UTC).
 *
 * @param {Date} date
 * @returns {string}
 */
function toISO(date) {
  return date.toISOString().split('T')[0];
}

/** @type {Map<number, Set<string>>}  Cache: ano → set de ISO strings dos feriados. */
const _cache = new Map();

/**
 * Retorna o conjunto de feriados nacionais (ISO string) para um ano.
 * Inclui fixos: Confraternização (01/01), Tiradentes (21/04), Trabalho (01/05),
 * Independência (07/09), Aparecida (12/10), Finados (02/11), República (15/11),
 * Consciência Negra (20/11, federal desde 2024), Natal (25/12).
 * Móveis derivados da Páscoa: Segunda/Terça de Carnaval, Sexta Santa, Corpus Christi.
 *
 * @param {number} year
 * @returns {Set<string>}
 */
function feriadosDoAno(year) {
  if (_cache.has(year)) return _cache.get(year);
  const easter = easterDate(year);
  const fixed = [
    `${year}-01-01`, // Confraternização Universal
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalho
    `${year}-09-07`, // Independência
    `${year}-10-12`, // Nossa Senhora Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-11-20`, // Consciência Negra
    `${year}-12-25`, // Natal
  ];
  const moveis = [
    toISO(addDays(easter, -48)), // Segunda de Carnaval
    toISO(addDays(easter, -47)), // Terça de Carnaval
    toISO(addDays(easter, -2)),  // Sexta-Feira Santa
    toISO(addDays(easter, 60)),  // Corpus Christi
  ];
  const set = new Set([...fixed, ...moveis]);
  _cache.set(year, set);
  return set;
}

/**
 * @param {Date | string} date  Date ou string ISO `YYYY-MM-DD`.
 * @returns {boolean}
 */
function isFeriado(date) {
  const d = (date instanceof Date) ? date : parseISO(date);
  if (!d) return false;
  const set = feriadosDoAno(d.getUTCFullYear());
  return set.has(toISO(d));
}

/**
 * Parseia string ISO `YYYY-MM-DD` em Date UTC. Retorna `null` para input
 * inválido (mais robusto que `new Date()` que daria Invalid Date).
 *
 * @param {string | null | undefined} s
 * @returns {Date | null}
 */
function parseISO(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/**
 * Dia útil = não-fim-de-semana E não-feriado nacional. Não considera
 * feriados municipais/estaduais (futuro: tabela `feriados_locais`).
 *
 * @param {Date | string} date
 * @returns {boolean}
 */
function isDiaUtil(date) {
  const d = (date instanceof Date) ? date : parseISO(date);
  if (!d) return false;
  const dow = d.getUTCDay(); // 0 dom, 6 sáb
  if (dow === 0 || dow === 6) return false;
  return !isFeriado(d);
}

/**
 * Retorna a data ISO do último dia útil ANTERIOR a `ref` (default: hoje).
 * Se hoje é seg/feriado/sáb/dom, volta dias até achar.
 *
 * @param {string} [ref]
 * @returns {string}
 */
function ultimoDiaUtilAnterior(ref) {
  let d = ref ? parseISO(ref) || new Date(ref) : new Date();
  // Normaliza pra UTC midnight da data de hoje
  d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  do {
    d = addDays(d, -1);
  } while (!isDiaUtil(d));
  return toISO(d);
}

/**
 * Conta quantos dias úteis há entre `from` (exclusivo) e `to` (inclusivo).
 * Ex: from=2026-04-23 (qui), to=2026-04-27 (seg) → 24(sex)+27(seg) = 2 dias úteis.
 *
 * @param {string} from  ISO date.
 * @param {string} to    ISO date.
 * @returns {number}
 */
function diasUteisEntre(from, to) {
  const a = parseISO(from);
  const b = parseISO(to);
  if (!a || !b || a >= b) return 0;
  let count = 0;
  let d = addDays(a, 1);
  while (d <= b) {
    if (isDiaUtil(d)) count++;
    d = addDays(d, 1);
  }
  return count;
}

/**
 * Retorna os últimos N dias úteis a partir de `ref` (inclusivo se ref for útil).
 * Útil para janelas móveis tipo "últimos 30 dias úteis".
 *
 * @param {number} n
 * @param {string} [ref]
 * @returns {string[]}  Datas ISO em ordem decrescente.
 */
function ultimosNDiasUteis(n, ref) {
  let d = ref ? parseISO(ref) || new Date(ref) : new Date();
  d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const out = [];
  while (out.length < n) {
    if (isDiaUtil(d)) out.push(toISO(d));
    d = addDays(d, -1);
  }
  return out;
}

module.exports = {
  easterDate,
  feriadosDoAno,
  isFeriado,
  isDiaUtil,
  ultimoDiaUtilAnterior,
  diasUteisEntre,
  ultimosNDiasUteis,
  toISO,
  parseISO,
};
