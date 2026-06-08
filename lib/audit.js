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
 * Prefixos de path ignorados — ruído de UI sem valor de auditoria (ex: marcar
 * notificação como lida). Casados por `startsWith`.
 * @type {string[]}
 */
const SKIP_PREFIXES = [
  '/api/notificacoes',
];

/**
 * Verbos de ação que aparecem como ÚLTIMO segmento de uma rota mutante
 * (ex: `/api/contas-pagar/:id/pagar`, `/api/solicitacoes-compra/:id/aprovar`).
 * Quando presente, vira a `action` do log no lugar do verbo do método HTTP.
 * @type {Set<string>}
 */
const SPECIAL_ACTIONS = new Set([
  'pagar', 'estornar', 'emitir', 'cancelar-emissao', 'passagem',
  'aprovar', 'rejeitar', 'avaliar', 'comprar', 'receber', 'cancelar',
  'enviar', 'aceitar', 'duplicar', 'retorno', 'allocate', 'triagem',
  'antecedentes', 'gerar', 'limpar', 'processar-recorrencias',
]);

/**
 * Segmentos que indicam um SUB-recurso de uma entidade pai
 * (ex: `/api/contracts/:id/saidas/:sid` → entidade `contracts.saidas`).
 * @type {Set<string>}
 */
const SUBRESOURCES = new Set([
  'saidas', 'budget', 'organograma', 'rdos', 'folgas', 'documentos', 'fotos',
  'aditivos', 'marcos', 'ocorrencias', 'custos', 'anexos',
  'planos', 'manutencoes', 'abastecimentos', 'itens',
]);

/**
 * Namespaces compostos: o 1º segmento é só agrupador e a entidade real é o 2º
 * (ex: `/api/recrutamento/candidatos/:id` → entidade `candidatos`).
 * @type {Set<string>}
 */
const NAMESPACES = new Set(['recrutamento']);

/**
 * Extrai `entity` + `entityId` (+ ação especial) de um path REST, cobrindo:
 *  - raiz: `/api/clientes/:id` → `{entity:'clientes', entityId:':id'}`
 *  - sub-recurso: `/api/contracts/:id/saidas/:sid` → `{entity:'contracts.saidas', entityId:':sid'}`
 *  - ação especial: `/api/contas-pagar/:id/pagar` → `{entity:'contas-pagar', entityId:':id', action:'pagar'}`
 *  - operação de coleção: `/api/folha-pagamento/gerar` → `{entity:'folha-pagamento', entityId:null, action:'gerar'}`
 *  - namespace composto: `/api/recrutamento/candidatos/:id` → `{entity:'candidatos', entityId:':id'}`
 *
 * @param {string} pathname
 * @returns {{ entity: string | null, entityId: string | null, action?: string }}
 */
function detectEntity(pathname) {
  const segs = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  if (segs.length === 0) return { entity: null, entityId: null };

  // 1) Ação especial = último segmento reconhecido como verbo.
  let action;
  if (segs.length >= 2 && SPECIAL_ACTIONS.has(segs[segs.length - 1])) {
    action = segs.pop();
  }

  // Caso especial: compra de passagem pertence a uma folga, mas o que importa
  // no histórico é o COLABORADOR — resolve nome via id do recurso (raiz).
  if (action === 'passagem' && segs[0] === 'recursos') {
    return { entity: 'recursos', entityId: segs[1] || null, action };
  }

  // 2) Namespace composto (recrutamento/candidatos/:id → entidade `candidatos`).
  if (NAMESPACES.has(segs[0]) && segs.length >= 2) {
    return { entity: segs[1], entityId: segs[2] || null, action };
  }

  // 3) Sub-recurso (contracts/:id/saidas/:sid → `contracts.saidas`).
  if (segs.length >= 3 && SUBRESOURCES.has(segs[2])) {
    return { entity: `${segs[0]}.${segs[2]}`, entityId: segs[3] || segs[1], action };
  }

  // 4) Entidade raiz (clientes/:id) ou operação de coleção (verbo já removido).
  return { entity: segs[0], entityId: segs[1] || null, action };
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
  if (method === 'PUT' || method === 'PATCH') return 'update';
  if (method === 'DELETE') return 'delete';
  return method.toLowerCase();
}

/**
 * Sanitiza body/estado antes de gravar: redacta campos sensíveis (senha, token,
 * hash) e trunca strings longas (>500 chars). RECURSIVO (objetos e arrays
 * aninhados) com limite de profundidade — sem isso, `{ user: { senha } }`
 * vazaria a senha aninhada. Retorna `null` se input de topo não for objeto.
 *
 * @param {unknown} body
 * @param {number} [_depth]  Controle interno de recursão.
 * @returns {object | array | string | null}
 */
function sanitizeBody(body, _depth = 0) {
  if (!body || typeof body !== 'object') return _depth === 0 ? null : body;
  if (_depth > 4) return Array.isArray(body) ? '[…]' : '{…}';
  if (Array.isArray(body)) {
    return body.slice(0, 100).map((v) => (v && typeof v === 'object') ? sanitizeBody(v, _depth + 1) : v);
  }
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (/password|senha|token|secret|hash|cpf|cnpj|card_?number|api_?key/i.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 500) {
      out[k] = v.slice(0, 500) + '...[truncated]';
    } else if (v && typeof v === 'object') {
      out[k] = sanitizeBody(v, _depth + 1);
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
async function log({ req, body, status, durationMs, requestId }) {
  try {
    const pathname = (req._parsedUrl && req._parsedUrl.pathname) || (req.url || '').split('?')[0];
    if (!pathname.startsWith('/api/')) return;
    if (SKIP_PATHS.includes(pathname)) return;
    if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) return;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
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
async function listEvents({ user, entity, action, from, to, errorsOnly, limit = 100, offset = 0 } = {}) {
  const conds = [];
  const whereVals = [];
  if (user) {
    // FIX: email usa ILIKE (com %), mas user_id é igualdade exata — antes os dois
    // compartilhavam o mesmo placeholder `%...%`, então o filtro por id nunca casava.
    whereVals.push(`%${_escapeIlike(user)}%`);
    const ilikeIdx = whereVals.length;
    whereVals.push(user);
    conds.push(`(user_email ILIKE $${ilikeIdx} OR user_id = $${whereVals.length})`);
  }
  if (entity)     { whereVals.push(entity); conds.push(`entity = $${whereVals.length}`); }
  if (action)     { whereVals.push(action); conds.push(`action = $${whereVals.length}`); }
  if (from)       { whereVals.push(from);   conds.push(`ts >= $${whereVals.length}`); }
  if (to)         { whereVals.push(to);     conds.push(`ts <= $${whereVals.length}`); }
  if (errorsOnly) { conds.push(`status >= 400`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await db.getMany(
    `SELECT id, ts, user_id, user_email, ip, method, path, entity, entity_id, action, status, duration_ms, body, request_id, before_state, entity_label
     FROM audit_log ${where} ORDER BY ts DESC LIMIT $${whereVals.length + 1} OFFSET $${whereVals.length + 2}`,
    [...whereVals, limit, offset]
  );
  const total = await db.getOne(`SELECT COUNT(*)::int AS n FROM audit_log ${where}`, whereVals);
  return { rows, total: total ? total.n : 0 };
}

/**
 * Mascara campos sensíveis (cpf, cnpj, senha, token, card_number, api_key…) na
 * LEITURA, antes de devolver ao cliente — garante que PII nunca saia em claro,
 * nem no diff nem no JSON cru (DoD da auditoria). Só mascara valores NÃO-nulos.
 * Cobre linhas legadas que foram gravadas antes do sanitizeBody redactar CPF.
 *
 * @param {unknown} obj
 * @param {number} [_depth]
 * @returns {unknown}
 */
const _SENSITIVE_RE = /password|senha|token|secret|hash|cpf|cnpj|card_?number|api_?key/i;
function maskSensitive(obj, _depth = 0) {
  if (!obj || typeof obj !== 'object' || _depth > 5) return obj;
  if (Array.isArray(obj)) {
    return obj.map((v) => (v && typeof v === 'object') ? maskSensitive(v, _depth + 1) : v);
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (_SENSITIVE_RE.test(k) && v !== null && v !== undefined && v !== '') {
      out[k] = '***';
    } else if (v && typeof v === 'object') {
      out[k] = maskSensitive(v, _depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

module.exports = { log, listEvents, detectEntity, sanitizeBody, maskSensitive };
