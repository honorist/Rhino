/* Rhino · Realtime cliente (SSE)
   Conecta em /api/stream e dispara CustomEvent('rh:mutation') quando alguém
   muda algo no servidor. As views podem ouvir e re-renderizar.

   Eventos disparados:
     window 'rh:mutation' { entity, action, id, by }
     window 'rh:presence' { online: [{userId, userEmail, since}, ...] }
     window 'rh:hello'    { id, online }

   Auto-reconnect com backoff exponencial.
*/
(function () {
  'use strict';

  if (!('EventSource' in window)) return;

  let es = null;
  let backoff = 1000;
  let reconnectTimer = null;
  let visible = !document.hidden;
  let myEmail = null;

  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function connect() {
    if (es) return;
    try {
      es = new EventSource('/api/stream', { withCredentials: false });
    } catch {
      schedule();
      return;
    }

    es.addEventListener('hello', (e) => {
      backoff = 1000;
      try { dispatch('rh:hello', JSON.parse(e.data)); } catch (err) { console.warn('[realtime] hello parse error', err); }
    });

    es.addEventListener('presence', (e) => {
      try { dispatch('rh:presence', JSON.parse(e.data)); } catch (err) { console.warn('[realtime] presence parse error', err); }
    });

    es.addEventListener('mutation', (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      dispatch('rh:mutation', m);
    });

    es.onerror = () => {
      try { es.close(); } catch {}
      es = null;
      schedule();
    };
  }

  function schedule() {
    clearTimeout(reconnectTimer);
    backoff = Math.min(30_000, backoff * 2);
    reconnectTimer = setTimeout(() => { if (visible) connect(); }, backoff);
  }

  // Pausa em background, retoma ao voltar
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) {
      backoff = 1000;
      connect();
    } else {
      try { es && es.close(); } catch {}
      es = null;
    }
  });

  // Inicia depois que auth carregou (espera até ter user)
  function start() {
    const u = window.auth && window.auth.user && window.auth.user();
    if (!u) {
      setTimeout(start, 800);
      return;
    }
    myEmail = u.email || null;
    connect();
  }
  setTimeout(start, 1500);

  // ─── Re-render automático da view ativa quando uma mutação chega ───
  // Mapeia entidade do API → método de refresh.
  const VIEW_BY_ENTITY = {
    contracts:           () => /^#\/contratos/.test(location.hash),
    clientes:            () => location.hash === '#/clientes',
    fornecedores:        () => location.hash === '#/fornecedores',
    'contas-pagar':      () => location.hash === '#/contas-pagar',
    'notas-fiscais':     () => location.hash === '#/notas-fiscais',
    caixa:               () => location.hash === '#/caixa',
    socios:              () => location.hash === '#/socios',
    investimentos:       () => location.hash === '#/investimentos',
    base:                () => location.hash === '#/base',
    recursos:            () => location.hash === '#/recursos',
    organograma:         () => /^#\/contratos/.test(location.hash),
    rdos:                () => location.hash === '#/rdos' || /^#\/contratos/.test(location.hash),
    manutencoes:         () => location.hash === '#/manutencao',
    veiculos:            () => location.hash === '#/frota',
    estoque:             () => location.hash === '#/estoque',
    'solicitacoes-compra': () => location.hash === '#/solicitacoes-compra',
    recrutamento:        () => location.hash === '#/recrutamento',
    propostas:           () => /^#\/proposta/.test(location.hash),
    clausulas:           () => location.hash === '#/clausulas',
    'folha-pagamento':   () => location.hash === '#/folha-pagamento',
    documentos:          () => location.hash === '#/documentos',
    sugestoes:           () => location.hash === '#/sugestoes',
  };

  let refreshTimer = null;
  function scheduleRefresh(entity) {
    const matcher = VIEW_BY_ENTITY[entity];
    if (!matcher || !matcher()) return;
    // Debounce — bursts viram um único refresh
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      try {
        if (window.Store && Store.loadAll) await Store.loadAll();
        if (window.RhinoUI && RhinoUI.toast) RhinoUI.toast('Dados atualizados', { type: 'info', duration: 1500 });
        // Dispara hashchange para o router re-renderizar a view ativa
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (err) { console.error('[realtime] refresh failed', err); }
    }, 600);
  }

  window.addEventListener('rh:mutation', (e) => {
    if (!e.detail || !e.detail.entity) return;
    scheduleRefresh(e.detail.entity);
  });

  // ─── Indicador "online" (avatares na sidebar) ───
  function renderOnline(list) {
    let bar = document.querySelector('.rh-online-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'rh-online-bar';
      bar.setAttribute('aria-label', 'Usuários conectados agora');
      const footer = document.querySelector('.sidebar-footer');
      if (footer) footer.insertBefore(bar, footer.firstChild);
      else return;
    }
    const others = (list || []).filter(u => !myEmail || u.userEmail !== myEmail);
    if (others.length === 0) { bar.innerHTML = ''; return; }
    bar.innerHTML = `
      <div class="rh-online-bar__title">${others.length + 1} online</div>
      <div class="rh-online-bar__avatars">
        ${[{ userEmail: myEmail || 'eu' }, ...others].slice(0, 6).map(u => {
          const name = (u.userEmail || '').split('@')[0] || '?';
          const initial = name.charAt(0).toUpperCase();
          const hue = Array.from(name).reduce((s, c) => s + c.charCodeAt(0), 0) % 360;
          return `<span class="rh-online-bar__avatar" title="${name}" style="background:hsl(${hue},55%,55%);">${initial}</span>`;
        }).join('')}
      </div>`;
  }
  window.addEventListener('rh:presence', (e) => renderOnline(e.detail?.online || []));
  window.addEventListener('rh:hello',    (e) => renderOnline(e.detail?.online || []));
})();
