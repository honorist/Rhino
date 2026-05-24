/**
 * Helpers de data — porte dos `_fmtDate` / `_hoje` espalhados pelas views
 * do app antigo.
 */

/** Converte uma data ISO (`YYYY-MM-DD...`) em `DD/MM/YYYY`. `—` se inválida. */
export function formatDateBR(value?: string | null): string {
  if (!value) return '—';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** Data de hoje no formato ISO (`YYYY-MM-DD`). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
