/**
 * Tipos do log de auditoria — porte de js/views/Auditoria.js e do handler
 * `handleGetAudit` (server.js).
 */

/** Um evento de auditoria (`GET /api/audit`). */
export interface AuditRow {
  id: string | number;
  ts: string;
  userId?: string;
  userEmail?: string;
  entity: string;
  entityId?: string;
  /** Nome amigável da entidade, gravado no momento do evento. */
  entityLabel?: string;
  action: string;
  /** Código HTTP do resultado da operação. */
  status: number;
  /** Corpo da requisição (POST/PUT). */
  body?: Record<string, unknown> | null;
  /** Estado anterior (em update/delete). */
  beforeState?: Record<string, unknown> | null;
  ip?: string;
}

/** Envelope de resposta de `GET /api/audit`. */
export interface AuditResponse {
  rows: AuditRow[];
  total: number;
}

/** Filtros aplicáveis à busca de eventos. */
export interface AuditFilters {
  user: string;
  entity: string;
  action: string;
  from: string;
  to: string;
}

/** Filtros vazios — estado inicial. */
export const EMPTY_FILTERS: AuditFilters = {
  user: '',
  entity: '',
  action: '',
  from: '',
  to: '',
};
