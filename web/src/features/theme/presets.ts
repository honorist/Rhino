/**
 * Presets e helpers do customizador de tema.
 * Fiel ao js/themer.js antigo. Mantido puro (sem DOM) para testabilidade.
 */

export interface ThemePreset {
  name: string;
  hex: string;
}

export const PRESETS: readonly ThemePreset[] = [
  { name: 'Slate Purple', hex: '#55588B' }, // padrão
  { name: 'Royal Blue', hex: '#3B5BDB' },
  { name: 'Teal', hex: '#0E9384' },
  { name: 'Forest', hex: '#2F855A' },
  { name: 'Sunset', hex: '#D97706' },
  { name: 'Crimson', hex: '#B91C1C' },
  { name: 'Magenta', hex: '#BE185D' },
  { name: 'Indigo', hex: '#4338CA' },
  { name: 'Ocean', hex: '#0369A1' },
  { name: 'Graphite', hex: '#374151' },
  { name: 'Olive', hex: '#65A30D' },
  { name: 'Plum', hex: '#7C3AED' },
] as const;

export const STORAGE_KEY_COLOR = 'rhino-theme-color';
export const STORAGE_KEY_RADIUS = 'rhino-theme-radius';

export const DEFAULT_RADIUS = 6;

/**
 * Clareia (pct>0) ou escurece (pct<0) uma cor hex. pct ∈ [-1, 1].
 * Idêntico ao shade() do themer.js antigo.
 */
export function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  const f = pct < 0 ? 0 : 255;
  const t = Math.abs(pct);
  r = Math.round((f - r) * t + r);
  g = Math.round((f - g) * t + g);
  b = Math.round((f - b) * t + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
