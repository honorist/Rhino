/**
 * Cálculo de diff entre estados e formatação de valores — núcleo testável da
 * tela de Auditoria. Porte de `_computeDiff` / `_fmtVal` de Auditoria.js.
 */

/** Um campo que mudou entre dois estados. */
export interface FieldDiff {
  key: string;
  before: unknown;
  after: unknown;
}

/** Campos ignorados ao comparar estados (timestamps, ids internos). */
const SKIP_KEYS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'created_at',
  'updated_at',
  'metadata',
]);

/**
 * Compara `before` (estado anterior) com `after` (corpo da requisição) e
 * devolve os campos que mudaram. Compara via JSON para cobrir objetos/arrays.
 */
export function computeDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): FieldDiff[] {
  if (!before || !after) return [];
  const diffs: FieldDiff[] = [];
  for (const key of Object.keys(after)) {
    if (SKIP_KEYS.has(key)) continue;
    const a = after[key];
    const b = before[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      diffs.push({ key, before: b, after: a });
    }
  }
  return diffs;
}

/** Formata um valor para exibição num diff (data, número, booleano, etc). */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') {
    if (Number.isFinite(value) && Math.abs(value) >= 1) {
      return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    }
    return String(value);
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
    }
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }
  if (Array.isArray(value)) {
    return `[${value.length} ${value.length === 1 ? 'item' : 'itens'}]`;
  }
  if (typeof value === 'object') return '{...}';
  return String(value);
}

/** Campos ocultados ao listar o snapshot de um registro excluído. */
const SNAPSHOT_HIDDEN = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'created_at',
  'updated_at',
  'metadata',
  'documentos',
  'folgas',
  'budget',
]);

/** Entradas visíveis de um objeto (sem campos internos nem valores vazios). */
export function visibleEntries(
  obj: Record<string, unknown> | null | undefined,
  hidden: Set<string> = SNAPSHOT_HIDDEN,
): [string, unknown][] {
  if (!obj) return [];
  return Object.entries(obj).filter(
    ([k, v]) => !hidden.has(k) && v !== null && v !== undefined && v !== '',
  );
}

/** Campos ocultados ao listar os dados informados numa criação. */
export const CREATE_HIDDEN = new Set(['id', 'createdAt', 'updatedAt']);
