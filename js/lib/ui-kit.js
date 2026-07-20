/**
 * RHINO · UI Kit — helpers reutilizáveis (Wave 1).
 *
 * Exposto em `window.UIKit`. Opt-in: nenhuma view existente é alterada
 * automaticamente. Cada view escolhe se usa.
 *
 *   UIKit.statusPill(status, label)      → string HTML
 *   UIKit.skeleton(kind, count)          → string HTML
 *   UIKit.empty({ icon, title, desc, cta }) → string HTML
 *   UIKit.breadcrumb([{label, href}])    → string HTML
 *   UIKit.smartBack(fallbackHref, label) → string HTML (e wire global)
 *   UIKit.avatar(name, opts)             → string HTML
 *   UIKit.showUndoToast(msg, onUndo, ms) → função revert manual
 *   UIKit.persistFilter(key, getter, setter) → wire transparente
 *   UIKit.sortable(tableEl, opts)        → ativa ordenação por header
 *   UIKit.density.set('compact'|'cozy'|'comfortable')
 */
(function () {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  // ─────────────────────────────────────────────
  // STATUS PILL
  // ─────────────────────────────────────────────
  const PILL_MAP = {
    ativo:        { variant: 'success', label: 'Ativo' },
    pausado:      { variant: 'warning', label: 'Pausado' },
    concluido:    { variant: 'blue',    label: 'Concluído' },
    cancelado:    { variant: 'danger',  label: 'Cancelado' },
    prospeccao:   { variant: 'violet',  label: 'Prospecção' },
    nao_iniciado: { variant: 'gray',    label: 'Não iniciado' },
    nao_aprovado: { variant: 'orange',  label: 'Não aprovado' },
    aberto:       { variant: 'info',    label: 'Aberto' },
    pago:         { variant: 'success', label: 'Pago' },
    atrasado:     { variant: 'danger',  label: 'Atrasado' },
    pendente:     { variant: 'warning', label: 'Pendente' },
    // Financeiro — tipos de lançamento e situação de NF (padronização Fase 2)
    entrada:      { variant: 'success', label: 'Entrada' },
    saida:        { variant: 'danger',  label: 'Saída' },
    emitida:      { variant: 'success', label: 'Emitida' },
    prevista:     { variant: 'info',    label: 'Prevista' },
    vencida:      { variant: 'danger',  label: 'Vencida' },
    conciliado:   { variant: 'success', label: 'Conciliado' },
    novo:         { variant: 'info',    label: 'Novo' },
    proximo_vencer: { variant: 'warning', label: 'Próxima' },
    no_prazo:     { variant: 'success', label: 'No prazo' },
  };

  function statusPill(status, customLabel) {
    const def = PILL_MAP[status] || { variant: 'gray', label: status || '—' };
    const label = customLabel || def.label;
    return `<span class="ui-pill ui-pill--${def.variant}">${esc(label)}</span>`;
  }

  // ─────────────────────────────────────────────
  // SKELETON
  // ─────────────────────────────────────────────
  function skeleton(kind = 'row', count = 1) {
    const one = () => {
      switch (kind) {
        case 'title':  return '<div class="ui-sk ui-sk--title"></div>';
        case 'line':   return '<div class="ui-sk ui-sk--line"></div>';
        case 'card':   return '<div class="ui-sk ui-sk--card"></div>';
        case 'circle': return '<div class="ui-sk ui-sk--circle"></div>';
        case 'row':
        default:       return '<div class="ui-sk ui-sk--row"></div>';
      }
    };
    return `<div class="ui-sk-list">${Array.from({ length: count }, one).join('')}</div>`;
  }

  // ─────────────────────────────────────────────
  // EMPTY STATE
  // ─────────────────────────────────────────────
  function empty({ icon = '📭', title = 'Nada por aqui', desc = '', cta = '' } = {}) {
    return `
      <div class="ui-empty">
        <div class="ui-empty__icon">${icon}</div>
        <div class="ui-empty__title">${esc(title)}</div>
        ${desc ? `<div class="ui-empty__desc">${esc(desc)}</div>` : ''}
        ${cta ? `<div class="ui-empty__cta">${cta}</div>` : ''}
      </div>`;
  }

  // ─────────────────────────────────────────────
  // BREADCRUMB
  // ─────────────────────────────────────────────
  function breadcrumb(items) {
    if (!Array.isArray(items) || items.length === 0) return '';
    const parts = items.map((it, i) => {
      const isLast = i === items.length - 1;
      if (isLast || !it.href) {
        return `<span class="ui-bc__current">${esc(it.label)}</span>`;
      }
      return `<a href="${it.href}">${esc(it.label)}</a>`;
    });
    return `<nav class="ui-bc" aria-label="breadcrumb">${parts.join('<span class="ui-bc__sep">/</span>')}</nav>`;
  }

  // ─────────────────────────────────────────────
  // SMART BACK
  // Histórico de navegação curto guardado em sessionStorage.
  // ─────────────────────────────────────────────
  const NAV_KEY = 'rhino-nav-history';
  function _readNav() {
    try { return JSON.parse(sessionStorage.getItem(NAV_KEY) || '[]'); }
    catch { return []; }
  }
  function _writeNav(arr) {
    try { sessionStorage.setItem(NAV_KEY, JSON.stringify(arr.slice(-10))); } catch {}
  }
  function _pushNav(hash) {
    const arr = _readNav();
    if (arr[arr.length - 1] === hash) return;
    arr.push(hash);
    _writeNav(arr);
  }

  function smartBack(fallbackHref = '#/', fallbackLabel = 'Voltar') {
    const arr = _readNav();
    // Acha o primeiro hash de origem que não seja a tela atual.
    const cur = location.hash || '#/';
    let origin = null;
    for (let i = arr.length - 2; i >= 0; i--) {
      if (arr[i] && arr[i] !== cur) { origin = arr[i]; break; }
    }
    const href = origin || fallbackHref;
    const label = origin ? _hashToLabel(origin) : fallbackLabel;
    return `<a href="${href}" class="ui-back"><span class="ui-back__arrow">←</span> ${esc(label)}</a>`;
  }
  function _hashToLabel(hash) {
    if (!hash) return 'Voltar';
    const seg = hash.replace(/^#\//, '').split('/')[0] || 'início';
    const map = {
      contratos:'Contratos', rdos:'RDOs', estoque:'Almoxarifado',
      frota:'Frota', recursos:'Recursos', clientes:'Clientes',
      fornecedores:'Fornecedores', propostas:'Propostas',
      caixa:'Caixa', 'contas-pagar':'Contas a pagar',
      'notas-fiscais':'Notas fiscais', dashboard:'Dashboard',
      'cronograma-geral':'Cronograma geral', obras:'Obras',
    };
    return map[seg] || seg.charAt(0).toUpperCase() + seg.slice(1);
  }

  // Hook global: registra cada hashchange.
  window.addEventListener('hashchange', () => _pushNav(location.hash));
  // Boot: registra a tela inicial.
  if (location.hash) _pushNav(location.hash);

  // ─────────────────────────────────────────────
  // AVATAR — iniciais coloridas determinísticas
  // ─────────────────────────────────────────────
  function _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function avatar(name, { size = '' } = {}) {
    const n = String(name || '').trim();
    if (!n) return '<span class="ui-avatar" data-color="0">·</span>';
    const parts = n.split(/\s+/).filter(Boolean);
    const ini = (parts[0][0] + (parts[parts.length - 1]?.[0] || '')).slice(0, 2);
    const color = _hash(n) % 8;
    const cls = size ? ` ui-avatar--${size}` : '';
    return `<span class="ui-avatar${cls}" data-color="${color}" title="${esc(n)}">${esc(ini)}</span>`;
  }

  // ─────────────────────────────────────────────
  // UNDO TOAST
  // ─────────────────────────────────────────────
  function _ensureStack() {
    let stack = document.querySelector('.ui-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'ui-toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }
  function _dismiss(el) {
    if (!el || el.dataset.leaving === '1') return;
    el.dataset.leaving = '1';
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  }

  /**
   * Mostra toast com botão Desfazer. Retorna função pra dismissar manualmente.
   * O callback `onUndo` é chamado se o usuário clicar em Desfazer (antes do timeout).
   * `onCommit` (opcional) roda quando o timeout estoura sem undo.
   */
  function showUndoToast(msg, onUndo, { ms = 5000, variant = '', onCommit } = {}) {
    const stack = _ensureStack();
    const el = document.createElement('div');
    el.className = 'ui-toast' + (variant ? ` ui-toast--${variant}` : '');
    el.innerHTML = `
      <span class="ui-toast__msg">${esc(msg)}</span>
      <button class="ui-toast__btn" type="button">Desfazer</button>
      <button class="ui-toast__close" type="button" aria-label="Fechar">×</button>
    `;
    stack.appendChild(el);

    let undone = false;
    const timer = setTimeout(() => {
      if (!undone) { _dismiss(el); if (typeof onCommit === 'function') onCommit(); }
    }, ms);

    el.querySelector('.ui-toast__btn').addEventListener('click', () => {
      undone = true; clearTimeout(timer); _dismiss(el);
      try { onUndo && onUndo(); } catch (e) { console.warn('[UIKit/undo] callback falhou', e); }
    });
    el.querySelector('.ui-toast__close').addEventListener('click', () => {
      clearTimeout(timer); _dismiss(el);
      if (!undone && typeof onCommit === 'function') onCommit();
    });
    return () => { clearTimeout(timer); _dismiss(el); };
  }

  // Toast simples (substitui showToast em chamadas que adotarem o kit)
  function toast(msg, variant = '', ms = 3500) {
    const stack = _ensureStack();
    const el = document.createElement('div');
    el.className = 'ui-toast' + (variant ? ` ui-toast--${variant}` : '');
    el.innerHTML = `<span class="ui-toast__msg">${esc(msg)}</span>
      <button class="ui-toast__close" type="button" aria-label="Fechar">×</button>`;
    stack.appendChild(el);
    el.querySelector('.ui-toast__close').addEventListener('click', () => _dismiss(el));
    setTimeout(() => _dismiss(el), ms);
  }

  // ─────────────────────────────────────────────
  // DELETE WITH UNDO — toast com Desfazer (5s)
  // Retorna Promise<'commit' | 'undo'>. O caller faz a remoção
  // otimista da UI ANTES e a restauração no caso 'undo'.
  //
  // Uso típico:
  //   const idx = arr.findIndex(x => x.id === id);
  //   const item = arr[idx]; arr.splice(idx, 1); this.render();
  //   const r = await UIKit.deleteWithUndo({ msg: `"${item.nome}" removido` });
  //   if (r === 'undo')  { arr.splice(idx, 0, item); this.render(); }
  //   else               { await fetch(url, {method:'DELETE'}); }
  // ─────────────────────────────────────────────
  function deleteWithUndo({ msg = 'Removido', ms = 5000 } = {}) {
    return new Promise(resolve => {
      let resolved = false;
      showUndoToast(msg, () => { if (!resolved) { resolved = true; resolve('undo'); } }, {
        ms, variant: 'danger',
        onCommit: () => { if (!resolved) { resolved = true; resolve('commit'); } },
      });
    });
  }

  // ─────────────────────────────────────────────
  // FILTER PERSIST — grava/lê filtros por chave
  // ─────────────────────────────────────────────
  const FILTER_PREFIX = 'rhino-filter:';
  function persistFilter(key, defaults = {}) {
    const k = FILTER_PREFIX + key;
    let data = { ...defaults };
    try {
      const stored = JSON.parse(localStorage.getItem(k) || 'null');
      if (stored && typeof stored === 'object') data = { ...data, ...stored };
    } catch {}
    return {
      get: (field) => field == null ? { ...data } : data[field],
      set: (field, value) => {
        if (typeof field === 'object') Object.assign(data, field);
        else data[field] = value;
        try { localStorage.setItem(k, JSON.stringify(data)); } catch {}
      },
      clear: () => { data = { ...defaults }; try { localStorage.removeItem(k); } catch {} },
    };
  }

  // ─────────────────────────────────────────────
  // SORTABLE TABLE
  // ─────────────────────────────────────────────
  /**
   * Ativa ordenação por header em uma <table> que tenha <th data-sort="key">.
   * `getRows()` deve devolver o array de dados; `render(sortedRows)` re-renderiza o tbody.
   * `comparators` opcional: { key: (a,b) => number }. Sem comparator, faz comparação genérica.
   */
  function sortable(tableEl, { getRows, render, comparators = {}, initial = null }) {
    if (!tableEl) return;
    tableEl.classList.add('ui-sortable');
    let state = initial ? { key: initial.key, dir: initial.dir || 'asc' } : { key: null, dir: 'asc' };

    const apply = () => {
      const rows = [...getRows()];
      if (!state.key) { render(rows); return; }
      const cmp = comparators[state.key] || ((a, b) => {
        const av = a?.[state.key], bv = b?.[state.key];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return av - bv;
        return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true });
      });
      rows.sort((a, b) => cmp(a, b) * (state.dir === 'desc' ? -1 : 1));
      render(rows);
      tableEl.querySelectorAll('th[data-sort]').forEach(th => {
        th.setAttribute('aria-sort', th.dataset.sort === state.key
          ? (state.dir === 'asc' ? 'ascending' : 'descending')
          : 'none');
      });
    };

    tableEl.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        if (state.key === k) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.key = k; state.dir = 'asc'; }
        apply();
      });
    });
    apply();
    return { sort: (k, dir = 'asc') => { state = { key: k, dir }; apply(); } };
  }

  // ─────────────────────────────────────────────
  // DENSITY
  // ─────────────────────────────────────────────
  const density = {
    get() { return localStorage.getItem('rhino-density') || 'cozy'; },
    set(value) {
      const v = ['compact', 'cozy', 'comfortable'].includes(value) ? value : 'cozy';
      if (v === 'cozy') document.documentElement.removeAttribute('data-density');
      else document.documentElement.setAttribute('data-density', v);
      try { localStorage.setItem('rhino-density', v); } catch {}
    },
    cycle() {
      const cur = density.get();
      const next = cur === 'compact' ? 'cozy' : cur === 'cozy' ? 'comfortable' : 'compact';
      density.set(next);
      toast(`Densidade: ${next}`, 'success', 1500);
    },
  };
  // Aplica densidade salva no boot.
  density.set(density.get());

  // ─────────────────────────────────────────────
  // AUTOSAVE — orquestrador de salvamento automático
  // Uso:
  //   const as = UIKit.autosave({
  //     formEl, save: (data) => fetch(...),
  //     debounceMs: 1200, indicator: '#saveIndicator',
  //   });
  //   as.markDirty();   // chame em cada input change
  //   as.flush();       // força salvar agora (ex.: ao fechar modal)
  // ─────────────────────────────────────────────
  function autosave({ save, debounceMs = 1200, indicator }) {
    let timer = null;
    let pending = false;
    let saving = false;
    const ind = typeof indicator === 'string' ? document.querySelector(indicator) : indicator;
    const setState = (txt, color) => {
      if (!ind) return;
      ind.textContent = txt;
      ind.style.color = color || '';
      ind.style.display = txt ? 'inline' : 'none';
    };
    const flush = async () => {
      if (saving) { pending = true; return; }
      clearTimeout(timer); timer = null;
      saving = true; setState('salvando…', 'var(--color-text-muted)');
      try {
        await save();
        setState('✓ salvo', 'var(--color-success)');
        setTimeout(() => { if (!pending) setState('', ''); }, 1500);
      } catch (e) {
        setState('⚠ falhou', 'var(--color-danger)');
        console.warn('[UIKit/autosave] save error', e);
      } finally {
        saving = false;
        if (pending) { pending = false; markDirty(); }
      }
    };
    const markDirty = () => {
      clearTimeout(timer);
      setState('alterado…', 'var(--color-text-muted)');
      timer = setTimeout(flush, debounceMs);
    };
    return { markDirty, flush };
  }

  // ─────────────────────────────────────────────
  // PAGE HEADER — padrão B: título + subtítulo + ação primária
  // ─────────────────────────────────────────────
  function pageHeader({ title, subtitle = '', actions = '', icon = '' } = {}) {
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">${icon ? `<span style="display:inline-flex;align-items:center;gap:10px;">${icon}${esc(title || '')}</span>` : esc(title || '')}</h1>
          ${subtitle ? `<p class="page-subtitle">${esc(subtitle)}</p>` : ''}
        </div>
        ${actions ? `<div class="page-header-actions">${actions}</div>` : ''}
      </div>`;
  }

  // ─────────────────────────────────────────────
  // KPI GRID — cards de métricas (padrão B)
  // [{ label, value, color, hint, icon }]
  // ─────────────────────────────────────────────
  function kpiGrid(items = []) {
    if (!items.length) return '';
    return `
      <div class="ui-kpi-grid">
        ${items.map(k => `
          <div class="ui-kpi" style="${k.color ? `border-left-color:${k.color};` : ''}" ${k.title ? `title="${esc(k.title)}"` : ''}>
            <div class="ui-kpi__label">${k.icon ? k.icon + ' ' : ''}${esc(k.label || '')}</div>
            <div class="ui-kpi__value" ${k.color ? `style="color:${k.color};"` : ''}>${k.value ?? '—'}</div>
            ${k.hint ? `<div class="ui-kpi__hint">${esc(k.hint)}</div>` : ''}
          </div>
        `).join('')}
      </div>`;
  }

  // ─────────────────────────────────────────────
  // TOOLBAR — barra de busca + filtros (padrão visual igual ao Contratos:
  // .filters-bar com labels acima de cada campo)
  // search: { value, placeholder, id, label }
  // selects: [{ id, label, options, title }]
  // ─────────────────────────────────────────────
  function toolbar({ search, selects = [], extra = '', showClear = false, clearId = 'btnLimparFiltros' } = {}) {
    const sId = search?.id || 'inputBusca';
    const searchHtml = search ? `
      <div class="filter-group" style="flex:1;min-width:220px;">
        <label class="filter-label" for="${sId}">${esc(search.label || 'Buscar')}</label>
        <input type="search" class="form-control filter-control" id="${sId}"
          placeholder="${esc(search.placeholder || 'Nome, descrição...')}"
          value="${esc(search.value || '')}" style="width:100%;">
      </div>` : '';
    const selectsHtml = selects.map(s => `
      <div class="filter-group" style="min-width:180px;">
        <label class="filter-label" for="${s.id}">${esc(s.label || '')}</label>
        <select class="form-control filter-control" id="${s.id}" ${s.title ? `title="${esc(s.title)}"` : ''}>
          ${(s.options || []).map(o => `<option value="${esc(o.value ?? '')}" ${o.selected ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
      </div>`).join('');
    const clearHtml = showClear
      ? `<div class="filter-group"><label class="filter-label">&nbsp;</label>
          <button class="btn btn-secondary" id="${clearId}">Limpar</button></div>` : '';
    return `
      <div class="filters-bar" style="align-items:flex-end;">
        ${searchHtml}
        ${selectsHtml}
        ${extra}
        ${clearHtml}
      </div>`;
  }

  // ─────────────────────────────────────────────
  // CHIPS — filtros tipo pill com contagem
  // Renderiza com classes .rh-chip (padrão visual igual ao Contratos)
  // Opcionalmente embrulha no topo de um card de tabela.
  // ─────────────────────────────────────────────
  function chips(items = [], { name = 'chips', inCard = false } = {}) {
    if (!items.length) return '';
    const inner = `
      <div class="rh-status-chips" data-chips="${esc(name)}" style="display:flex;gap:6px;flex-wrap:wrap;${inCard ? 'padding:12px 16px 0;' : 'margin-bottom:var(--sp-md);'}">
        ${items.map(c => `
          <button class="rh-chip ${c.active ? 'is-active' : ''}" data-value="${esc(c.value ?? '')}" role="tab" aria-selected="${c.active ? 'true' : 'false'}">
            ${esc(c.label)}${c.count != null ? ` <span class="rh-chip-count">${c.count}</span>` : ''}
          </button>
        `).join('')}
      </div>`;
    return inner;
  }

  // ─────────────────────────────────────────────
  // KANBAN — colunas horizontais com cards (sem drag)
  // columns: [{ key, title, color?, items: [...], variant? }]
  // renderCard(item) → string HTML do card
  // ─────────────────────────────────────────────
  function kanban({ columns = [], renderCard, emptyMsg = 'Vazio' } = {}) {
    if (!columns.length) return '';
    return `
      <div class="ui-kanban">
        ${columns.map(col => `
          <div class="ui-kanban__col ${col.variant ? `ui-kanban__col--${col.variant}` : ''}" data-col="${esc(col.key)}">
            <div class="ui-kanban__col-header">
              <div class="ui-kanban__col-title">${col.icon ? col.icon + ' ' : ''}${esc(col.title)}</div>
              <span class="ui-kanban__col-count">${(col.items || []).length}</span>
            </div>
            <div class="ui-kanban__col-body">
              ${(col.items || []).length === 0
                ? `<div class="ui-kanban__empty">${esc(col.emptyMsg || emptyMsg)}</div>`
                : col.items.map(it => typeof renderCard === 'function' ? renderCard(it, col) : '').join('')}
            </div>
          </div>
        `).join('')}
      </div>`;
  }

  // ─────────────────────────────────────────────
  // VIEW TOGGLE — Lista / Kanban
  // ─────────────────────────────────────────────
  function viewToggle({ current = 'list', options = [{ value:'list', label:'☰ Lista' }, { value:'kanban', label:'▦ Kanban' }] } = {}) {
    return `
      <div class="ui-view-toggle" role="tablist">
        ${options.map(o => `
          <button data-view="${esc(o.value)}" class="${current === o.value ? 'is-active' : ''}" role="tab" aria-selected="${current === o.value ? 'true' : 'false'}">
            ${esc(o.label)}
          </button>
        `).join('')}
      </div>`;
  }

  // ─────────────────────────────────────────────
  // PAGINAÇÃO
  // ─────────────────────────────────────────────
  // Extraído do padrão já maduro de Contratos.js (pageSize + clamp + janela de
  // páginas) para telas que renderizavam o dataset filtrado INTEIRO no DOM
  // (Recursos, Estoque, Frota, Solicitações, Notas Fiscais). Reusa o CSS
  // `rh-pagination` que já existe — nada de estilo novo.

  const PAGE_SIZES = [10, 25, 50, 100];
  const DEFAULT_PAGE_SIZE = 25;

  /**
   * Fatia uma lista. FUNÇÃO PURA — não lê DOM nem estado global, por isso é
   * testável (test/paginacao.test.js).
   *
   * Faz o *clamp* da página: se a lista encolheu (usuário filtrou estando na
   * página 7), volta para a última página existente em vez de devolver vazio.
   *
   * @param {Array} items
   * @param {number} page      1-based
   * @param {number} pageSize
   * @returns {{page:number,pageSize:number,total:number,totalPages:number,start:number,end:number,slice:Array}}
   */
  function paginate(items, page, pageSize) {
    const lista = Array.isArray(items) ? items : [];
    const total = lista.length;

    let tam = parseInt(pageSize, 10);
    if (!Number.isFinite(tam) || tam <= 0) tam = DEFAULT_PAGE_SIZE;

    const totalPages = Math.max(1, Math.ceil(total / tam));

    let pg = parseInt(page, 10);
    if (!Number.isFinite(pg) || pg < 1) pg = 1;
    if (pg > totalPages) pg = totalPages;

    const start = (pg - 1) * tam;
    const end = Math.min(start + tam, total);
    return { page: pg, pageSize: tam, total, totalPages, start, end, slice: lista.slice(start, end) };
  }

  /**
   * Janela de números de página (no máximo `max`), centrada na atual.
   * Pura. Espelha a lógica de Contratos.js.
   * @returns {number[]}
   */
  function pageWindow(page, totalPages, max = 7) {
    const tp = Math.max(1, parseInt(totalPages, 10) || 1);
    const n = Math.min(tp, max);
    let inicio = 1;
    if (tp > max) {
      const meio = Math.floor(max / 2);
      if (page <= meio + 1) inicio = 1;
      else if (page >= tp - meio) inicio = tp - max + 1;
      else inicio = page - meio;
    }
    return Array.from({ length: n }, (_, i) => inicio + i);
  }

  /**
   * HTML do controle de paginação. Devolve '' quando tudo cabe numa página —
   * paginação que não pagina é só ruído na tela.
   *
   * @param {object} info  retorno de `paginate`
   * @param {{sizes?: number[], label?: string}} [opts]
   * @returns {string}
   */
  function pagination(info, opts = {}) {
    if (!info || info.total <= info.pageSize) return '';
    const sizes = opts.sizes || PAGE_SIZES;
    const label = opts.label || 'itens';
    const paginas = pageWindow(info.page, info.totalPages);

    return `
      <div class="rh-pagination" role="navigation" aria-label="Paginação de ${esc(label)}">
        <div style="color:var(--color-text-muted);font-size:13px;">
          ${info.start + 1}–${info.end} de ${info.total}
          <select class="rh-pager-size" aria-label="Itens por página" style="margin-left:8px;padding:4px 8px;border-radius:5px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font-size:13px;font-family:inherit;">
            ${sizes.map((n) => `<option value="${n}" ${info.pageSize === n ? 'selected' : ''}>${n} por página</option>`).join('')}
          </select>
        </div>
        <div class="rh-pagination__pages">
          <button class="rh-pagination__btn" data-pg-prev aria-label="Página anterior" ${info.page === 1 ? 'disabled' : ''}>‹</button>
          ${paginas
            .map(
              (pg) =>
                `<button class="rh-pagination__btn ${info.page === pg ? 'is-active' : ''}" data-pg="${pg}" aria-label="Página ${pg}"${info.page === pg ? ' aria-current="page"' : ''}>${pg}</button>`
            )
            .join('')}
          <button class="rh-pagination__btn" data-pg-next aria-label="Próxima página" ${info.page === info.totalPages ? 'disabled' : ''}>›</button>
        </div>
      </div>`;
  }

  /**
   * Liga os cliques do controle. `onChange({page, pageSize})` deve guardar o
   * estado na view e re-renderizar.
   *
   * @param {ParentNode} root       elemento que contém o controle
   * @param {object} info           retorno de `paginate`
   * @param {(s:{page:number,pageSize:number}) => void} onChange
   */
  function wirePagination(root, info, onChange) {
    if (!root || typeof onChange !== 'function') return;

    const prev = root.querySelector('[data-pg-prev]');
    if (prev) prev.addEventListener('click', () => {
      if (info.page > 1) onChange({ page: info.page - 1, pageSize: info.pageSize });
    });

    const next = root.querySelector('[data-pg-next]');
    if (next) next.addEventListener('click', () => {
      if (info.page < info.totalPages) onChange({ page: info.page + 1, pageSize: info.pageSize });
    });

    root.querySelectorAll('[data-pg]').forEach((b) => {
      b.addEventListener('click', () => {
        const pg = parseInt(b.getAttribute('data-pg'), 10);
        if (Number.isFinite(pg) && pg !== info.page) onChange({ page: pg, pageSize: info.pageSize });
      });
    });

    const sel = root.querySelector('.rh-pager-size');
    // Trocar o tamanho volta para a página 1: manter a página faria o usuário
    // cair num intervalo que não corresponde ao que ele estava vendo.
    if (sel) sel.addEventListener('change', (e) => {
      onChange({ page: 1, pageSize: parseInt(e.target.value, 10) || DEFAULT_PAGE_SIZE });
    });
  }

  // ─────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────
  window.UIKit = {
    statusPill, skeleton, empty, breadcrumb, smartBack, avatar,
    showUndoToast, toast, deleteWithUndo, persistFilter, sortable,
    density, autosave, esc,
    // Padrão de cabeçalho B (KPIs + Toolbar) + visualizações
    pageHeader, kpiGrid, toolbar, chips, kanban, viewToggle,
    // Paginação (Wave 2) — ver test/paginacao.test.js
    paginate, pageWindow, pagination, wirePagination, PAGE_SIZES, DEFAULT_PAGE_SIZE,
  };
})();
