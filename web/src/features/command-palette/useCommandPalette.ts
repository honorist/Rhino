import { useCallback, useEffect, useState } from 'react';

/**
 * Controller do CommandPalette: gerencia open/close + atalhos globais
 * (Ctrl/Cmd+K em qualquer lugar; "/" quando não estiver digitando).
 *
 * Também escuta o evento custom `rh:open-command-palette` para que
 * BottomNav (mobile) possa disparar via Buscar.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      // Ctrl/Cmd+K
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault();
        setOpen(true);
        return;
      }
      // "/" — só quando não estiver focado em input/textarea/select
      if (k === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = document.activeElement as HTMLElement | null;
        const tag = el?.tagName?.toLowerCase();
        if (
          tag !== 'input' &&
          tag !== 'textarea' &&
          tag !== 'select' &&
          !el?.isContentEditable
        ) {
          e.preventDefault();
          setOpen(true);
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Evento custom para abrir externamente (ex.: botão Buscar do BottomNav).
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('rh:open-command-palette', onOpen);
    return () => window.removeEventListener('rh:open-command-palette', onOpen);
  }, []);

  return { open, show, hide };
}
