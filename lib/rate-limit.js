/**
 * @file Rate limiter em memória — token bucket por chave (IP + rota).
 *
 * Cada chave (`ip::rota`) tem um array de timestamps. Em `check()`, removemos
 * os timestamps fora da janela e bloqueamos se o número restante atingir
 * `max`. Funciona bem em deploys de instância única (Railway/Fly free tier);
 * para múltiplas instâncias, substituir por Redis/Valkey.
 *
 * Limitação conhecida (M-02 da security review): contadores não persistem
 * entre reinicializações; um atacante poderia forçar restart para resetar.
 * Para login, considere persistir em PG via tabela `login_attempts`.
 */

/** @type {Map<string, number[]>} timestamps por chave */
const buckets = new Map();

/**
 * Verifica se uma chave pode receber mais uma requisição na janela definida.
 *
 * @param {string} key  Chave única (ex: "192.0.2.1::POST /api/auth/login").
 * @param {{ max: number, windowMs: number }} opts
 * @returns {{ ok: boolean, limit: number, remaining: number, retryAfterSec?: number }}
 */
function check(key, { max, windowMs }) {
  const now = Date.now();
  let arr = buckets.get(key) || [];
  // Remove timestamps fora da janela
  arr = arr.filter(t => now - t < windowMs);
  if (arr.length >= max) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((arr[0] + windowMs - now) / 1000),
      limit: max,
      remaining: 0,
    };
  }
  arr.push(now);
  buckets.set(key, arr);
  return { ok: true, limit: max, remaining: max - arr.length };
}

// GC periódico — buckets sem atividade nos últimos 30 min são descartados,
// evitando crescimento ilimitado de memória em servidores long-running.
setInterval(() => {
  const now = Date.now();
  for (const [key, arr] of buckets.entries()) {
    const filtered = arr.filter(t => now - t < 30 * 60 * 1000); // mantém últimos 30 min
    if (filtered.length === 0) buckets.delete(key);
    else buckets.set(key, filtered);
  }
}, 5 * 60 * 1000).unref();

/**
 * Flag TRUST_PROXY — quando ligada, lê o IP real do header X-Forwarded-For
 * (necessário atrás de Caddy/Nginx/Cloudflare). Por padrão, lê só
 * `socket.remoteAddress` para evitar spoof via header em deploys diretos.
 *
 * @type {boolean}
 */
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';

/**
 * Extrai o IP do cliente respeitando a flag TRUST_PROXY.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {string}  IP do cliente, ou 'unknown' se indisponível.
 */
function _clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) {
      const first = xff.split(',')[0].trim();
      if (first) return first;
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Gera a chave do bucket combinando IP do cliente + rota lógica.
 *
 * @param {import('http').IncomingMessage} req
 * @param {string} route  Identificador da rota (ex: 'login', 'foto-upload:user-123').
 * @returns {string}
 */
function clientKey(req, route) {
  return `${_clientIp(req)}::${route}`;
}

/**
 * Remove o último slot registrado para uma chave — usado para não punir
 * uma tentativa que se confirmou legítima (ex: login que deu certo).
 *
 * @param {string} key
 */
function refund(key) {
  const arr = buckets.get(key);
  if (arr && arr.length) {
    arr.pop();
    buckets.set(key, arr);
  }
}

module.exports = { check, clientKey, refund };
