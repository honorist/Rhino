/* Rhino · F8 — Offline Mode
   Detecta conexão, exibe banner, persiste leituras em Cache API (via SW)
   e enfileira escritas (POST/PUT/DELETE) quando offline.
   Sync automático ao reconectar.
*/
(function () {
  'use strict';

  const QUEUE_KEY = 'rhino-offline-queue';
  let _online = navigator.onLine;
  let _syncing = false;

  // ── Banner de status de conexão ──
  function _upsertBanner() {
    let bar = document.getElementById('rh-offline-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rh-offline-bar';
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');
      bar.style.cssText = `
        position:fixed;bottom:0;left:0;right:0;z-index:9999;
        padding:10px 16px;font-size:15px;font-weight:600;
        display:flex;align-items:center;gap:10px;
        transition:transform .3s ease;
      `;
      document.body.appendChild(bar);
    }
    return bar;
  }

  function _showBanner(online) {
    const bar = _upsertBanner();
    if (online) {
      bar.style.background = '#065F46';
      bar.style.color = '#fff';
      bar.innerHTML = '✅ Conexão restaurada — sincronizando…';
      bar.style.transform = 'translateY(0)';
      setTimeout(() => { bar.style.transform = 'translateY(110%)'; }, 3000);
    } else {
      bar.style.background = '#991B1B';
      bar.style.color = '#fff';
      bar.innerHTML = '⚠️ Sem conexão — as alterações serão salvas quando a rede voltar.';
      bar.style.transform = 'translateY(0)';
    }
  }

  // ── Fila de requisições offline ──
  function _loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
  }

  function _saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
  }

  function _enqueue(method, url, body) {
    const q = _loadQueue();
    q.push({ method, url, body, ts: Date.now() });
    _saveQueue(q);
    if (window.RhinoUI?.toast) {
      RhinoUI.toast('Salvo offline — será enviado quando reconectar', { type: 'warn', duration: 3000 });
    }
  }

  async function _syncQueue() {
    if (_syncing || !_online) return;
    const q = _loadQueue();
    if (q.length === 0) return;
    _syncing = true;
    const failed = [];
    for (const item of q) {
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: item.body ? JSON.stringify(item.body) : undefined,
          credentials: 'same-origin',
        });
        if (!res.ok) failed.push(item);
      } catch {
        failed.push(item);
      }
    }
    _saveQueue(failed);
    _syncing = false;
    if (failed.length === 0 && window.RhinoUI?.toast) {
      RhinoUI.toast(`${q.length} alteração(ões) sincronizada(s)`, { type: 'success', duration: 2500 });
    }
    // Re-render current view after sync
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  // ── Intercepta fetch para mutações offline ──
  const _origFetch = window.fetch;
  window.fetch = function (input, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input.url || '';
    const isApiMutation = url.startsWith('/api/') && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

    if (!_online && isApiMutation) {
      let parsedBody = null;
      try { parsedBody = init.body ? JSON.parse(init.body) : null; } catch {}
      _enqueue(method, url, parsedBody);
      // Return fake success response
      return Promise.resolve(new Response(JSON.stringify({ ok: true, offline: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    }
    return _origFetch.apply(this, arguments);
  };

  // ── Event listeners ──
  window.addEventListener('online',  () => { _online = true;  _showBanner(true);  _syncQueue(); });
  window.addEventListener('offline', () => { _online = false; _showBanner(false); });

  // Sync ao carregar se havia fila pendente
  if (_online) _syncQueue();

  window.RhinoOffline = {
    isOnline: () => _online,
    getQueue: _loadQueue,
    clearQueue: () => _saveQueue([]),
    sync: _syncQueue,
  };
})();
