import { useEffect, useRef } from 'react';
import {
  clearAttempt,
  decideUpdate,
  readAttempt,
  writeAttempt,
} from '../lib/autoUpdate';

const CHECK_INTERVAL_MS = 60_000;
const INITIAL_DELAY_MS = 5_000;
const INPUT_TOLERANCE_MS = 120_000;

interface HealthResponse {
  version?: string;
}

async function purgeAndReload(serverVersion: string): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    } catch {
      /* ignore */
    }
  }
  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    } catch {
      /* ignore */
    }
  }
  const url = new URL(location.href);
  url.searchParams.set('_v', serverVersion);
  location.replace(url.toString());
}

/**
 * Auto-update silencioso: faz polling de /api/health e recarrega quando o
 * backend reporta versão diferente, respeitando proteção anti-loop e inputs
 * ativos. Porte da seção 1b de js/polish.js.
 *
 * @param loadedVersion versão carregada no boot (ex.: window.__APP_VERSION__).
 *                      Passar `undefined` ou `'dev'` desativa o hook.
 */
export function useAutoUpdate(loadedVersion: string | undefined): void {
  const lastInputAtRef = useRef<number>(Date.now());
  const updatingRef = useRef<boolean>(false);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!loadedVersion || loadedVersion === 'dev') return;

    const onInput = () => {
      lastInputAtRef.current = Date.now();
    };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        lastInputAtRef.current = Date.now();
      }
    };
    document.addEventListener('input', onInput, true);
    document.addEventListener('focusin', onFocusIn, true);

    function hasActiveInput(): boolean {
      const el = document.activeElement;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
      return Date.now() - lastInputAtRef.current < INPUT_TOLERANCE_MS;
    }

    async function applyUpgrade(serverVersion: string): Promise<void> {
      if (updatingRef.current) return;
      updatingRef.current = true;
      try {
        writeAttempt(serverVersion);
        await purgeAndReload(serverVersion);
      } catch (e) {
        console.error('[autoUpdate] falhou:', e);
        updatingRef.current = false;
      }
    }

    function tryApply(): void {
      const pending = pendingRef.current;
      if (!pending) return;
      if (hasActiveInput()) {
        // Adia 30s — usuário ainda digitando
        window.setTimeout(tryApply, 30_000);
        return;
      }
      void applyUpgrade(pending);
    }

    async function check(): Promise<void> {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (!r.ok) return;
        const data = (await r.json()) as HealthResponse;
        const decision = decideUpdate({
          loadedVersion: loadedVersion as string,
          serverVersion: data.version,
          lastAttempt: readAttempt(),
        });
        if (decision === 'idle') {
          clearAttempt();
          pendingRef.current = null;
          return;
        }
        if (decision === 'give_up') {
          console.warn(
            '[autoUpdate] já tentei pra v' +
              data.version +
              ' e a carregada continua ' +
              loadedVersion +
              ' — desistindo',
          );
          return;
        }
        // decision === 'apply'
        pendingRef.current = data.version ?? null;
        // Novo deploy desde a última tentativa fracassada? limpa marca
        if (readAttempt() && readAttempt() !== data.version) clearAttempt();
        tryApply();
      } catch {
        /* offline — silencioso */
      }
    }

    const initial = window.setTimeout(() => void check(), INITIAL_DELAY_MS);
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loadedVersion]);
}
