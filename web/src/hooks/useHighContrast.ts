import { useCallback, useEffect, useState } from 'react';

const KEY = 'rhino-contrast';

/**
 * Liga/desliga o modo alto contraste. Adiciona/remove a classe
 * `high-contrast` no <body>, persistindo em localStorage.
 * Porte da seção 7 de js/polish.js.
 */
export function useHighContrast() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.body.classList.toggle('high-contrast', enabled);
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(KEY, '1');
        else localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { enabled, toggle };
}
