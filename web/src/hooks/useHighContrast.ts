import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

const KEY_CONTRAST = 'rhino-contrast';
const KEY_THEME = 'rhino-theme';

type Theme = 'light' | 'dark' | 'system';

/**
 * Liga/desliga o modo alto contraste. Adiciona a classe `high-contrast`
 * no <html> (em vez de <body>) para garantir que tokens Tailwind (declarados
 * em :root via @theme) sejam sobrescritos. Cobre tabelas, gráficos, mapas
 * e o resto da UI via CSS em layout.css.
 */
export function useHighContrast() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY_CONTRAST) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // <html> em vez de <body> — Tailwind v4 declara tokens em :root, então a
    // classe precisa estar acima na cascata para o `.high-contrast` ganhar.
    document.documentElement.classList.toggle('high-contrast', enabled);
    // Mantém compat com CSS legado que referencia .high-contrast no <body>.
    document.body.classList.toggle('high-contrast', enabled);
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(KEY_CONTRAST, '1');
        else localStorage.removeItem(KEY_CONTRAST);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { enabled, toggle };
}

// ─── Dark mode ─────────────────────────────────────────────────────────────

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY_THEME);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  root.classList.toggle('dark', resolved === 'dark');
  // Mantém atributo data-theme para CSS legado que possa depender dele.
  root.setAttribute('data-theme', resolved);
}

const mediaQuery =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function subscribeSystemTheme(callback: () => void): () => void {
  if (!mediaQuery) return () => undefined;
  mediaQuery.addEventListener('change', callback);
  return () => mediaQuery.removeEventListener('change', callback);
}

/**
 * Tema light/dark/system. Aplica a classe `.dark` no <html>, consumida pelo
 * @theme do tailwind.css. Reage a mudanças do sistema quando theme='system'.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => readTheme());

  const systemPrefersDark = useSyncExternalStore(
    subscribeSystemTheme,
    () => mediaQuery?.matches ?? false,
    () => false,
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme, systemPrefersDark]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(KEY_THEME, next);
    } catch {
      /* ignore */
    }
    setThemeState(next);
  }, []);

  const resolved: 'light' | 'dark' =
    theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;

  return { theme, resolved, setTheme };
}
