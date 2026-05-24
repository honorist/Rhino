import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { keysForEntity } from '../lib/realtimeMap';

/**
 * Cliente SSE para mutações em tempo real. Porte de js/realtime.js.
 *
 * Conecta em /api/stream, escuta os eventos:
 *  - `hello` (snapshot inicial de presença)
 *  - `presence` (lista de online)
 *  - `mutation` ({entity, action, id, by}) → invalida queries do react-query
 *
 * Auto-reconnect com backoff exponencial, pausa em background (visibilitychange)
 * e ignora ecos da própria sessão (mutações `by === myEmail`).
 *
 * @param myEmail e-mail da sessão atual (para filtrar ecos). null/undefined desabilita o filtro.
 */
export function useRealtime(myEmail: string | null | undefined): void {
  const qc = useQueryClient();
  // Mantém o e-mail num ref para que o handler não precise re-criar EventSource
  // a cada mudança.
  const meRef = useRef<string | null>(null);
  meRef.current = myEmail ?? null;

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    let es: EventSource | null = null;
    let backoff = 1000;
    let reconnectTimer: number | null = null;
    let visible = !document.hidden;
    let refreshTimer: number | null = null;

    const scheduleRefresh = (entity: string) => {
      const keys = keysForEntity(entity);
      if (keys.length === 0) return;
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      // Debounce — bursts viram um único invalidate.
      refreshTimer = window.setTimeout(() => {
        keys.forEach((k) => qc.invalidateQueries({ queryKey: k as unknown as readonly unknown[] }));
      }, 600);
    };

    const connect = () => {
      if (es) return;
      try {
        es = new EventSource('/api/stream', { withCredentials: false });
      } catch {
        schedule();
        return;
      }

      es.addEventListener('hello', () => {
        backoff = 1000;
      });

      es.addEventListener('mutation', (raw) => {
        const ev = raw as MessageEvent<string>;
        let m: { entity?: string; by?: string } | null;
        try {
          m = JSON.parse(ev.data) as { entity?: string; by?: string };
        } catch {
          return;
        }
        if (!m?.entity) return;
        if (m.by && meRef.current && m.by === meRef.current) return; // eco
        scheduleRefresh(m.entity);
      });

      es.onerror = () => {
        try {
          es?.close();
        } catch {
          /* ignore */
        }
        es = null;
        schedule();
      };
    };

    function schedule() {
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      backoff = Math.min(30_000, backoff * 2);
      reconnectTimer = window.setTimeout(() => {
        if (visible) connect();
      }, backoff);
    }

    const onVis = () => {
      visible = !document.hidden;
      if (visible) {
        backoff = 1000;
        connect();
      } else {
        try {
          es?.close();
        } catch {
          /* ignore */
        }
        es = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);

    connect();

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      try {
        es?.close();
      } catch {
        /* ignore */
      }
    };
  }, [qc]);
}
