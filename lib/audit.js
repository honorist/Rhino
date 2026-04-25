// Auditoria — registra automaticamente toda mudança de dados (POST/PUT/DELETE em /api/*)
// Não loga: GET, /api/auth/*, /api/health, /api/metrics, /api/audit
const db = require('../db');

const SKIP_PATHS = [
  '/api/health',
  '/api/metrics',
  '/api/audit',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/accept-terms',
];

// Map de path → entity (extrai entidade do path)
function detectEntity(pathname) {
  const m = pathname.match(/^\/api\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?(?:\/([^/]+))?/);
  if (!m) return { entity: null, entityId: null };
  // Casos especiais com sub-recursos
  if (m[3] === 'saidas' || m[3] === 'budget' || m[3] === 'organograma' || m[3] === 'rdos') {
    return { entity: `${m[1]}.${m[3]}`, entityId: m[4] || m[2] };
  }
  if (m[3] === 'folgas' || m[3] === 'documentos' || m[3] === 'fotos') {
    return { entity: `${m[1]}.${m[3]}`, entityId: m[4] || m[2] };
  }
  if (m[3] === 'pagar' || m[3] === 'estornar' || m[3] === 'emitir' || m[3] === 'cancelar-emissao' || m[3] === 'passagem') {
    return { entity: m[1], entityId: m[2], action: m[3] };
  }
  return { entity: m[1], entityId: m[2] || null };
}

function actionFromMethod(method, special) {
  if (special) return special;
  if (method === 'POST') return 'create';
  if (method === 'PUT') return 'update';
  if (method === 'DELETE') return 'delete';
  return method.toLowerCase();
}

// Sanitiza body — remove senhas e limita tamanho
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (/^password|senha|token$/i.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 500) {
      out[k] = v.slice(0, 500) + '...[truncated]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function log({ req, res, body, status, durationMs, requestId }) {
  try {
    const pathname = (req._parsedUrl && req._parsedUrl.pathname) || (req.url || '').split('?')[0];
    if (!pathname.startsWith('/api/')) return;
    if (SKIP_PATHS.includes(pathname)) return;
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return;
    if (status >= 500) return; // não polui com erros internos

    const { entity, entityId, action: special } = detectEntity(pathname);
    const action = actionFromMethod(req.method, special);
    const ip = req.socket?.remoteAddress || (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || null;

    await db.query(
      `INSERT INTO audit_log (user_id, user_email, ip, method, path, entity, entity_id, action, status, duration_ms, body, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        req.user?.id || null,
        req.user?.email || null,
        ip,
        req.method,
        pathname,
        entity,
        entityId,
        action,
        status,
        durationMs,
        JSON.stringify(sanitizeBody(body)),
        requestId,
      ]
    );
  } catch (e) {
    // Falha silenciosa — auditoria não pode quebrar o app
    console.warn('[audit] falha ao registrar:', e.message);
  }
}

async function listEvents({ user, entity, action, from, to, limit = 100, offset = 0 } = {}) {
  const conds = [];
  const vals = [];
  if (user)   { vals.push(`%${user}%`);   conds.push(`(user_email ILIKE $${vals.length} OR user_id = $${vals.length})`); }
  if (entity) { vals.push(entity);        conds.push(`entity = $${vals.length}`); }
  if (action) { vals.push(action);        conds.push(`action = $${vals.length}`); }
  if (from)   { vals.push(from);          conds.push(`ts >= $${vals.length}`); }
  if (to)     { vals.push(to);            conds.push(`ts <= $${vals.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  vals.push(limit); const limIdx = vals.length;
  vals.push(offset); const offIdx = vals.length;
  const rows = await db.getMany(
    `SELECT id, ts, user_id, user_email, ip, method, path, entity, entity_id, action, status, duration_ms, body, request_id
     FROM audit_log ${where} ORDER BY ts DESC LIMIT $${limIdx} OFFSET $${offIdx}`,
    vals
  );
  const total = await db.getOne(`SELECT COUNT(*)::int AS n FROM audit_log ${where}`, vals.slice(0, conds.length));
  return { rows, total: total ? total.n : 0 };
}

module.exports = { log, listEvents };
