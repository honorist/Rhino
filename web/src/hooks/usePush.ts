import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/ui/toast/ToastContext';
import { urlBase64ToUint8Array } from '../lib/pushUtils';

export type PushState = 'unsupported' | 'denied' | 'unsubscribed' | 'subscribed' | 'loading';

async function readState(): Promise<PushState> {
  if (!('PushManager' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'unsubscribed';
  } catch {
    return 'unsubscribed';
  }
}

/**
 * Hook que expõe estado e ações de Web Push.
 * Porte de js/push.js — mesma API /api/push/* (vapid-public-key, subscribe, unsubscribe).
 */
export function usePush() {
  const [state, setState] = useState<PushState>('loading');
  const toast = useToast();

  // Refresh inicial do estado real do navegador.
  useEffect(() => {
    let cancelled = false;
    readState().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.show('Seu navegador não suporta notificações push', 'warning');
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      toast.show('Permissão negada pelo usuário', 'warning');
      setState('denied');
      return false;
    }
    try {
      const keyResp = await fetch('/api/push/vapid-public-key');
      if (!keyResp.ok) throw new Error('Servidor não retornou VAPID key');
      const { publicKey } = (await keyResp.json()) as { publicKey?: string };
      if (!publicKey) throw new Error('Push não configurado no servidor');

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // PushManager exige BufferSource concreto; Uint8Array<ArrayBufferLike>
        // não casa por causa do generic em TS 5.7+.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
      const r = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!r.ok) throw new Error('Falha ao registrar subscription no servidor');
      setState('subscribed');
      toast.show('Notificações push ativadas!', 'success');
      return true;
    } catch (e) {
      toast.show('Erro ao ativar push: ' + ((e as Error).message || 'falha'), 'danger');
      return false;
    }
  }, [toast]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('unsubscribed');
      toast.show('Notificações desativadas', 'info');
      return true;
    } catch (e) {
      toast.show('Erro ao desativar push: ' + (e as Error).message, 'danger');
      return false;
    }
  }, [toast]);

  return { state, subscribe, unsubscribe };
}
