/* Rhino · Polish runtime
   - Service worker register
   - Boot loader fade-out
   - Command palette (Cmd/Ctrl+K)
   - Bottom navigation (mobile)
   - Helpers: emptyState(), toast(), skeleton()
*/
(function () {
  'use strict';

  // ───────────────────────────────────────────────
  // 1. Service worker
  // ───────────────────────────────────────────────
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  // ───────────────────────────────────────────────
  // 2. Boot loader fade-out
  // ───────────────────────────────────────────────
  window.RhinoBoot = {
    done() {
      const el = document.querySelector('.boot-loader');
      if (!el) return;
      el.classList.add('is-done');
      setTimeout(() => el.remove(), 400);
      window.dispatchEvent(new CustomEvent('rh:boot-done'));
    },
  };
  // Fail-safe: se o app não chamar done() em 8s, esconde mesmo assim
  setTimeout(() => window.RhinoBoot.done(), 8000);

  // ───────────────────────────────────────────────
  // 3. Helpers globais
  // ───────────────────────────────────────────────
  window.RhinoUI = window.RhinoUI || {};

  RhinoUI.emptyState = function ({ icon = '📭', title = 'Nada por aqui ainda', message = '', cta = null } = {}) {
    const ctaHtml = cta
      ? `<button class="btn btn-primary empty-state__cta" data-empty-cta>${cta.label}</button>`
      : '';
    const html = `
      <div class="empty-state">
        <div class="empty-state__icon">${icon}</div>
        <div class="empty-state__title">${title}</div>
        ${message ? `<div class="empty-state__msg">${message}</div>` : ''}
        ${ctaHtml}
      </div>`;
    return html;
  };

  RhinoUI.sparkline = function (values, { height = 36, fill = true } = {}) {
    const arr = (values || []).map((v) => Number(v) || 0);
    if (!arr.length) return '';
    const w = 120;
    const h = height;
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const range = max - min || 1;
    const stepX = w / Math.max(1, arr.length - 1);
    const pts = arr.map((v, i) => [i * stepX, h - ((v - min) / range) * (h - 4) - 2]);
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const fillD = fill ? `M${pts[0][0]},${h} L${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')} L${pts[pts.length - 1][0]},${h} Z` : '';
    const last = pts[pts.length - 1];
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      ${fill ? `<path class="sparkline-fill" d="${fillD}"/>` : ''}
      <path d="${d}"/>
      <circle class="sparkline-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5"/>
    </svg>`;
  };

  RhinoUI.skeletonRows = function (count = 5) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="skeleton-row">
          <span class="skeleton"></span>
          <span class="skeleton"></span>
          <span class="skeleton"></span>
        </div>`;
    }
    return html;
  };

  // Toast manager
  function ensureToastStack() {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }
  RhinoUI.toast = function (message, { type = 'info', duration = 3500 } = {}) {
    const stack = ensureToastStack();
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 200);
    }, duration);
    return el;
  };

  // ───────────────────────────────────────────────
  // 4. Command palette (Cmd/Ctrl + K)
  // ───────────────────────────────────────────────
  function getCommandIndex() {
    const items = [];
    // Rotas a partir de routes (definido em app.js)
    if (window.routes) {
      for (const [hash, cfg] of Object.entries(window.routes)) {
        if (!cfg.label || hash.includes(':id') || cfg.soon) continue;
        // Respeita perfil quando disponível
        try {
          if (window.perfil && typeof window.perfil.podeAcessar === 'function') {
            if (!window.perfil.podeAcessar(hash)) continue;
          }
        } catch {}
        items.push({
          label: cfg.label,
          hint: 'Ir para',
          icon: '→',
          run: () => { location.hash = hash; },
        });
      }
    }
    // Ações globais
    items.push(
      { label: 'Alternar tema (claro/escuro)', hint: 'Tema', icon: '◐',
        run: () => { if (typeof window.toggleTheme === 'function') window.toggleTheme(); }
      },
      { label: 'Abrir Manual do Usuário', hint: 'Ajuda', icon: '?',
        run: () => { location.hash = '#/manual'; }
      },
    );
    items.push(
      { label: 'Alternar alto contraste', hint: 'Acessibilidade', icon: '◑',
        run: () => window.RhinoContraste?.toggle?.()
      },
      { label: 'Modo apresentação (ocultar valores)', hint: 'Interface', icon: '🙈',
        run: () => window.RhinoApresentacao?.toggle?.()
      },
      { label: 'Atalhos de teclado', hint: 'Ajuda', icon: '⌨',
        run: () => window.RhinoShortcuts?.show?.()
      },
    );
    return items;
  }

  // Expõe globalmente para que módulos externos possam estender o índice
  window.getCommandIndex = getCommandIndex;

  let cmdkOpen = false;
  function openCmdK() {
    if (cmdkOpen) return;
    cmdkOpen = true;
    const items = getCommandIndex();

    const overlay = document.createElement('div');
    overlay.className = 'cmdk-overlay';
    overlay.innerHTML = `
      <div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="Buscar e navegar">
        <div class="cmdk-input-wrap">
          <span class="cmdk-input-wrap__icon">⌕</span>
          <input class="cmdk-input" type="text" placeholder="Buscar contratos, clientes, NFs, telas… (/ ou ⌘K)" autocomplete="off" autofocus />
          <kbd class="cmdk-kbd">esc</kbd>
        </div>
        <div class="cmdk-list" role="listbox"></div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.cmdk-input');
    const list = overlay.querySelector('.cmdk-list');
    let active = 0;
    let filtered = items;

    const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    function render() {
      if (!filtered.length) {
        list.innerHTML = '<div class="cmdk-empty">Nada encontrado</div>';
        return;
      }
      list.innerHTML = filtered.map((it, i) => `
        <div class="cmdk-item ${i === active ? 'is-active' : ''}" role="option" data-i="${i}">
          <span class="cmdk-item__icon">${it.icon || '·'}</span>
          <span class="cmdk-item__label">${it.label}</span>
          <span class="cmdk-item__hint">${it.hint || ''}</span>
        </div>`).join('');
    }
    function move(d) {
      if (!filtered.length) return;
      active = (active + d + filtered.length) % filtered.length;
      render();
      const el = list.querySelector('.is-active');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
    function commit() {
      const it = filtered[active];
      if (!it) return;
      close();
      try { it.run(); } catch (e) { console.error(e); }
    }
    function close() {
      cmdkOpen = false;
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
    }
    let searchToken = 0;
    async function filter() {
      const q = norm(input.value.trim());
      const localFiltered = q
        ? items.filter((it) => norm(it.label).includes(q) || norm(it.hint).includes(q))
        : items;
      filtered = localFiltered;
      active = 0;
      render();

      // Busca remota (M3) — soma resultados se a query >= 2 chars
      if (q.length < 2) return;
      const myToken = ++searchToken;
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(input.value.trim())}`, { credentials: 'same-origin' });
        if (!r.ok) return;
        const j = await r.json();
        if (myToken !== searchToken) return; // outra busca já saiu
        const remote = (j.results || []).map((res) => ({
          icon: '◇',
          label: `${res.kind}: ${res.title}`,
          hint: res.hint || '',
          run: () => { location.hash = res.hash; },
        }));
        filtered = [...localFiltered, ...remote];
        render();
      } catch {}
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); move(-1); return; }
      if (e.key === 'Enter')     { e.preventDefault(); commit(); return; }
    }
    input.addEventListener('input', filter);
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    list.addEventListener('click', (e) => {
      const it = e.target.closest('.cmdk-item');
      if (!it) return;
      active = parseInt(it.dataset.i, 10);
      commit();
    });

    render();
    setTimeout(() => input.focus(), 0);
  }

  // Atalho global
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'k') {
      e.preventDefault();
      openCmdK();
      return;
    }
    // "/" shortcut — open search when not typing in an input
    if (k === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !document.activeElement?.isContentEditable) {
        e.preventDefault();
        openCmdK();
      }
    }
  });
  RhinoUI.openCommandPalette = openCmdK;

  // ───────────────────────────────────────────────
  // 5. Bottom navigation (mobile)
  // ───────────────────────────────────────────────
  const BOTTOM_NAV_ITEMS = [
    { label: 'Início',     icon: '🏠', hash: '#/dashboard' },
    { label: 'Contratos',  icon: '📋', hash: '#/contratos' },
    { label: 'Buscar',     icon: '⌕',  action: openCmdK },
    { label: 'Financeiro', icon: '💰', hash: '#/caixa' },
    { label: 'Mais',       icon: '☰',  action: toggleSidebarDrawer },
  ];

  function toggleSidebarDrawer() {
    document.body.classList.toggle('sidebar-open');
  }

  function renderBottomNav() {
    if (window.innerWidth > 768) {
      const ex = document.querySelector('.bottom-nav');
      if (ex) ex.remove();
      document.body.classList.remove('has-bottom-nav');
      return;
    }
    let nav = document.querySelector('.bottom-nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'bottom-nav';
      nav.setAttribute('role', 'navigation');
      nav.setAttribute('aria-label', 'Navegação principal');
      document.body.appendChild(nav);
      document.body.classList.add('has-bottom-nav');
    }
    const current = location.hash || '#/dashboard';
    nav.innerHTML = BOTTOM_NAV_ITEMS.map((it) => {
      const active = it.hash && current.startsWith(it.hash);
      return `<button class="bottom-nav__item ${active ? 'is-active' : ''}"
                      data-hash="${it.hash || ''}" data-action="${it.action ? '1' : ''}">
        <span class="bottom-nav__icon">${it.icon}</span>
        <span>${it.label}</span>
      </button>`;
    }).join('');
    nav.querySelectorAll('.bottom-nav__item').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const it = BOTTOM_NAV_ITEMS[i];
        if (it.action) it.action();
        else if (it.hash) location.hash = it.hash;
      });
    });
  }

  window.addEventListener('hashchange', renderBottomNav);
  window.addEventListener('resize', () => {
    clearTimeout(window.__rhBottomNavTimer);
    window.__rhBottomNavTimer = setTimeout(renderBottomNav, 120);
  });
  document.addEventListener('DOMContentLoaded', renderBottomNav);
  if (document.readyState !== 'loading') renderBottomNav();

  // ───────────────────────────────────────────────
  // 6. Ir ao topo button
  // ───────────────────────────────────────────────
  (function initBackToTop() {
    const btn = document.createElement('button');
    btn.className = 'rh-back-top';
    btn.setAttribute('aria-label', 'Voltar ao topo');
    btn.setAttribute('title', 'Ir ao topo');
    btn.innerHTML = '↑';
    document.body.appendChild(btn);

    const scrollTarget = document.getElementById('app') || window;
    const onScroll = () => {
      const scrollY = scrollTarget === window ? window.scrollY : scrollTarget.scrollTop;
      btn.classList.toggle('is-visible', scrollY > 300);
    };
    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    btn.addEventListener('click', () => {
      scrollTarget === window
        ? window.scrollTo({ top: 0, behavior: 'smooth' })
        : scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
    });
  })();

  // ───────────────────────────────────────────────
  // 7. Alto contraste toggle (adds to command palette index)
  // ───────────────────────────────────────────────
  // Persiste preferência
  (function initAltoContraste() {
    const saved = localStorage.getItem('rhino-contrast');
    if (saved === 'high') document.documentElement.setAttribute('data-contrast', 'high');
    window.RhinoContraste = {
      toggle() {
        const isHigh = document.documentElement.getAttribute('data-contrast') === 'high';
        if (isHigh) {
          document.documentElement.removeAttribute('data-contrast');
          localStorage.removeItem('rhino-contrast');
          window.showToast('Contraste normal restaurado', 'info');
        } else {
          document.documentElement.setAttribute('data-contrast', 'high');
          localStorage.setItem('rhino-contrast', 'high');
          window.showToast('Alto contraste ativado', 'info');
        }
      }
    };
  })();

  // ───────────────────────────────────────────────
  // 8. Modal autofocus helper (global delegate)
  // ───────────────────────────────────────────────
  document.addEventListener('focusin', () => {}, true); // keep listener active
  const _modalObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const modal = node.matches?.('.modal-overlay') ? node : node.querySelector?.('.modal-overlay');
        if (!modal) continue;
        setTimeout(() => {
          const firstInput = modal.querySelector('input:not([type="hidden"]):not([readonly]), select:not([disabled]), textarea:not([disabled])');
          if (firstInput && !firstInput.closest('[id$="-overlay"]')) firstInput.focus();
        }, 60);
        if (window.RhinoFocusTrap) {
          const modalEl = modal.querySelector('.modal');
          if (modalEl) window.RhinoFocusTrap(modalEl);
        }
      }
    }
  });
  _modalObserver.observe(document.body, { childList: true });
})();

// ── FAB contextual (mobile) ──────────────────────────────────
(function initFAB() {
  // Só cria uma vez
  if (document.getElementById('rh-fab')) return;

  const fab = document.createElement('div');
  fab.id = 'rh-fab';
  fab.className = 'rh-fab';

  const actions = [
    { icon: '📋', label: 'Novo Contrato', hash: '#/contratos', cb: () => { location.hash = '#/contratos'; setTimeout(() => window.Contratos?.showModal?.(), 300); } },
    { icon: '📝', label: 'Novo RDO',      hash: '#/rdos',      cb: () => { location.hash = '#/rdos';      setTimeout(() => window.RDOs?.showModal?.(),     300); } },
    { icon: '🧾', label: 'Nova NF',       hash: '#/notas-fiscais', cb: () => { location.hash = '#/notas-fiscais'; setTimeout(() => window.NotasFiscais?.showModal?.(), 300); } },
  ];

  const actionsHtml = actions.map((a, i) => `
    <div class="rh-fab__action">
      <span class="rh-fab__action-label">${a.label}</span>
      <button class="rh-fab__action-btn" data-fab-i="${i}" title="${a.label}">${a.icon}</button>
    </div>
  `).join('');

  fab.innerHTML = `
    <div class="rh-fab__actions" id="rh-fab-actions">${actionsHtml}</div>
    <button class="rh-fab__main" id="rh-fab-main" aria-label="Ações rápidas">+</button>
  `;

  document.body.appendChild(fab);

  const mainBtn    = document.getElementById('rh-fab-main');
  const actionsDiv = document.getElementById('rh-fab-actions');

  const open  = () => { mainBtn.classList.add('is-open');  actionsDiv.classList.add('is-visible');  };
  const close = () => { mainBtn.classList.remove('is-open'); actionsDiv.classList.remove('is-visible'); };
  const toggle = () => mainBtn.classList.contains('is-open') ? close() : open();

  mainBtn.addEventListener('click', e => { e.stopPropagation(); toggle(); });

  actionsDiv.querySelectorAll('.rh-fab__action-btn').forEach((btn, i) => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      close();
      actions[i].cb();
    });
  });

  document.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();

// ── Print helper ─────────────────────────────────────────────
window.RhinoPrint = {
  print() {
    window.print();
  }
};
// Expõe para o command palette
if (window.getCommandIndex) {
  const orig = window.getCommandIndex;
  window.getCommandIndex = function() {
    const list = orig();
    list.push({ label: 'Imprimir / Exportar PDF', run: () => window.RhinoPrint.print() });
    list.push({ label: 'Gerar Relatório PDF', run: () => window.RhinoRelatorio?.gerar?.() });
    return list;
  };
}

// ── Top progress bar ─────────────────────────────────────────
(function initProgressBar() {
  const bar = document.createElement('div');
  bar.id = 'rh-progress';
  bar.innerHTML = '<div class="rh-progress__fill"></div>';
  document.body.appendChild(bar);

  let _doneTimer;
  function onStoreChange(state) {
    clearTimeout(_doneTimer);
    if (state.loading) {
      bar.classList.remove('is-done');
      bar.classList.add('is-loading');
    } else {
      bar.classList.remove('is-loading');
      bar.classList.add('is-done');
      _doneTimer = setTimeout(() => bar.classList.remove('is-done'), 600);
    }
  }

  // Attach after boot so Store is guaranteed to exist
  window.addEventListener('rh:boot-done', () => {
    if (window.Store && typeof Store.subscribe === 'function') {
      Store.subscribe(onStoreChange);
    }
  });
})();
