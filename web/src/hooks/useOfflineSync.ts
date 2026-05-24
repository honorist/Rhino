import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useToast } from '../components/ui/toast/ToastContext';
import { enqueueRequest, isApiMutation, syncQueue } from '../lib/offlineQueue';
import { useOnline } from './useOnline';

/**
 * Instrumenta o fetch global para enfileirar mutações quando offline,
 * dispara o sync ao reconectar e invalida o cache do react-query após drenar.
 *
 * Deve ser usado uma única vez, no Shell. O `useOnline` interno garante
 * re-render ao mudar de estado para que o banner reflita o status.
 */
export function useOfflineSync(): boolean {
  const online = useOnline();
  const qc = useQueryClient();
  const toast = useToast();

  // Patch do fetch global — instala uma vez por mount, restaura ao desmontar
  useEffect(() => {
    const original = window.fetch;
    window.fetch = function patchedFetch(input, init = {}) {
      const method = (init?.method || 'GET').toUpperCase();
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (!navigator.onLine && isApiMutation(method, url)) {
        let parsed: unknown = null;
        try {
          parsed = init?.body ? JSON.parse(String(init.body)) : null;
        } catch {
          /* corpo não-JSON é ignorado no replay */
        }
        enqueueRequest(method, url, parsed);
        toast.show('Salvo offline — será enviado quando reconectar', 'warning');
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, offline: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return original.apply(this, [input, init] as Parameters<typeof fetch>);
    };
    return () => {
      window.fetch = original;
    };
  }, [toast]);

  // Drena a fila ao reconectar e quando o app inicia online
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      const { sent } = await syncQueue();
      if (cancelled) return;
      if (sent > 0) {
        toast.show(`${sent} alteração(ões) sincronizada(s)`, 'success');
        // recarrega tudo — pareia com o hashchange do antigo
        qc.invalidateQueries();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, qc, toast]);

  return online;
}
