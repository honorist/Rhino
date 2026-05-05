// Rate limiter em memória — buckets por chave (ip+rota).
// Em produção com múltiplas instâncias, troque por Redis. Para 1 instância (Railway/Fly free), serve.
const buckets = new Map();

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

// Limpa entradas antigas a cada 5 min pra não vazar memória
setInterval(() => {
  const now = Date.now();
  for (const [key, arr] of buckets.entries()) {
    const filtered = arr.filter(t => now - t < 30 * 60 * 1000); // mantém últimos 30 min
    if (filtered.length === 0) buckets.delete(key);
    else buckets.set(key, filtered);
  }
}, 5 * 60 * 1000).unref();

// TRUST_PROXY=1 (Railway, Fly, atrás de Caddy/Nginx) → confia em X-Forwarded-For
// (último hop é o proxy; pegamos o IP mais à esquerda como cliente real).
// Default desligado: lê só socket.remoteAddress, evitando spoof via header.
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';

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

function clientKey(req, route) {
  return `${_clientIp(req)}::${route}`;
}

// Devolve o último slot registrado (usado pra não punir login bem sucedido).
function refund(key) {
  const arr = buckets.get(key);
  if (arr && arr.length) {
    arr.pop();
    buckets.set(key, arr);
  }
}

module.exports = { check, clientKey, refund };
