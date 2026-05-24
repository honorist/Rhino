/**
 * Escapa um valor para inserção segura em HTML.
 * Usado onde a inserção via string HTML é inevitável (ex.: popups do Leaflet,
 * que é uma API imperativa). No restante da app, prefira JSX.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
