import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_RADIUS,
  PRESETS,
  STORAGE_KEY_COLOR,
  STORAGE_KEY_RADIUS,
  shade,
} from './presets';

/** Estado persistido do tema. null = usar o default do CSS. */
interface ThemeState {
  color: string | null;
  radius: number | null;
}

function readInitial(): ThemeState {
  let color: string | null = null;
  let radius: number | null = null;
  try {
    color = localStorage.getItem(STORAGE_KEY_COLOR);
  } catch {
    /* localStorage indisponível */
  }
  try {
    const r = localStorage.getItem(STORAGE_KEY_RADIUS);
    if (r != null) radius = parseInt(r, 10);
  } catch {
    /* idem */
  }
  return { color, radius };
}

function applyToRoot(color: string | null, radius: number | null): void {
  const root = document.documentElement.style;
  if (color) {
    root.setProperty('--color-primary', color);
    root.setProperty('--color-primary-light', shade(color, 0.15));
    root.setProperty('--color-primary-dark', shade(color, -0.2));
    root.setProperty('--sidebar-active-text', color);
    root.setProperty('--sidebar-active-bg', color + '14'); // 8% alpha
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', color);
  }
  if (radius != null) {
    root.setProperty('--border-radius', radius + 'px');
    root.setProperty('--border-radius-lg', radius * 1.6 + 'px');
  }
}

function clearRoot(): void {
  const root = document.documentElement.style;
  [
    '--color-primary',
    '--color-primary-light',
    '--color-primary-dark',
    '--sidebar-active-text',
    '--sidebar-active-bg',
    '--border-radius',
    '--border-radius-lg',
  ].forEach((p) => root.removeProperty(p));
}

/**
 * Hook do tema. Aplica as CSS vars no :root e persiste em localStorage.
 * Fiel ao js/themer.js — mesma chave, mesmos presets, mesmo cálculo.
 */
export function useTheme() {
  const [state, setState] = useState<ThemeState>(readInitial);

  // aplica em toda mudança (também no mount, dispensando o load() do antigo)
  useEffect(() => {
    applyToRoot(state.color, state.radius);
  }, [state.color, state.radius]);

  const setColor = useCallback((hex: string) => {
    try {
      localStorage.setItem(STORAGE_KEY_COLOR, hex);
    } catch {
      /* ignora quota/private mode */
    }
    setState((s) => ({ ...s, color: hex }));
  }, []);

  const setRadius = useCallback((radius: number) => {
    try {
      localStorage.setItem(STORAGE_KEY_RADIUS, String(radius));
    } catch {
      /* idem */
    }
    setState((s) => ({ ...s, radius }));
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY_COLOR);
      localStorage.removeItem(STORAGE_KEY_RADIUS);
    } catch {
      /* idem */
    }
    clearRoot();
    setState({ color: null, radius: null });
  }, []);

  return {
    color: state.color ?? PRESETS[0].hex,
    radius: state.radius ?? DEFAULT_RADIUS,
    isCustomColor: state.color != null,
    isCustomRadius: state.radius != null,
    setColor,
    setRadius,
    reset,
  };
}
