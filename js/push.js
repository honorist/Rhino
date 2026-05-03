/* Rhino · Push Notifications
   Gerencia permissão, subscription e sincronização com o servidor.
   Expõe window.RhinoPush para uso em Configuracao.js.
*/
(function () {
  'use strict';

  const PUSH_KEY = 'rhino-push-enabled';

  function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
  }

  async function _getVapidKey() {
    const r = await fetch('/api/push/vapid-public-key');
    if (!r.ok) throw new Error('Servidor não retornou VAPID key');
    const { publicKey } = await r.json();
    if (!publicKey) throw new Error('Push não configurado no servidor');
    return publicKey;
  }

  async function subscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      window.showToast('Seu navegador não suporta notificações push', 'warning');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      window.showToast('Permissão negada pelo usuário', 'warning');
      return false;
    }

    try {
      const vapidKey = await _getVapidKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(vapidKey),
      });

      const r = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!r.ok) throw new Error('Falha ao registrar subscription no servidor');

      localStorage.setItem(PUSH_KEY, '1');
      window.showToast('Notificações push ativadas!', 'success');
      return true;
    } catch (e) {
      window.showToast('Erro ao ativar push: ' + (e.message || 'falha'), 'error');
      return false;
    }
  }

  async function unsubscribe() {
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
      localStorage.removeItem(PUSH_KEY);
      window.showToast('Notificações desativadas', 'info');
      return true;
    } catch (e) {
      window.showToast('Erro ao desativar push: ' + e.message, 'error');
      return false;
    }
  }

  async function getState() {
    if (!('PushManager' in window) || !('serviceWorker' in navigator)) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return sub ? 'subscribed' : 'unsubscribed';
    } catch {
      return 'unsubscribed';
    }
  }

  // Escuta mensagens do SW para navegação
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NAVIGATE' && event.data?.url) {
        location.hash = event.data.url.replace(/^.*#/, '#');
      }
    });
  }

  window.RhinoPush = { subscribe, unsubscribe, getState };
})();
