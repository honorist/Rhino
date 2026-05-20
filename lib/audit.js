/**
 * @file Auditoria — registra automaticamente toda mudança de dados.
 *
 * Captura POST/PUT/DELETE em `/api/*` (com exceções para auth e rotas
 * read-only) em `audit_log` com: usuário, IP, path, status, body sanitizado,
 * estado antes da mutação, e label amigável da entidade.
 *
 * Não loga GET (gera muito ruído) nem 5xx (poluiria com erros internos sem
 * mutação real).
 */

const db = require('../db');

/**
 * Paths excluídos do audit log — rotas de auth (logs vão para `security_events`
 * eventualmente) e leituras puras.
 * @type {string[]}
 */
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

/**
 * Extrai `entity` + `entityId` (+ ação especial) de um path REST.
 * Suporta sub-recursos: `/api/contracts/X/saidas/Y` → `{entity:'contracts.saidas', entityId:'Y'}`.
 *
 * @param {string} pathname
 * @returns {{ entity: string | null, entityId: string | null, action?: string }}
 */
function detectEntity(pathname) {
  const m = pathname.match(/^\/api\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?(?:\/([^/]+))?/);
  if (!m) return { entity: null, entityId: null };
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

/**
 * Mapeia HTTP method → verbo lógico. Aceita override via `special` (ex: 'pagar').
 *
 * @param {string} method
 * @param {string} [special]
 * @returns {string}
 */
function actionFromMethod(method, special) {
  if (special) return special;
  if (method === 'POST') return 'create';
  if (method === 'PUT') return 'update';
  if (method === 'DELETE') return 'delete';
  return method.toLowerCase();
}

/**
 * Sanitiza body antes de gravar: redacta campos sensíveis (senha, token) e
 * trunca strings longas (>500 chars). Retorna `null` se input não for objeto.
 *
 * @param {unknown} body
 * @returns {object | null}
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (/password|senha|token|secret/i.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 500) {
      out[k] = v.slice(0, 500) + '...[truncated]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Resolve um label amigável a partir de uma entidade arbitrária. Tenta campos
 * comuns por ordem de prioridade.
 *
 * @param {unknown} obj
 * @returns {string | null}
 */
function _resolveLabel(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return obj.nome || obj.name || obj.label || obj.descricao || obj.description ||
         obj.numero || obj.email || obj.tipoLabel || obj.tipo || null;
}

/**
 * Registra um evento de audit no banco. Falhas são silenciadas — auditoria
 * não pode quebrar a request principal.
 *
 * Expects req.user e req._auditBefore (capturado pelo middleware antes do handler).
 *
 * @param {{ req: object, res: object, body: unknown, status: number, durationMs: number, requestId: string }} params
 */
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

    // Estado antes da operação (capturado por middleware antes do handler)
    const before = req._auditBefore || null;
    // Nome amigável: prioridade pro que o handler setou; senão extrai do before; senão do body (POST).
    const label = req._auditEntityLabel || _resolveLabel(before) || _resolveLabel(sanitizeBody(body)) || null;

    await db.query(
      `INSERT INTO audit_log (user_id, user_email, ip, method, path, entity, entity_id, action, status, duration_ms, body, request_id, before_state, entity_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
        before ? JSON.stringify(sanitizeBody(before)) : null,
        label ? String(label).slice(0, 200) : null,
      ]
    );
  } catch (e) {
    // Falha silenciosa — auditoria não pode quebrar o app
    console.warn('[audit] falha ao registrar:', e.message);
  }
}

/**
 * Escapa metacaracteres ILIKE (`%`, `_`, `\`) para que filtros literais não
 * sejam interpretados como wildcards SQL. FIX P2-7 da security review.
 *
 * @param {string} s
 * @returns {string}
 */
function _escapeIlike(s) {
  return String(s).replace(/[%_\\]/g, c => '\\' + c);
}

/**
 * Lista eventos do audit log com filtros opcionais. Paginação por OFFSET
 * (TODO P1-4 da DB review: trocar por cursor para tabelas grandes).
 *
 * @param {{ user?: string, entity?: string, action?: string, from?: string, to?: string, limit?: number, offset?: number }} [filters]
 * @returns {Promise<{ rows: object[], total: number }>}
 */
async function listEvents({ user, entity, action, from, to, limit = 100, offset = 0 } = {}) {
  const conds = [];
  const vals = [];
  if (user)   { vals.push(`%${_escapeIlike(user)}%`); conds.push(`(user_email ILIKE $${vals.length} OR user_id = $${vals.length})`); }
  if (entity) { vals.push(entity);        conds.push(`entity = $${vals.length}`); }
  if (action) { vals.push(action);        conds.push(`action = $${vals.length}`); }
  if (from)   { vals.push(from);          conds.push(`ts >= $${vals.length}`); }
  if (to)     { vals.push(to);            conds.push(`ts <= $${vals.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  vals.push(limit); const limIdx = vals.length;
  vals.push(offset); const offIdx = vals.length;
  const rows = await db.getMany(
    `SELECT id, ts, user_id, user_email, ip, method, path, entity, entity_id, action, status, duration_ms, body, request_id, before_state, entity_label
     FROM audit_log ${where} ORDER BY ts DESC LIMIT $${limIdx} OFFSET $${offIdx}`,
    vals
  );
  const total = await db.getOne(`SELECT COUNT(*)::int AS n FROM audit_log ${where}`, vals.slice(0, conds.length));
  return { rows, total: total ? total.n : 0 };
}

module.exports = { log, listEvents };
