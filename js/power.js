/* Rhino · Power-user runtime
   Q1 keyboard shortcuts · Q2 undo toast · Q3 filter chips ·
   Q6 inline edit · Q7 density toggle · M4 bulk actions ·
   M5 form autosave · M6 notifications bell.
*/
(function () {
  'use strict';

  const RU = (window.RhinoUI = window.RhinoUI || {});

  // ───────────────────────────────────────────────
  // Utilidade interna: escapa HTML para uso seguro em innerHTML
  // ───────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ───────────────────────────────────────────────
  // Q1 · Keyboard shortcuts
  // ───────────────────────────────────────────────
  // Sequência "g x" para Go-to + teclas únicas para ações.
  const SHORTCUTS = [
    { keys: ['g', 'd'], desc: 'Ir para Dashboard', run: () => (location.hash = '#/dashboard') },
    { keys: ['g', 'c'], desc: 'Ir para Contratos', run: () => (location.hash = '#/contratos') },
    { keys: ['g', 'r'], desc: 'Ir para RDOs', run: () => (location.hash = '#/rdos') },
    { keys: ['g', 'o'], desc: 'Ir para Mapa de Obras', run: () => (location.hash = '#/obras') },
    { keys: ['g', '$'], desc: 'Ir para Caixa', run: () => (location.hash = '#/caixa') },
    {
      keys: ['g', 'p'],
      desc: 'Ir para Contas a Pagar',
      run: () => (location.hash = '#/contas-pagar'),
    },
    {
      keys: ['g', 'n'],
      desc: 'Ir para Notas Fiscais',
      run: () => (location.hash = '#/notas-fiscais'),
    },
    { keys: ['g', 'k'], desc: 'Ir para Clientes', run: () => (location.hash = '#/clientes') },
    {
      keys: ['g', 'f'],
      desc: 'Ir para Fornecedores',
      run: () => (location.hash = '#/fornecedores'),
    },
    { keys: ['g', 'm'], desc: 'Abrir Manual', run: () => (location.hash = '#/manual') },
    { keys: ['?'], desc: 'Mostrar atalhos', run: () => RU.showShortcutsHelp() },
    { keys: ['t'], desc: 'Alternar tema', run: () => window.toggleTheme && window.toggleTheme() },
    { keys: ['/'], desc: 'Foco no campo de busca', run: () => focusSearch() },
  ];
  RU.shortcuts = SHORTCUTS;

  function focusSearch() {
    const el = document.querySelector('[data-search-input], input[type=search], .search-input');
    if (el) {
      el.focus();
      return;
    }
    if (RU.openCommandPalette) RU.openCommandPalette();
  }

  let pending = null;
  let pendingAt = 0;
  document.addEventListener('keydown', (e) => {
    // Não captura quando usuário está digitando
    const t = e.target;
    const tag = (t && t.tagName) || '';
    const isEditable = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (t && t.isContentEditable);
    if (isEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key;

    // Tecla única
    const singles = SHORTCUTS.filter((s) => s.keys.length === 1 && s.keys[0] === k);
    if (singles.length) {
      e.preventDefault();
      singles[0].run();
      pending = null;
      return;
    }

    // Sequência de duas teclas (g + x)
    if (pending) {
      const seq = SHORTCUTS.find(
        (s) => s.keys.length === 2 && s.keys[0] === pending && s.keys[1] === k
      );
      if (seq) {
        e.preventDefault();
        seq.run();
      }
      pending = null;
      return;
    }
    // Inicia sequência se a tecla é prefixo válido
    const isPrefix = SHORTCUTS.some((s) => s.keys.length === 2 && s.keys[0] === k);
    if (isPrefix) {
      pending = k;
      pendingAt = Date.now();
      setTimeout(() => {
        if (Date.now() - pendingAt >= 1200) pending = null;
      }, 1300);
    }
  });

  RU.showShortcutsHelp = function () {
    if (document.getElementById('rh-shortcuts-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'rh-shortcuts-modal';
    overlay.className = 'cmdk-overlay';
    overlay.innerHTML = `
      <div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="Atalhos de teclado">
        <div class="cmdk-input-wrap" style="justify-content:space-between;">
          <strong style="font-size:16px;">Atalhos de teclado</strong>
          <kbd class="cmdk-kbd">esc</kbd>
        </div>
        <div class="cmdk-list" style="max-height:60vh;">
          ${SHORTCUTS.map(
            (s) => `
            <div class="cmdk-item" style="cursor:default;">
              <span class="cmdk-item__label">${escapeHtml(s.desc)}</span>
              <span class="cmdk-item__hint">${s.keys.map((k) => `<kbd class="cmdk-kbd">${escapeHtml(k)}</kbd>`).join(' ')}</span>
            </div>`
          ).join('')}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    document.addEventListener(
      'keydown',
      function once(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
          document.removeEventListener('keydown', once, true);
        }
      },
      true
    );
  };

  // ───────────────────────────────────────────────
  // Q2 · Undo toast
  // ───────────────────────────────────────────────
  // RhinoUI.confirmWithUndo({ message, undoMs, onCommit, onUndo })
  // - Retorna uma promise que resolve(true) se o usuário deixou commitar,
  //   ou resolve(false) se desfez.
  // - onCommit é chamado depois do timeout se ninguém clicou desfazer.
  RU.confirmWithUndo = function ({ message = 'Excluído', undoMs = 5000, onCommit, onUndo } = {}) {
    return new Promise((resolve) => {
      const stack = (function ensureStack() {
        let s = document.querySelector('.toast-stack');
        if (!s) {
          s = document.createElement('div');
          s.className = 'toast-stack';
          document.body.appendChild(s);
        }
        return s;
      })();
      const el = document.createElement('div');
      el.className = 'toast toast--warning';
      el.style.cssText = 'display:flex;align-items:center;gap:14px;';
      el.innerHTML = `
        <span class="undo-message" style="flex:1;"></span>
        <button class="btn btn-sm" style="background:transparent;border:1px solid currentColor;color:inherit;font-weight:700;">Desfazer</button>`;
      el.querySelector('.undo-message').textContent = message;
      stack.appendChild(el);
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 200);
      };
      const timer = setTimeout(async () => {
        if (done) return;
        try {
          onCommit && (await onCommit());
        } catch (e) {
          console.error(e);
        }
        cleanup();
        resolve(true);
      }, undoMs);
      el.querySelector('button').addEventListener('click', async () => {
        clearTimeout(timer);
        try {
          onUndo && (await onUndo());
        } catch (e) {
          console.error(e);
        }
        cleanup();
        resolve(false);
      });
    });
  };

  // ───────────────────────────────────────────────
  // Q3 · Filter chips persistentes
  // Use:
  //   const chips = RhinoUI.filterChips({
  //     namespace: 'contratos',
  //     options: [{ id: 'ativos', label: 'Ativos' }, { id: 'urgentes', label: 'Urgentes' }],
  //     onChange: (active) => refresh()
  //   });
  //   container.innerHTML = chips.html();
  //   chips.bind(container);
  //   chips.active   // -> Set com IDs ativos
  // ───────────────────────────────────────────────
  RU.filterChips = function ({ namespace = 'default', options = [], onChange } = {}) {
    const key = `rh_chips_${namespace}`;
    const active = new Set();
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      parsed.filter((id) => typeof id === 'string').forEach((id) => active.add(id));
    } catch {}

    const api = {
      get active() {
        return active;
      },
      html() {
        return `<div class="filter-chips" data-chips="${namespace}" role="group" aria-label="Filtros">
          ${options
            .map(
              (o) => `
            <button type="button" class="filter-chip ${active.has(o.id) ? 'is-active' : ''}" data-chip-id="${escapeHtml(o.id)}">
              ${escapeHtml(o.label)}
            </button>`
            )
            .join('')}
          ${active.size > 0 ? '<button type="button" class="filter-chip filter-chip--clear" data-chip-clear>limpar</button>' : ''}
        </div>`;
      },
      bind(root) {
        const el = root.querySelector(`[data-chips="${namespace}"]`);
        if (!el) return;
        el.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-chip-id], [data-chip-clear]');
          if (!btn) return;
          if (btn.dataset.chipClear !== undefined) {
            active.clear();
          } else {
            const id = btn.dataset.chipId;
            if (active.has(id)) active.delete(id);
            else active.add(id);
          }
          localStorage.setItem(key, JSON.stringify([...active]));
          el.outerHTML = api.html();
          api.bind(root);
          if (onChange) onChange(active);
        });
      },
    };
    return api;
  };

  // ───────────────────────────────────────────────
  // Q6 · Inline edit em tabelas
  // Uso:
  //   RhinoUI.inlineEdit(td, {
  //     value: '100',
  //     type: 'number'  // 'text' | 'number' | 'date'
  //     onSave: async (v) => api.save(v)
  //   })
  // ───────────────────────────────────────────────
  RU.inlineEdit = function (cell, { value = '', type = 'text', onSave } = {}) {
    if (cell.dataset.editing === '1') return;
    cell.dataset.editing = '1';
    const original = cell.innerHTML;
    cell.innerHTML = `<input class="form-control" type="${type}" value="${String(value).replace(/"/g, '&quot;')}" style="width:100%;padding:4px 6px;font-size:14px;">`;
    const input = cell.querySelector('input');
    input.focus();
    input.select && input.select();
    let committed = false;
    const cancel = () => {
      if (committed) return;
      committed = true;
      cell.innerHTML = original;
      cell.dataset.editing = '';
    };
    const commit = async () => {
      if (committed) return;
      committed = true;
      const v = input.value;
      cell.innerHTML = '<span class="skeleton" style="height:14px;display:block;"></span>';
      try {
        if (onSave) await onSave(v);
        cell.textContent = v;
        if (RU.toast) RU.toast('Atualizado', { type: 'success', duration: 1800 });
      } catch (e) {
        cell.innerHTML = original;
        if (RU.toast) RU.toast(e.message || 'Falha ao salvar', { type: 'danger' });
      } finally {
        cell.dataset.editing = '';
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });
    input.addEventListener('blur', commit);
  };

  // ───────────────────────────────────────────────
  // Q7 · Toggle de densidade (compact/comfortable)
  // ───────────────────────────────────────────────
  function applyDensity(d) {
    document.documentElement.setAttribute('data-density', d);
    try {
      localStorage.setItem('rhino-density', d);
    } catch {}
  }
  function getDensity() {
    try {
      return localStorage.getItem('rhino-density') || 'comfortable';
    } catch {
      return 'comfortable';
    }
  }
  RU.applyDensity = applyDensity;
  RU.getDensity = getDensity;
  RU.toggleDensity = function () {
    applyDensity(getDensity() === 'compact' ? 'comfortable' : 'compact');
  };
  applyDensity(getDensity());

  // ───────────────────────────────────────────────
  // M4 · Bulk actions
  // Uso:
  //   const bulk = RhinoUI.bulk({
  //     getIds: () => [...table.querySelectorAll('input[name=row]:checked')].map(c => c.value),
  //     actions: [{ label: 'Excluir', danger: true, run: async (ids) => {...} }]
  //   });
  //   bulk.attach(table);  // mostra/some bar conforme seleção
  // ───────────────────────────────────────────────
  RU.bulk = function ({ getIds, actions = [] } = {}) {
    let bar = null;
    function ensureBar() {
      if (bar) return bar;
      bar = document.createElement('div');
      bar.className = 'bulk-bar';
      bar.innerHTML = `
        <span class="bulk-bar__count">0 selecionado(s)</span>
        <div class="bulk-bar__actions"></div>
        <button class="bulk-bar__close" aria-label="Fechar">×</button>`;
      document.body.appendChild(bar);
      const actionsEl = bar.querySelector('.bulk-bar__actions');
      actions.forEach((a, i) => {
        const b = document.createElement('button');
        b.className = `btn btn-sm ${a.danger ? 'btn-danger' : ''}`;
        b.textContent = a.label;
        b.addEventListener('click', async () => {
          const ids = getIds();
          if (!ids.length) return;
          await a.run(ids);
          if (RU.toast) RU.toast(`${ids.length} processado(s)`, { type: 'success' });
          api.update(0);
        });
        actionsEl.appendChild(b);
      });
      bar.querySelector('.bulk-bar__close').addEventListener('click', () => api.update(0, true));
      return bar;
    }
    const api = {
      update(count, hide = false) {
        const b = ensureBar();
        if (hide || count <= 0) {
          b.classList.remove('is-visible');
          return;
        }
        b.querySelector('.bulk-bar__count').textContent = `${count} selecionado(s)`;
        b.classList.add('is-visible');
      },
      attach(root) {
        root.addEventListener('change', (e) => {
          if (!e.target.matches('input[type=checkbox][name=row]')) return;
          const ids = getIds();
          api.update(ids.length);
        });
      },
    };
    return api;
  };

  // ───────────────────────────────────────────────
  // M5 · Autosave de drafts em formulários
  // Uso: <form data-autosave="contrato-novo"> ... </form>
  // Restaura ao montar, salva debounced no input, limpa no submit.
  // ───────────────────────────────────────────────
  function key(name) {
    return `rh_draft_${name}`;
  }
  function snapshotForm(form) {
    const data = {};
    new FormData(form).forEach((v, k) => {
      data[k] = v;
    });
    return data;
  }
  function restoreForm(form, data) {
    Object.entries(data || {}).forEach(([k, v]) => {
      const el = form.querySelector(`[name="${CSS.escape(k)}"]`);
      if (el && (el.value === '' || el.value == null)) el.value = v;
    });
  }
  RU.attachAutosave = function (form) {
    const name = form.dataset.autosave;
    if (!name) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key(name)) || 'null');
      if (saved) {
        restoreForm(form, saved);
        if (RU.toast) RU.toast('Rascunho restaurado', { type: 'info', duration: 2200 });
      }
    } catch {}
    let timer;
    form.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(key(name), JSON.stringify(snapshotForm(form)));
        } catch {}
      }, 500);
    });
    form.addEventListener('submit', () => {
      try {
        localStorage.removeItem(key(name));
      } catch {}
    });
  };
  // Auto-attach a qualquer form com data-autosave que aparecer no DOM
  const mo = new MutationObserver((muts) => {
    muts.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        const forms =
          n.matches && n.matches('form[data-autosave]')
            ? [n]
            : [...((n.querySelectorAll && n.querySelectorAll('form[data-autosave]')) || [])];
        forms.forEach((f) => RU.attachAutosave(f));
      });
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // M6 · Sino de notificações in-app — removido: os alertas agora ficam
  // diretamente nos itens do menu lateral (badges "pill suave").
})();
