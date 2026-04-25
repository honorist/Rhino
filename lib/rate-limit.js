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

function clientKey(req, route) {
  const ip = req.socket?.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  return `${ip}::${route}`;
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
