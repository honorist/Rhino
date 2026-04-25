// Feriados nacionais BR + utilitários de dias úteis.
// Móveis (Carnaval/Páscoa/Corpus Christi) computados pelo algoritmo de Gauss/Meeus.

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

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toISO(date) {
  return date.toISOString().split('T')[0];
}

const _cache = new Map();

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

function isFeriado(date) {
  const d = (date instanceof Date) ? date : parseISO(date);
  if (!d) return false;
  const set = feriadosDoAno(d.getUTCFullYear());
  return set.has(toISO(d));
}

function parseISO(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

// Considera dia útil = não-fim-de-semana E não-feriado nacional.
function isDiaUtil(date) {
  const d = (date instanceof Date) ? date : parseISO(date);
  if (!d) return false;
  const dow = d.getUTCDay();        // 0 dom, 6 sáb
  if (dow === 0 || dow === 6) return false;
  return !isFeriado(d);
}

// Retorna a data ISO do último dia útil ANTERIOR a `ref` (default: hoje).
// Se hoje é seg/feriado/sáb/dom, volta dias até achar.
function ultimoDiaUtilAnterior(ref) {
  let d = ref ? parseISO(ref) || new Date(ref) : new Date();
  // Normaliza pra UTC midnight da data de hoje
  d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  do {
    d = addDays(d, -1);
  } while (!isDiaUtil(d));
  return toISO(d);
}

// Conta quantos dias úteis há entre `from` (exclusivo) e `to` (inclusivo).
// Ex: from=2026-04-23 (qui), to=2026-04-27 (seg) → 24(sex)+27(seg) = 2 dias úteis.
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

// Retorna os últimos N dias úteis a partir de `ref` (inclusivo se ref for útil).
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
