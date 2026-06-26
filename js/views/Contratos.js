window.Contratos = {
  // Filtros persistidos via UIKit.persistFilter (sobrevivem a reload e navegação)
  _filterStore:
    window.UIKit?.persistFilter?.('contratos', {
      currentFilter: 'todos',
      currentSearch: '',
      sortField: null,
      sortDir: 'asc',
    }) || null,
  get currentFilter() {
    return this._filterStore?.get('currentFilter') ?? 'todos';
  },
  set currentFilter(v) {
    this._filterStore?.set('currentFilter', v);
  },
  get currentSearch() {
    return this._filterStore?.get('currentSearch') ?? '';
  },
  set currentSearch(v) {
    this._filterStore?.set('currentSearch', v);
  },
  get sortField() {
    return this._filterStore?.get('sortField') ?? null;
  },
  set sortField(v) {
    this._filterStore?.set('sortField', v);
  },
  get sortDir() {
    return this._filterStore?.get('sortDir') ?? 'asc';
  },
  set sortDir(v) {
    this._filterStore?.set('sortDir', v);
  },
  currentPage: 1,
  pageSize: 25,
  _favs: new Set(JSON.parse(localStorage.getItem('rhino-favs') || '[]')),
  _selectedIds: new Set(),
  _currentFiltered: [],

  _resetPage() {
    this.currentPage = 1;
  },

  _toggleFav(id) {
    if (this._favs.has(id)) {
      this._favs.delete(id);
    } else {
      this._favs.add(id);
    }
    localStorage.setItem('rhino-favs', JSON.stringify([...this._favs]));
    this.render();
  },

  _pushRecent(id) {
    const recent = JSON.parse(localStorage.getItem('rhino-recent') || '[]').filter((r) => r !== id);
    recent.unshift(id);
    localStorage.setItem('rhino-recent', JSON.stringify(recent.slice(0, 5)));
  },

  _relDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return String(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dn = new Date(d);
    dn.setHours(0, 0, 0, 0);
    const diff = Math.round((dn - now) / 86400000);
    const abs = Math.abs(diff);
    const fmt = new Intl.DateTimeFormat('pt-BR').format(d);
    let rel;
    if (abs === 0) rel = 'hoje';
    else if (abs === 1) rel = diff < 0 ? 'ontem' : 'amanhã';
    else if (abs < 7) rel = diff < 0 ? `há ${abs} dias` : `em ${abs} dias`;
    else if (abs < 30)
      rel = diff < 0 ? `há ${Math.round(abs / 7)} sem.` : `em ${Math.round(abs / 7)} sem.`;
    else if (abs < 365)
      rel = diff < 0 ? `há ${Math.round(abs / 30)} meses` : `em ${Math.round(abs / 30)} meses`;
    else
      rel = diff < 0 ? `há ${Math.round(abs / 365)} ano(s)` : `em ${Math.round(abs / 365)} ano(s)`;
    return `<span class="rh-reldate" title="${fmt}">${rel}</span>`;
  },

  _skeletonHtml() {
    const row = () => `
      <tr>
        <td><div class="skeleton skeleton--lg" style="width:70%;"></div></td>
        <td><div class="skeleton" style="width:55%;"></div></td>
        <td><div class="skeleton" style="width:45%;"></div></td>
        <td><div class="skeleton" style="width:50%;"></div></td>
        <td><div class="skeleton skeleton--circle" style="width:36px;height:36px;margin:auto;"></div></td>
        <td><div class="skeleton" style="width:60px;border-radius:99px;"></div></td>
        <td><div class="skeleton" style="width:80px;"></div></td>
      </tr>`;
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Contratos</h1>
          <p class="page-subtitle">Gerenciar contratos de serviços</p>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table><tbody>${row()}${row()}${row()}${row()}</tbody></table>
        </div>
      </div>`;
  },

  _sortContracts(list) {
    if (!this.sortField) return list;
    return [...list].sort((a, b) => {
      let va = a[this.sortField] ?? '';
      let vb = b[this.sortField] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return this.sortDir === 'asc' ? cmp : -cmp;
    });
  },

  _setSort(field) {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'asc';
    }
    this.render();
  },

  _sortIcon(field) {
    if (this.sortField !== field) return '<span style="opacity:.3;font-size:11px;">⇕</span>';
    return this.sortDir === 'asc'
      ? '<span style="font-size:11px;color:var(--color-primary);">▲</span>'
      : '<span style="font-size:11px;color:var(--color-primary);">▼</span>';
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = this._skeletonHtml();

    try {
      // /api/rdos é independente de loadAll() — dispara as duas em paralelo
      // (antes era cascata: loadAll → /api/rdos = 2× a latência de rede).
      const rdoStatsPromise = fetch('/api/rdos')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j ? j.stats || null : null))
        .catch((e) => {
          console.warn(
            '[Contratos] /api/rdos falhou — selos de compliance ficarão ocultos:',
            e?.message || e
          );
          return null;
        });

      await Store.loadAll();

      let filtered = Store.state.contracts;
      if (this.currentFilter !== 'todos') {
        filtered = filtered.filter((c) => c.status === this.currentFilter);
      }
      const q = this.currentSearch.toLowerCase().trim();
      if (q) {
        filtered = filtered.filter(
          (c) =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.client || '').toLowerCase().includes(q) ||
            (c.contractNumber || '').toLowerCase().includes(q)
        );
      }
      const totalAtivos = Store.state.contracts.filter((c) => c.status === 'ativo').length;
      const favFiltered = this._sortContracts(filtered.filter((c) => this._favs.has(c.id)));
      const nonFavFiltered = this._sortContracts(filtered.filter((c) => !this._favs.has(c.id)));
      filtered = [...favFiltered, ...nonFavFiltered];
      this._currentFiltered = filtered;

      const totalFiltered = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalFiltered / this.pageSize));
      if (this.currentPage > totalPages) this.currentPage = totalPages;
      const pageStart = (this.currentPage - 1) * this.pageSize;
      const pagedContracts = filtered.slice(pageStart, pageStart + this.pageSize);

      // Compliance de RDOs (não-bloqueante) — fetch disparado no início do render
      const rdoStats = await rdoStatsPromise;
      const semRdoIds = new Set((rdoStats?.obrasSemRdoOntem || []).map((o) => o.contractId));
      const atrasadasMap = new Map((rdoStats?.obrasAtrasadas || []).map((o) => [o.contractId, o]));

      const _podeEditar =
        !window.perfil || !window.perfil.podeEditar || window.perfil.podeEditar('#/contratos');
      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Contratos</h1>
            <p class="page-subtitle">Gerenciar contratos de serviços</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="#/comparativo" class="btn btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;">${window.rhIcon('bar-chart', 15)}Comparativo</a>
            <button class="btn btn-secondary" id="btnExportCSV" title="Exportar lista em CSV" style="display:inline-flex;align-items:center;gap:6px;">${window.rhIcon('download', 15)}CSV</button>
            ${_podeEditar ? `<button class="btn btn-primary btn-lg" id="btnNovoContrato">+ Novo Contrato</button>` : ''}
          </div>
        </div>

        ${
          rdoStats && !rdoStats.ehFimDeSemana && rdoStats.obrasSemRdoOntem.length > 0
            ? `
          <div style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;padding:10px 14px;border-radius:8px;margin-bottom:var(--sp-md);font-size:14px;">
            ⚠ <strong>${rdoStats.obrasSemRdoOntem.length} obra(s)</strong> sem RDO no último dia útil. Linhas marcadas com 🔴 abaixo. <a href="#/rdos" style="color:#991b1b;font-weight:700;">Ver detalhes →</a>
          </div>
        `
            : ''
        }

        <div class="filters-bar" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
          <div class="filter-group" style="flex:1;min-width:200px;">
            <label class="filter-label">Buscar</label>
            <input type="search" class="form-control filter-control" id="filterSearch"
              placeholder="Nome, cliente ou número..." value="${escapeHtml(this.currentSearch)}"
              style="width:100%;">
          </div>
          <div class="filter-group">
            <label class="filter-label">Status</label>
            <select class="form-control filter-control" id="filterStatus">
              <option value="todos" ${this.currentFilter === 'todos' ? 'selected' : ''}>Todos</option>
              <option value="prospeccao" ${this.currentFilter === 'prospeccao' ? 'selected' : ''}>Prospecção</option>
              <option value="nao_aprovado" ${this.currentFilter === 'nao_aprovado' ? 'selected' : ''}>Não aprovado</option>
              <option value="nao_iniciado" ${this.currentFilter === 'nao_iniciado' ? 'selected' : ''}>Não iniciado</option>
              <option value="ativo" ${this.currentFilter === 'ativo' ? 'selected' : ''}>Ativo</option>
              <option value="pausado" ${this.currentFilter === 'pausado' ? 'selected' : ''}>Pausado</option>
              <option value="concluido" ${this.currentFilter === 'concluido' ? 'selected' : ''}>Concluído</option>
              <option value="cancelado" ${this.currentFilter === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
          </div>
        </div>

        ${(() => {
          const recentIds = JSON.parse(localStorage.getItem('rhino-recent') || '[]').filter((id) =>
            Store.getContractById(id)
          );
          if (!recentIds.length) return '';
          return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <span style="font-size:12px;color:var(--color-text-muted);white-space:nowrap;">Recentes:</span>
            ${recentIds
              .map((rid) => {
                const rc = Store.getContractById(rid);
                if (!rc) return '';
                const label = escapeHtml(rc.name.slice(0, 22)) + (rc.name.length > 22 ? '…' : '');
                return `<button class="btn-recent-chip" data-id="${rid}" style="font-size:12px;padding:3px 10px;border-radius:99px;border:1px solid var(--color-border);background:var(--color-surface);cursor:pointer;white-space:nowrap;">${label}</button>`;
              })
              .join('')}
          </div>`;
        })()}

        <div style="font-size:13px;color:var(--color-text-muted);margin-bottom:8px;margin-top:4px;">
          <strong style="color:var(--color-text);">${totalFiltered}</strong> contrato${totalFiltered !== 1 ? 's' : ''}
          ${this.currentFilter !== 'todos' || q ? '' : ` · <strong style="color:var(--color-success);">${totalAtivos}</strong> ativo${totalAtivos !== 1 ? 's' : ''}`}
          ${q ? ` encontrado${totalFiltered !== 1 ? 's' : ''} para "<em>${escapeHtml(q)}</em>"` : ''}
        </div>

        <div class="card">
          <div class="rh-status-chips" style="display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px 0;">
            ${[
              { v: 'todos', l: 'Todos' },
              { v: 'ativo', l: 'Ativo' },
              { v: 'prospeccao', l: 'Prospecção' },
              { v: 'nao_iniciado', l: 'Não iniciado' },
              { v: 'nao_aprovado', l: 'Não aprovado' },
              { v: 'pausado', l: 'Pausado' },
              { v: 'concluido', l: 'Concluído' },
              { v: 'cancelado', l: 'Cancelado' },
            ]
              .map(
                (s) =>
                  `<button class="rh-chip${this.currentFilter === s.v ? ' is-active' : ''}" data-status="${s.v}">${s.l}</button>`
              )
              .join('')}
          </div>
          <div class="table-wrap">
            <table class="rh-table--sticky ui-stick-col-2">
              <thead>
                <tr>
                  <th scope="col" style="width:36px;padding-left:12px;"><input type="checkbox" id="chkAll" title="Selecionar todos na página" style="cursor:pointer;width:16px;height:16px;"></th>
                  <th scope="col" style="cursor:pointer;user-select:none;white-space:nowrap;" class="th-sort" data-col="name">Nome ${this._sortIcon('name')}</th>
                  <th scope="col" style="cursor:pointer;user-select:none;white-space:nowrap;" class="th-sort" data-col="client">Cliente ${this._sortIcon('client')}</th>
                  <th scope="col" style="cursor:pointer;user-select:none;white-space:nowrap;" class="th-sort" data-col="value">Valor ${this._sortIcon('value')}</th>
                  <th scope="col" style="cursor:pointer;user-select:none;white-space:nowrap;" class="th-sort" data-col="startDate">Período ${this._sortIcon('startDate')}</th>
                  <th scope="col" style="text-align:center;">Equipe</th>
                  <th scope="col" style="cursor:pointer;user-select:none;white-space:nowrap;" class="th-sort" data-col="status">Status ${this._sortIcon('status')}</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${
                  pagedContracts.length === 0
                    ? `
                  <tr>
                    <td colspan="8" style="padding:0;border:0;">
                      ${(
                        window.RhinoUI?.emptyState ||
                        (() =>
                          '<div style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">Nenhum contrato encontrado</div>')
                      )({
                        icon: q ? '🔍' : this.currentFilter !== 'todos' ? '📭' : '📋',
                        title: q
                          ? `Nenhum resultado para "${escapeHtml(q)}"`
                          : this.currentFilter !== 'todos'
                            ? 'Nenhum contrato com este status'
                            : 'Nenhum contrato cadastrado',
                        message: q
                          ? 'Tente outro termo de busca.'
                          : this.currentFilter !== 'todos'
                            ? 'Altere o filtro para ver outros contratos.'
                            : 'Crie o primeiro contrato para começar.',
                        cta:
                          !q && this.currentFilter === 'todos' && _podeEditar
                            ? { label: '+ Novo Contrato' }
                            : null,
                      })}
                    </td>
                  </tr>
                `
                    : pagedContracts
                        .map((c) => {
                          const nOrg = (c.organograma || []).length;
                          const nRec = (Store.state.recursos || []).filter(
                            (r) =>
                              r.status === 'funcionario' && r.alocacaoAtual?.contractId === c.id
                          ).length;
                          const total = Math.max(nOrg, nRec);
                          const bg = total === 0 ? '#9CA3AF' : '#55588B';
                          const medido = (Store.state.saidas || [])
                            .filter((s) => s.contractId === c.id)
                            .reduce((acc, s) => acc + (parseFloat(s.value) || 0), 0);
                          const pct = c.value > 0 ? Math.min(100, (medido / c.value) * 100) : 0;
                          const gaugeColor =
                            pct >= 100
                              ? 'var(--color-success)'
                              : pct >= 60
                                ? 'var(--color-warning)'
                                : 'var(--color-primary)';
                          return `
                  <tr class="row-contrato" data-id="${c.id}" style="cursor:pointer;">
                    <td class="js-stop" style="width:36px;padding-left:12px;">
                      <input type="checkbox" class="row-chk" data-id="${c.id}" ${this._selectedIds.has(c.id) ? 'checked' : ''} style="cursor:pointer;width:16px;height:16px;">
                    </td>
                    <td>
                      <strong>${escapeHtml(c.name)}</strong>
                      ${c.status === 'ativo' && semRdoIds.has(c.id) ? `<span title="Sem RDO no último dia útil" style="margin-left:6px;">🔴</span>` : ''}
                      ${c.status === 'ativo' && atrasadasMap.has(c.id) ? `<span title="${atrasadasMap.get(c.id).nuncaFezRdo ? 'Nunca fez RDO' : atrasadasMap.get(c.id).diasUteisSemRdo + ' dias úteis sem RDO'}" style="margin-left:4px;">⏰</span>` : ''}
                      ${(() => {
                        if (c.status !== 'ativo' || !c.endDate) return '';
                        const dias = Math.ceil((new Date(c.endDate) - new Date()) / 86400000);
                        if (dias < 0)
                          return `<span title="Contrato vencido há ${Math.abs(dias)} dias" style="margin-left:4px;padding:1px 6px;border-radius:99px;font-size:11px;font-weight:700;background:#FEE2E2;color:#DC2626;">VENCIDO</span>`;
                        if (dias <= 30)
                          return `<span title="Vence em ${dias} dia${dias !== 1 ? 's' : ''}" style="margin-left:4px;padding:1px 6px;border-radius:99px;font-size:11px;font-weight:700;background:#FEF3C7;color:#D97706;">⚠ ${dias}d</span>`;
                        return '';
                      })()}
                    </td>
                    <td>${escapeHtml(c.client)}</td>
                    <td>
                      ${Store.formatBRL(c.value)}
                      <div style="margin-top:4px;height:4px;border-radius:99px;background:var(--color-border);width:80px;">
                        <div style="height:4px;border-radius:99px;width:${pct.toFixed(0)}%;background:${gaugeColor};" title="${pct.toFixed(1)}% medido"></div>
                      </div>
                      <div style="font-size:11px;color:var(--color-text-muted);">${pct.toFixed(0)}% medido</div>
                    </td>
                    <td>
                      <div>${this._relDate(c.startDate)}</div>
                      <div style="font-size:11px;color:var(--color-text-muted);">até ${this._relDate(c.endDate)}</div>
                    </td>
                    <td style="text-align:center;">
                      <div title="${nOrg} no organograma · ${nRec} recurso(s) alocado(s)" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:${bg};border-radius:99px;font-weight:700;color:#FFFFFF;box-shadow:0 1px 3px rgba(85,88,139,.2);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        ${total}
                      </div>
                    </td>
                    <td title="${{ prospeccao: 'Em prospecção — contrato ainda não confirmado', nao_aprovado: 'Não aprovado — proposta rejeitada pelo cliente', nao_iniciado: 'Não iniciado — contrato fechado, obra ainda não começou', ativo: 'Ativo — obra em andamento', pausado: 'Pausado — obra temporariamente suspensa', concluido: 'Concluído — obra finalizada', cancelado: 'Cancelado — contrato encerrado' }[c.status] || c.status}">${window.UIKit?.statusPill ? window.UIKit.statusPill(c.status) : `<span class="badge badge-${c.status}">${c.status}</span>`}</td>
                    <td>
                      <div class="actions-cell">
                        <button class="btn-fav action-link" data-id="${c.id}" title="${this._favs.has(c.id) ? 'Remover dos favoritos' : 'Fixar no topo'}">${this._favs.has(c.id) ? '★' : '☆'}</button>
                        <button type="button" class="action-link btn-abrir" data-id="${c.id}">Abrir</button>
                        ${
                          _podeEditar
                            ? `
                          <button type="button" class="action-link btn-editar" data-id="${c.id}">Editar</button>
                          <button type="button" class="action-link btn-duplicar" data-id="${c.id}" title="Duplicar contrato">Duplicar</button>
                          <button type="button" class="action-link danger btn-excluir" data-id="${c.id}">Excluir</button>
                        `
                            : ''
                        }
                      </div>
                    </td>
                  </tr>
                `;
                        })
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>

        ${
          totalFiltered > this.pageSize
            ? `
        <div class="rh-pagination">
          <div style="color:var(--color-text-muted);font-size:13px;">
            ${pageStart + 1}–${Math.min(pageStart + this.pageSize, totalFiltered)} de ${totalFiltered}
            <select class="rh-pager-size" title="Itens por página" style="margin-left:8px;padding:4px 8px;border-radius:5px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);font-size:13px;font-family:inherit;">
              ${[10, 25, 50, 100].map((n) => `<option value="${n}" ${this.pageSize === n ? 'selected' : ''}>${n} por página</option>`).join('')}
            </select>
          </div>
          <div class="rh-pagination__pages">
            <button class="rh-pagination__btn" id="rh-pg-prev" ${this.currentPage === 1 ? 'disabled' : ''}>‹</button>
            ${Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pg = i + 1;
              if (totalPages > 7) {
                if (this.currentPage <= 4) pg = i + 1;
                else if (this.currentPage >= totalPages - 3) pg = totalPages - 6 + i;
                else pg = this.currentPage - 3 + i;
              }
              return `<button class="rh-pagination__btn ${this.currentPage === pg ? 'is-active' : ''}" data-pg="${pg}">${pg}</button>`;
            }).join('')}
            <button class="rh-pagination__btn" id="rh-pg-next" ${this.currentPage === totalPages ? 'disabled' : ''}>›</button>
          </div>
        </div>`
            : ''
        }

        ${
          this._selectedIds.size > 0
            ? `
        <div class="rh-bulk-bar is-visible" id="rhBulkBar" aria-label="Ações para selecionados">
          <span class="rh-bulk-bar__count">${this._selectedIds.size} selecionado${this._selectedIds.size !== 1 ? 's' : ''}</span>
          <div class="rh-bulk-bar__actions">
            <button class="btn rh-bulk-btn" id="bulkStatus">Mudar status</button>
            <button class="btn rh-bulk-btn" id="bulkCSV" style="display:inline-flex;align-items:center;gap:6px;">${window.rhIcon('download', 15)}CSV</button>
            <button class="btn rh-bulk-btn danger" id="bulkDelete" style="display:inline-flex;align-items:center;gap:6px;">${window.rhIcon('trash-2', 15)}Excluir</button>
            <button class="btn rh-bulk-btn" id="bulkClear" style="display:inline-flex;align-items:center;gap:6px;">${window.rhIcon('x', 15)}Limpar</button>
          </div>
        </div>
        `
            : ''
        }
      `;

      app.innerHTML = html;
      document.body.classList.toggle('has-bulk-bar', this._selectedIds.size > 0);

      // Event listeners
      const btnNovo = document.getElementById('btnNovoContrato');
      if (btnNovo) btnNovo.addEventListener('click', () => this.showModal());

      // Status filter
      document.getElementById('filterStatus').addEventListener('change', (e) => {
        this.currentFilter = e.target.value;
        this.currentPage = 1;
        this.render();
      });

      // Text search (debounced)
      let _searchTimer;
      document.getElementById('filterSearch')?.addEventListener('input', (e) => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => {
          this.currentSearch = e.target.value;
          this.currentPage = 1;
          this.render();
        }, 220);
      });

      // Column sort headers
      document.querySelectorAll('.th-sort[data-col]').forEach((th) => {
        th.addEventListener('click', () => this._setSort(th.dataset.col));
      });

      // Click na linha → abre overview (não dispara se clicou em botão de ação)
      document.querySelectorAll('.row-contrato').forEach((tr) => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('.actions-cell')) return;
          this.showOverview(tr.dataset.id);
        });
      });

      // "Abrir" — navega para o detalhe do contrato (mesma ação de clicar na linha)
      document.querySelectorAll('.btn-abrir').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          location.hash = '#/contratos/' + e.target.dataset.id;
        });
      });

      document.querySelectorAll('.btn-editar').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showModal(e.target.dataset.id);
        });
      });

      document.querySelectorAll('.btn-duplicar').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.duplicateContract(e.target.dataset.id);
        });
      });

      document.querySelectorAll('.btn-excluir').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteContract(e.target.dataset.id);
        });
      });

      // CSV export
      document.getElementById('btnExportCSV')?.addEventListener('click', () => this.exportCSV());

      // Pagination controls
      document.getElementById('rh-pg-prev')?.addEventListener('click', () => {
        this.currentPage--;
        this.render();
      });
      document.getElementById('rh-pg-next')?.addEventListener('click', () => {
        this.currentPage++;
        this.render();
      });
      document.querySelectorAll('.rh-pagination__btn[data-pg]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.currentPage = parseInt(btn.dataset.pg);
          this.render();
        });
      });
      document.querySelector('.rh-pager-size')?.addEventListener('change', (e) => {
        this.pageSize = parseInt(e.target.value);
        this.currentPage = 1;
        this.render();
      });

      // Favorites
      document.querySelectorAll('.btn-fav').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggleFav(e.currentTarget.dataset.id);
        });
      });

      // Recent chips
      document.querySelectorAll('.btn-recent-chip').forEach((btn) => {
        btn.addEventListener('click', () => this.showOverview(btn.dataset.id));
      });

      // Status quick chips
      document.querySelectorAll('.rh-chip[data-status]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.currentFilter = btn.dataset.status;
          document.getElementById('filterStatus').value = btn.dataset.status;
          this._resetPage();
          this.render();
        });
      });

      // Inline name edit (dblclick)
      document.querySelectorAll('.row-contrato td:first-child strong').forEach((el) => {
        el.title = 'Duplo-clique para editar';
        el.style.cursor = 'text';
        el.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const id = el.closest('tr').dataset.id;
          const c = Store.getContractById(id);
          if (!c) return;
          const td = el.closest('td');
          const orig = c.name;
          const inp = document.createElement('input');
          inp.value = orig;
          inp.className = 'form-control';
          inp.style.cssText =
            'width:100%;min-width:120px;font-weight:700;padding:3px 8px;font-size:inherit;';
          td.replaceChild(inp, el);
          inp.focus();
          inp.select();
          let saved = false;
          const save = async () => {
            if (saved) return;
            saved = true;
            const newName = inp.value.trim();
            if (!newName || newName === orig) {
              this.render();
              return;
            }
            try {
              const res = await fetch('/api/contracts/' + id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              // Atualiza store sem mutar: recarrega via loadAll
              await Store.loadAll();
              window.showToast('Nome atualizado', 'success');
            } catch (err) {
              window.showToast('Erro ao salvar: ' + (err.message || 'falha'), 'error');
            }
            this.render();
          };
          inp.addEventListener('blur', save);
          inp.addEventListener('keydown', (e2) => {
            if (e2.key === 'Enter') {
              e2.preventDefault();
              inp.blur();
            }
            if (e2.key === 'Escape') {
              saved = true;
              inp.removeEventListener('blur', save);
              this.render();
            }
          });
        });
      });

      // Swipe to delete (mobile)
      document.querySelectorAll('.row-contrato').forEach((tr) => {
        let startX = 0,
          startY = 0,
          swiped = false;
        tr.addEventListener(
          'touchstart',
          (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            swiped = false;
          },
          { passive: true }
        );
        tr.addEventListener(
          'touchmove',
          (e) => {
            const dx = e.touches[0].clientX - startX;
            const dy = Math.abs(e.touches[0].clientY - startY);
            if (dy > 20) return;
            if (dx < -40) {
              tr.style.transform = `translateX(${Math.max(dx, -80)}px)`;
              tr.style.transition = 'none';
              swiped = dx < -70;
            }
          },
          { passive: true }
        );
        tr.addEventListener(
          'touchend',
          () => {
            if (swiped) {
              tr.style.transition = 'transform .2s';
              tr.style.transform = 'translateX(-80px)';
              if (!tr.querySelector('.swipe-del-btn')) {
                const btn = document.createElement('button');
                btn.className = 'swipe-del-btn';
                btn.innerHTML = window.rhIcon('trash-2', 16);
                btn.style.cssText =
                  'position:absolute;right:0;top:0;bottom:0;width:80px;background:#dc2626;color:#fff;border:0;font-size:18px;cursor:pointer;';
                btn.addEventListener('click', () => {
                  this.deleteContract(tr.dataset.id);
                });
                tr.style.position = 'relative';
                tr.appendChild(btn);
              }
            } else {
              tr.style.transition = 'transform .2s';
              tr.style.transform = '';
            }
          },
          { passive: true }
        );
      });

      // ── Empty state CTA
      document.querySelector('[data-empty-cta]')?.addEventListener('click', () => this.showModal());

      // ── Checkbox: select all
      document.getElementById('chkAll')?.addEventListener('change', (e) => {
        pagedContracts.forEach((c) => {
          if (e.target.checked) this._selectedIds.add(c.id);
          else this._selectedIds.delete(c.id);
        });
        this.render();
      });

      // ── Checkboxes: individual rows
      document.querySelectorAll('.row-chk').forEach((chk) => {
        chk.addEventListener('change', (e) => {
          if (e.target.checked) this._selectedIds.add(e.target.dataset.id);
          else this._selectedIds.delete(e.target.dataset.id);
          const all = document.getElementById('chkAll');
          if (all) {
            const checked = document.querySelectorAll('.row-chk:checked').length;
            const total = document.querySelectorAll('.row-chk').length;
            all.indeterminate = checked > 0 && checked < total;
            all.checked = total > 0 && checked === total;
          }
          document.body.classList.toggle('has-bulk-bar', this._selectedIds.size > 0);
          const bar = document.getElementById('rhBulkBar');
          if (bar)
            bar.querySelector('.rh-bulk-bar__count').textContent =
              `${this._selectedIds.size} selecionado${this._selectedIds.size !== 1 ? 's' : ''}`;
        });
      });

      // ── Bulk: clear
      document.getElementById('bulkClear')?.addEventListener('click', () => {
        this._selectedIds.clear();
        document.body.classList.remove('has-bulk-bar');
        this.render();
      });

      // ── Bulk: export CSV (selected only)
      document.getElementById('bulkCSV')?.addEventListener('click', () => {
        const selected = Store.state.contracts.filter((c) => this._selectedIds.has(c.id));
        if (!selected.length) return;
        const rows = [
          ['Nome', 'Cliente', 'Nº Contrato', 'Status', 'Valor (R$)', 'Início', 'Fim'],
          ...selected.map((c) => [
            c.name || '',
            c.client || '',
            c.contractNumber || '',
            c.status || '',
            (c.value || 0).toString().replace('.', ','),
            c.startDate || '',
            c.endDate || '',
          ]),
        ];
        const csv =
          '﻿' +
          rows
            .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
            .join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contratos-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        window.showToast(`${selected.length} contratos exportados`, 'success');
      });

      // ── Bulk: change status
      document.getElementById('bulkStatus')?.addEventListener('click', async () => {
        const statuses = [
          'prospeccao',
          'nao_aprovado',
          'nao_iniciado',
          'ativo',
          'pausado',
          'concluido',
          'cancelado',
        ];
        const novo = prompt(
          `Novo status para ${this._selectedIds.size} contrato(s):\n\n${statuses.join('\n')}`
        );
        if (!novo) return;
        const status = novo.trim().toLowerCase();
        if (!statuses.includes(status)) {
          window.showToast('Status inválido', 'warning');
          return;
        }
        try {
          const ids = [...this._selectedIds];
          await Promise.all(ids.map(id => Store.updateContract(id, { status })));
          window.showToast(`${ids.length} contrato(s) atualizados para "${status}"`, 'success');
          this._selectedIds.clear();
          this.render();
        } catch (e) {
          window.showToast('Erro: ' + e.message, 'error');
        }
      });

      // ── Bulk: delete
      document.getElementById('bulkDelete')?.addEventListener('click', async () => {
        const n = this._selectedIds.size;
        if (!confirm(`Excluir ${n} contrato(s) selecionado(s)? Esta ação não pode ser desfeita.`))
          return;
        try {
          const ids = [...this._selectedIds];
          await Promise.all(ids.map(id => Store.deleteContract(id)));
          this._selectedIds.clear();
          window.showToast(`${n} contrato(s) excluídos`, 'success');
          this.render();
        } catch (e) {
          window.showToast('Erro: ' + e.message, 'error');
        }
      });

      // ── Keyboard navigation (J/K/Enter/Esc)
      let _kbIdx = -1;
      const _kbRows = [...document.querySelectorAll('.row-contrato')];
      const _kbFocus = (idx) => {
        _kbRows.forEach((r, i) => r.classList.toggle('is-kbfocused', i === idx));
        if (_kbRows[idx]) _kbRows[idx].scrollIntoView({ block: 'nearest' });
        _kbIdx = idx;
      };
      const _kbKey = (e) => {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
        if (e.key === 'j' || (e.key === 'ArrowDown' && !e.altKey)) {
          e.preventDefault();
          _kbFocus(Math.min(_kbIdx + 1, _kbRows.length - 1));
        } else if (e.key === 'k' || (e.key === 'ArrowUp' && !e.altKey)) {
          e.preventDefault();
          _kbFocus(Math.max(_kbIdx - 1, 0));
        } else if (e.key === 'Enter' && _kbIdx >= 0 && _kbRows[_kbIdx]) {
          _kbRows[_kbIdx].click();
        }
      };
      document.addEventListener('keydown', _kbKey);
      // Remove listener when view unmounts
      new MutationObserver((_, obs) => {
        if (!document.querySelector('.row-contrato')) {
          document.removeEventListener('keydown', _kbKey);
          obs.disconnect();
        }
      }).observe(document.getElementById('app') || document.body, { childList: true });
    } catch (e) {
      console.error(e);
      app.innerHTML =
        '<div class="card"><p class="text-danger">Erro ao carregar contratos. Tente novamente.</p></div>';
    }
  },

  showOverview(contractId) {
    this._pushRecent(contractId);
    const c = Store.getContractById(contractId);
    if (!c) return;

    const fmt = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fim = c.endDate ? new Date(c.endDate) : null;
    const diasRestantes = fim ? Math.ceil((fim - hoje) / 86400000) : null;

    const saidas = (Store.state.saidas || []).filter((s) => s.contractId === c.id);
    const totalMedido = saidas.reduce((acc, s) => acc + (parseFloat(s.value) || 0), 0);
    const margem = parseFloat(c.value || 0) - totalMedido;
    const marginPct = c.value > 0 ? (margem / c.value) * 100 : 0;

    const orgCount = (c.organograma || []).length;
    const recCount = (Store.state.recursos || []).filter(
      (r) => r.status === 'funcionario' && r.alocacaoAtual?.contractId === c.id
    ).length;
    const rdoCount = (c.rdos || []).length;
    const budget = c.budget || [];
    const totalBudget = budget.reduce((acc, b) => acc + (parseFloat(b.value) || 0), 0);
    const nfs = (Store.state.notas_fiscais || []).filter((n) => n.contractId === c.id);
    const nfsEmitidas = nfs.filter((n) => n.emitida).length;

    const statusColors = {
      ativo: { bg: 'rgba(16,185,129,.15)', fg: '#10b981', border: 'rgba(16,185,129,.4)' },
      concluido: { bg: 'rgba(59,130,246,.15)', fg: '#3b82f6', border: 'rgba(59,130,246,.4)' },
      cancelado: { bg: 'rgba(220,38,38,.15)', fg: '#dc2626', border: 'rgba(220,38,38,.4)' },
      pausado: { bg: 'rgba(245,158,11,.15)', fg: '#f59e0b', border: 'rgba(245,158,11,.4)' },
      prospeccao: { bg: 'rgba(139,92,246,.15)', fg: '#8b5cf6', border: 'rgba(139,92,246,.4)' },
      nao_iniciado: { bg: 'rgba(107,114,128,.15)', fg: '#6b7280', border: 'rgba(107,114,128,.4)' },
      nao_aprovado: { bg: 'rgba(249,115,22,.15)', fg: '#f97316', border: 'rgba(249,115,22,.4)' },
    };
    const col = statusColors[c.status] || {
      bg: 'var(--color-bg)',
      fg: 'var(--color-text)',
      border: 'var(--color-border)',
    };

    const backdropEl = document.createElement('div');
    backdropEl.className = 'rh-drawer__backdrop';
    const drawerEl = document.createElement('div');
    drawerEl.className = 'rh-drawer';
    drawerEl.setAttribute('role', 'dialog');
    drawerEl.setAttribute('aria-modal', 'true');
    drawerEl.setAttribute('aria-label', c.name);

    drawerEl.innerHTML = `
      <div class="rh-drawer__inner">
        <div class="rh-drawer__header">
          <div style="min-width:0;">
            <h2 style="margin:0;font-size:18px;word-break:break-word;">${escapeHtml(c.name)}</h2>
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px;font-size:14px;color:var(--color-text-muted);">
              <span>${escapeHtml(c.client)}</span>
              ${c.contractNumber ? `<span style="font-family:monospace;">#${escapeHtml(c.contractNumber)}</span>` : ''}
              <span style="background:${col.bg};color:${col.fg};border:1px solid ${col.border};font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.05em;padding:2px 9px;border-radius:99px;">${c.status}</span>
            </div>
          </div>
          <button class="rh-drawer__close" aria-label="Fechar painel">✕</button>
        </div>
        <div class="rh-drawer__body">
          <!-- KPIs -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);margin-bottom:var(--sp-lg);">
            <div style="padding:var(--sp-md);background:var(--color-bg);border-radius:8px;border:1px solid var(--color-border);">
              <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Valor</div>
              <div style="font-size:17px;font-weight:700;color:#3b82f6;margin-top:4px;">${Store.formatBRL(c.value)}</div>
            </div>
            <div style="padding:var(--sp-md);background:var(--color-bg);border-radius:8px;border:1px solid var(--color-border);">
              <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Medido</div>
              <div style="font-size:17px;font-weight:700;color:#10b981;margin-top:4px;">${Store.formatBRL(totalMedido)}</div>
              <div style="font-size:11px;color:var(--color-text-muted);">${saidas.length} medições</div>
            </div>
            <div style="padding:var(--sp-md);background:var(--color-bg);border-radius:8px;border:1px solid var(--color-border);">
              <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Margem</div>
              <div style="font-size:17px;font-weight:700;color:${margem >= 0 ? '#10b981' : '#dc2626'};margin-top:4px;">${Store.formatBRL(margem)}</div>
              <div style="font-size:11px;color:var(--color-text-muted);">${marginPct.toFixed(1)}%</div>
            </div>
            <div style="padding:var(--sp-md);background:var(--color-bg);border-radius:8px;border:1px solid var(--color-border);">
              <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Prazo</div>
              <div style="font-size:17px;font-weight:700;color:${diasRestantes === null ? '#999' : diasRestantes < 0 ? '#dc2626' : diasRestantes <= 30 ? '#f59e0b' : '#10b981'};margin-top:4px;">
                ${diasRestantes === null ? '—' : diasRestantes < 0 ? `${Math.abs(diasRestantes)}d vencido` : `${diasRestantes} dias`}
              </div>
              <div style="font-size:11px;color:var(--color-text-muted);">até ${fmt(c.endDate)}</div>
            </div>
          </div>

          <!-- Operacional -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-sm);padding:var(--sp-md);background:var(--color-bg);border-radius:8px;margin-bottom:var(--sp-lg);text-align:center;">
            <div><div style="font-size:20px;font-weight:700;">${orgCount}</div><div style="font-size:11px;color:var(--color-text-muted);">Organograma</div></div>
            <div><div style="font-size:20px;font-weight:700;">${recCount}</div><div style="font-size:11px;color:var(--color-text-muted);">Alocados</div></div>
            <div><div style="font-size:20px;font-weight:700;">${rdoCount}</div><div style="font-size:11px;color:var(--color-text-muted);">RDOs</div></div>
            <div><div style="font-size:20px;font-weight:700;">${nfsEmitidas}/${nfs.length}</div><div style="font-size:11px;color:var(--color-text-muted);">NFs emitidas</div></div>
          </div>

          <!-- Período -->
          <div style="margin-bottom:var(--sp-lg);">
            <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">Período</div>
            <div style="font-size:14px;line-height:1.9;">
              <div><strong>Início:</strong> ${fmt(c.startDate)}</div>
              <div><strong>Término:</strong> ${fmt(c.endDate)}</div>
              ${c.tendencyDate ? `<div><strong>Tendência:</strong> ${fmt(c.tendencyDate)}</div>` : ''}
            </div>
          </div>

          ${
            c.endereco
              ? `
          <div style="margin-bottom:var(--sp-lg);">
            <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">Local da obra</div>
            <div style="font-size:14px;">${escapeHtml(c.endereco)}</div>
          </div>
          `
              : ''
          }

          ${
            budget.length > 0
              ? `
          <div style="margin-bottom:var(--sp-lg);">
            <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Orçamento · ${Store.formatBRL(totalBudget)}</div>
            ${budget
              .slice(0, 4)
              .map(
                (b) => `
              <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--color-border);font-size:13px;">
                <span>${escapeHtml(b.description || '—')} <span style="color:var(--color-text-muted);">(${escapeHtml(b.type || '')})</span></span>
                <span style="font-weight:600;">${Store.formatBRL(b.value)}</span>
              </div>`
              )
              .join('')}
            ${budget.length > 4 ? `<div style="text-align:center;color:var(--color-text-muted);margin-top:6px;font-size:12px;">+ ${budget.length - 4} itens</div>` : ''}
          </div>
          `
              : ''
          }

          ${
            c.notes
              ? `
          <div>
            <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">Observações</div>
            <div style="font-size:14px;white-space:pre-wrap;">${escapeHtml(c.notes)}</div>
          </div>
          `
              : ''
          }
        </div>
        <div class="rh-drawer__footer">
          <button class="btn btn-secondary" id="btnOvClose">Fechar</button>
          <button class="btn btn-primary" id="btnOvVerDetalhes">Ver detalhes →</button>
        </div>
      </div>`;

    document.body.appendChild(backdropEl);
    document.body.appendChild(drawerEl);

    requestAnimationFrame(() => {
      backdropEl.classList.add('is-open');
      drawerEl.classList.add('is-open');
    });

    const close = () => {
      backdropEl.classList.remove('is-open');
      drawerEl.classList.remove('is-open');
      document.removeEventListener('keydown', onEsc);
      setTimeout(() => {
        backdropEl.remove();
        drawerEl.remove();
      }, 320);
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') close();
    };

    drawerEl.querySelector('.rh-drawer__close').addEventListener('click', close);
    document.getElementById('btnOvClose').addEventListener('click', close);
    document.getElementById('btnOvVerDetalhes').addEventListener('click', () => {
      close();
      location.hash = `#/contratos/${contractId}`;
    });
    document.addEventListener('keydown', onEsc);
    // Safety-net: se o usuário navegar para outra view com o drawer aberto, o
    // close() não roda e o listener vazaria no document. O flush do lifecycle
    // garante a remoção ao trocar de view. (removeEventListener é idempotente.)
    window.viewLifecycle?.onCleanup(() => document.removeEventListener('keydown', onEsc));
  },

  showModal(contractId) {
    // If duplicating, use the template data
    const contract = contractId
      ? Store.getContractById(contractId)
      : this._duplicateTemplate || null;
    if (this._duplicateTemplate) this._duplicateTemplate = null;
    const title = contract
      ? contractId
        ? 'Editar Contrato'
        : 'Novo Contrato (Cópia)'
      : 'Novo Contrato';
    const clientes = Store.state.clientes || [];

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:720px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formContrato" class="modal-content" style="max-height:70vh;overflow-y:auto;">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Número do Contrato</label>
                <input class="form-control" name="contractNumber" value="${escapeHtml(contract?.contractNumber || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Status *</label>
                <select class="form-control" name="status" required>
                  <option value="prospeccao" ${contract?.status === 'prospeccao' ? 'selected' : ''}>Prospecção</option>
                  <option value="nao_aprovado" ${contract?.status === 'nao_aprovado' ? 'selected' : ''}>Não aprovado</option>
                  <option value="nao_iniciado" ${contract?.status === 'nao_iniciado' ? 'selected' : ''}>Não iniciado</option>
                  <option value="ativo" ${!contract || contract.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                  <option value="pausado" ${contract?.status === 'pausado' ? 'selected' : ''}>Pausado</option>
                  <option value="concluido" ${contract?.status === 'concluido' ? 'selected' : ''}>Concluído</option>
                  <option value="cancelado" ${contract?.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Nome do Contrato *</label>
              <input class="form-control" name="name" value="${escapeHtml(contract?.name || '')}" required>
            </div>

            <div style="border-top:1px solid var(--color-border);padding-top:var(--sp-lg);margin-top:var(--sp-lg);">
              <h3 class="card-title mb-md">Dados do Cliente</h3>
              <div class="form-group">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                  <label class="form-label" style="margin:0;">Cliente *</label>
                  ${clientes.length === 0 ? `<a href="#/clientes" id="linkCadastrarCliente" style="font-size:15px;color:var(--color-primary);text-decoration:none;">+ Cadastrar cliente →</a>` : `<a href="#/clientes" id="linkCadastrarCliente" style="font-size:15px;color:var(--color-primary);text-decoration:none;">Gerenciar clientes →</a>`}
                </div>
                ${
                  clientes.length > 0
                    ? `
                  <select class="form-control" name="clientId" id="selectCliente" required>
                    <option value="">— Selecionar cliente —</option>
                    ${clientes
                      .map((c) => {
                        const label = c.nome + (c.empresa ? ` · ${c.empresa}` : '');
                        const selected =
                          contract?.clientId === c.id ||
                          (!contract?.clientId &&
                            (contract?.client === c.nome ||
                              contract?.client === c.nome + (c.empresa ? ` (${c.empresa})` : '') ||
                              contract?.client === c.nome + (c.empresa ? ` · ${c.empresa}` : '')));
                        return `<option value="${c.id}" ${selected ? 'selected' : ''}>${label}</option>`;
                      })
                      .join('')}
                    <option value="__outro__">✏️ Digitar manualmente...</option>
                  </select>
                  <input class="form-control" name="clientManual" id="inputClienteManual" placeholder="Nome do cliente" style="margin-top:6px;display:none;" value="${!contract?.clientId && !clientes.some((c) => contract?.client === c.nome) ? contract?.client || '' : ''}">
                `
                    : `
                  <input class="form-control" name="clientManual" id="inputClienteManual" value="${contract?.client || ''}" required placeholder="Nome do cliente ou empresa">
                `
                }
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">CPF/CNPJ</label>
                  <input class="form-control" name="clientDocument" value="${escapeHtml(contract?.clientDocument || '')}">
                </div>
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input class="form-control" name="clientEmail" type="email" value="${escapeHtml(contract?.clientEmail || '')}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Telefone</label>
                <input class="form-control" name="clientPhone" data-phone inputmode="numeric" maxlength="16" value="${contract?.clientPhone ? window.formatPhoneBR(contract.clientPhone) : ''}" placeholder="(00) 00000-0000">
              </div>
              <div class="form-group">
                <label class="form-label">Endereço / Local da Obra</label>
                <div style="position:relative;" id="enderecoWrap">
                  <input class="form-control" id="enderecoInput" name="endereco"
                    value="${escapeHtml(contract?.endereco || '')}"
                    placeholder="Buscar endereço no mapa..."
                    autocomplete="off"
                    style="padding-right:36px;">
                  <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;display:inline-flex;color:var(--color-text-muted);">${window.rhIcon('map-pin', 16)}</span>
                  <div id="nominatimDropdown" class="nominatim-dropdown" style="display:none;top:calc(100% + 4px);left:0;"></div>
                </div>
                <input type="hidden" id="enderecoLat" name="lat" value="${contract?.lat || ''}">
                <input type="hidden" id="enderecoLng" name="lng" value="${contract?.lng || ''}">
                <div id="miniMapa" style="height:160px;border-radius:6px;margin-top:8px;overflow:hidden;border:1px solid var(--color-border);${contract?.lat ? '' : 'display:none;'}"></div>
              </div>
            </div>

            <div style="border-top:1px solid var(--color-border);padding-top:var(--sp-lg);margin-top:var(--sp-lg);">
              <h3 class="card-title mb-md">Dados do Contrato</h3>
              <div class="form-group">
                <label class="form-label">Valor Total (BRL) *</label>
                <input class="form-control" name="value" type="text" data-currency inputmode="numeric" value="${contract?.value ? window.BRLInput.toDisplay(contract.value) : ''}" placeholder="0,00" required>
              </div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-lg);align-items:start;">
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Data Início</label>
                  <input class="form-control" name="startDate" type="date" value="${contract?.startDate || ''}">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Data Fim</label>
                  <input class="form-control" name="endDate" type="date" value="${contract?.endDate || ''}">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Data de Tendência</label>
                  <input class="form-control" name="tendencyDate" type="date" value="${contract?.tendencyDate || ''}">
                </div>
              </div>
              <div class="form-helper" style="margin-top:6px;">💡 <strong>Tendência</strong> é a previsão atualizada do fim da obra.</div>
            </div>

            <div style="border-top:1px solid var(--color-border);padding-top:var(--sp-lg);margin-top:var(--sp-lg);">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);margin-bottom:var(--sp-md);">
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Retenção (%)</label>
                  <input class="form-control" name="retencaoPercent" type="number" min="0" max="100" step="0.01" value="${contract?.retencaoPercent || 0}" placeholder="0">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Notas/Observações</label>
                <textarea class="form-control" name="notes" style="min-height:80px;">${window.escapeHtml(contract?.notes || '')}</textarea>
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${contract ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => {
      if (window.Contratos._miniMap) {
        window.Contratos._miniMap.remove();
        window.Contratos._miniMap = null;
      }
      overlay.remove();
    };

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelar').addEventListener('click', closeModal);

    // Link to clientes navigates away and closes modal
    const linkClientes = document.getElementById('linkCadastrarCliente');
    if (linkClientes) {
      linkClientes.addEventListener('click', () => closeModal());
    }

    // Toggle manual input when "Digitar manualmente..." selected
    const selectCliente = document.getElementById('selectCliente');
    const inputManual = document.getElementById('inputClienteManual');
    if (selectCliente && inputManual) {
      // Se ao abrir o modal não há clientId mas há texto manual, mostrar o campo
      if (
        !contract?.clientId &&
        contract?.client &&
        !clientes.some((c) => c.id === contract?.clientId)
      ) {
        const matchPorNome = clientes.find(
          (c) =>
            contract.client === c.nome ||
            contract.client === c.nome + (c.empresa ? ` · ${c.empresa}` : '') ||
            contract.client === c.nome + (c.empresa ? ` (${c.empresa})` : '')
        );
        if (!matchPorNome && contract.client) {
          inputManual.style.display = 'block';
          selectCliente.value = '__outro__';
        }
      }
      selectCliente.addEventListener('change', () => {
        if (selectCliente.value === '__outro__') {
          inputManual.style.display = 'block';
          inputManual.required = true;
          selectCliente.required = false;
        } else {
          inputManual.style.display = 'none';
          inputManual.required = false;
          selectCliente.required = true;

          // Preencher dados do cliente selecionado (só se campos estiverem vazios)
          const clienteSel = clientes.find((c) => c.id === selectCliente.value);
          if (clienteSel) {
            const setIfEmpty = (name, val) => {
              const el = document.querySelector(`#formContrato [name="${name}"]`);
              if (el && !el.value && val) el.value = val;
            };
            setIfEmpty('clientDocument', clienteSel.documento || clienteSel.cnpj || clienteSel.cpf);
            setIfEmpty('clientEmail', clienteSel.email);
            if (clienteSel.telefone) {
              const telEl = document.querySelector('#formContrato [name="clientPhone"]');
              if (telEl && !telEl.value) telEl.value = window.formatPhoneBR(clienteSel.telefone);
            }
          }
          const endInput = document.getElementById('enderecoInput');
          const latInput = document.getElementById('enderecoLat');
          const lngInput = document.getElementById('enderecoLng');
          if (clienteSel?.endereco && endInput && !endInput.value) {
            endInput.value = clienteSel.endereco;
            if (clienteSel.lat) latInput.value = clienteSel.lat;
            if (clienteSel.lng) lngInput.value = clienteSel.lng;
            if (clienteSel.lat && clienteSel.lng) {
              // Reutiliza o mini-mapa já inicializado
              const mapaDiv = document.getElementById('miniMapa');
              if (mapaDiv) {
                mapaDiv.style.display = 'block';
                if (window.Contratos._miniMap) {
                  window.Contratos._miniMap.remove();
                  window.Contratos._miniMap = null;
                }
                setTimeout(async () => {
                  if (typeof L === 'undefined' && window.RhinoLazy)
                    await window.RhinoLazy.ensure('leaflet');
                  if (typeof L === 'undefined') return;
                  window.Contratos._miniMap = L.map(mapaDiv, {
                    zoomControl: true,
                    scrollWheelZoom: false,
                  }).setView([parseFloat(clienteSel.lat), parseFloat(clienteSel.lng)], 15);
                  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap',
                  }).addTo(window.Contratos._miniMap);
                  L.marker([parseFloat(clienteSel.lat), parseFloat(clienteSel.lng)])
                    .addTo(window.Contratos._miniMap)
                    .bindPopup(clienteSel.endereco)
                    .openPopup();
                }, 50);
              }
            }
          }
        }
      });
    }

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const form = document.getElementById('formContrato');
      const btnSalvar = document.getElementById('btnSalvar');
      const formData = new FormData(form);
      const data = Object.fromEntries(formData);

      // ── Field validation with highlighting ──
      const clearErrors = () => form.querySelectorAll('.field-error').forEach((el) => el.remove());
      const markError = (el, msg) => {
        el.style.borderColor = 'var(--color-danger)';
        const err = document.createElement('div');
        err.className = 'field-error';
        err.style.cssText = 'color:var(--color-danger);font-size:12px;margin-top:3px;';
        err.textContent = msg;
        el.parentNode.insertBefore(err, el.nextSibling);
      };
      clearErrors();
      form.querySelectorAll('[style*="border-color"]').forEach((el) => (el.style.borderColor = ''));

      // Resolve client: por ID do select ou manual
      let clienteManualCriado = false;
      if (selectCliente) {
        if (selectCliente.value === '__outro__') {
          data.client = data.clientManual?.trim() || '';
          data.clientId = null;
          clienteManualCriado = !!data.client;
        } else {
          const clienteSelecionado = clientes.find((c) => c.id === selectCliente.value);
          data.clientId = clienteSelecionado?.id || null;
          data.client = clienteSelecionado
            ? clienteSelecionado.nome +
              (clienteSelecionado.empresa ? ` · ${clienteSelecionado.empresa}` : '')
            : '';
        }
      } else {
        // Sem clientes cadastrados: campo manual
        data.client = data.clientManual?.trim() || '';
        data.clientId = null;
        clienteManualCriado = !!data.client;
      }
      delete data.clientManual;

      // Validate required fields
      let hasError = false;
      const nameEl = form.querySelector('[name="name"]');
      if (!data.name?.trim()) {
        markError(nameEl, 'Nome do contrato é obrigatório');
        hasError = true;
      }
      if (!data.client?.trim()) {
        const clientEl = selectCliente || document.getElementById('inputClienteManual');
        if (clientEl) markError(clientEl, 'Selecione ou informe o cliente');
        hasError = true;
      }
      if (hasError) return;

      data.value = window.BRLInput.parse(data.value);

      // ── Saving state ──
      const origText = btnSalvar.textContent;
      btnSalvar.disabled = true;
      btnSalvar.textContent = 'Salvando…';

      try {
        // Se digitou manualmente, cadastra o cliente automaticamente
        if (clienteManualCriado) {
          const jaExiste = (Store.state.clientes || []).some(
            (c) => (c.nome || '').toLowerCase() === data.client.toLowerCase()
          );
          if (!jaExiste) {
            await Store.createCliente({ nome: data.client });
            window.showToast(`Cliente "${data.client}" cadastrado automaticamente`, 'info');
          }
        }

        if (contract) {
          await Store.updateContract(contractId, data);
          window.showToast('Contrato atualizado com sucesso', 'success');
        } else {
          await Store.createContract(data);
          window.showToast('Contrato criado com sucesso', 'success');
        }
        closeModal();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
        btnSalvar.disabled = false;
        btnSalvar.textContent = origText;
      }
    });

    // ─── Busca de endereço (Nominatim / OpenStreetMap) ───
    this._initEnderecoSearch(contract);
  },

  _miniMap: null,
  _miniMarker: null,

  _initEnderecoSearch(contract) {
    const input = document.getElementById('enderecoInput');
    const dropdown = document.getElementById('nominatimDropdown');
    const latInput = document.getElementById('enderecoLat');
    const lngInput = document.getElementById('enderecoLng');
    const mapaDiv = document.getElementById('miniMapa');
    if (!input) return;

    let debounce = null;

    const mostrarMiniMapa = (lat, lng, label) => {
      mapaDiv.style.display = 'block';
      setTimeout(async () => {
        if (typeof L === 'undefined' && window.RhinoLazy) await window.RhinoLazy.ensure('leaflet');
        if (typeof L === 'undefined') return;
        if (this._miniMap) {
          this._miniMap.remove();
          this._miniMap = null;
        }
        this._miniMap = L.map(mapaDiv, { zoomControl: true, scrollWheelZoom: false }).setView(
          [lat, lng],
          15
        );
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
        }).addTo(this._miniMap);
        this._miniMarker = L.marker([lat, lng]).addTo(this._miniMap).bindPopup(label).openPopup();
      }, 50);
    };

    // Se já tem coordenadas salvas, mostrar mini mapa
    if (contract?.lat && contract?.lng) {
      mostrarMiniMapa(
        parseFloat(contract.lat),
        parseFloat(contract.lng),
        contract.endereco || 'Local'
      );
    }

    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      if (q.length < 4) {
        dropdown.style.display = 'none';
        return;
      }

      debounce = setTimeout(async () => {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`;
          const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });
          const results = await res.json();

          if (!results.length) {
            dropdown.style.display = 'none';
            return;
          }

          // FIX P0-2: escapa retorno do Nominatim (terceiro, não confiável).
          dropdown.innerHTML = results
            .map((r, i) => {
              const name = r.display_name.split(',').slice(0, 3).join(',');
              const detail = r.display_name.split(',').slice(3).join(',').trim();
              return `<div class="nominatim-item" data-i="${i}" data-lat="${window.escapeHtml(r.lat)}" data-lng="${window.escapeHtml(r.lon)}" data-name="${window.escapeHtml(r.display_name)}">
              <strong>${window.escapeHtml(name)}</strong>
              <span>${window.escapeHtml(detail)}</span>
            </div>`;
            })
            .join('');
          dropdown.style.display = 'block';

          dropdown.querySelectorAll('.nominatim-item').forEach((el) => {
            el.addEventListener('click', () => {
              const lat = parseFloat(el.dataset.lat);
              const lng = parseFloat(el.dataset.lng);
              const nome = el.dataset.name;
              input.value = nome;
              latInput.value = lat;
              lngInput.value = lng;
              dropdown.style.display = 'none';
              mostrarMiniMapa(lat, lng, nome);
            });
          });
        } catch {
          dropdown.style.display = 'none';
        }
      }, 450);
    });

    // Fechar dropdown ao clicar fora — usa capture:false + remoção automática via overlay
    const _closeDropdown = (e) => {
      if (!document.getElementById('enderecoWrap')?.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    };
    document.addEventListener('click', _closeDropdown);
    // Limpa listener quando o modal fechar (overlay é removido do DOM)
    const _moObs = new MutationObserver(() => {
      if (!document.getElementById('enderecoWrap')) {
        document.removeEventListener('click', _closeDropdown);
        _moObs.disconnect();
      }
    });
    _moObs.observe(document.body, { childList: true });
  },

  exportCSV() {
    const contracts = this._currentFiltered.length ? this._currentFiltered : Store.state.contracts;
    if (!contracts.length) {
      window.showToast('Nenhum contrato para exportar', 'warning');
      return;
    }
    const rows = [
      ['Nome', 'Cliente', 'Nº Contrato', 'Status', 'Valor (R$)', 'Início', 'Fim', 'Tendência'],
      ...contracts.map((c) => [
        c.name || '',
        c.client || '',
        c.contractNumber || '',
        c.status || '',
        (c.value || 0).toString().replace('.', ','),
        c.startDate || '',
        c.endDate || '',
        c.tendencyDate || '',
      ]),
    ];
    const csv =
      '﻿' +
      rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contratos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    window.showToast(`${contracts.length} contratos exportados`, 'success');
  },

  duplicateContract(id) {
    const c = Store.getContractById(id);
    if (!c) return;
    // Open modal pre-filled with a copy (pass template to showModal)
    this._duplicateTemplate = {
      ...c,
      name: `[Cópia] ${c.name}`,
      status: 'prospeccao',
      contractNumber: '',
      startDate: '',
      endDate: '',
      tendencyDate: '',
    };
    this.showModal(null);
  },

  deleteContract(id) {
    const c = Store.getContractById(id);
    const nome = c?.name ? `"${c.name}"` : 'o contrato';

    // Fade out the row immediately (optimistic)
    const rowEl = document.querySelector(`.row-contrato[data-id="${id}"]`);
    if (rowEl) {
      rowEl.style.transition = 'opacity .3s ease, transform .3s ease';
      rowEl.style.opacity = '0';
      rowEl.style.transform = 'translateX(20px)';
      rowEl.style.pointerEvents = 'none';
    }

    // Show undo toast
    let undone = false;
    let remaining = 5;

    let toastContainer = document.querySelector('.toast-stack');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-stack';
      document.body.appendChild(toastContainer);
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'toast toast--warning';
    toastEl.style.cssText =
      'display:flex;align-items:center;gap:12px;min-width:280px;cursor:default;';

    const labelEl = document.createElement('span');
    labelEl.style.flex = '1';
    labelEl.textContent = `${nome} excluído em ${remaining}s`;

    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn btn-secondary';
    undoBtn.style.cssText = 'padding:4px 12px;font-size:13px;flex-shrink:0;';
    undoBtn.textContent = '↩ Desfazer';

    toastEl.appendChild(labelEl);
    toastEl.appendChild(undoBtn);
    toastContainer.appendChild(toastEl);

    const ticker = setInterval(() => {
      remaining--;
      if (!undone && remaining > 0) labelEl.textContent = `${nome} excluído em ${remaining}s`;
    }, 1000);

    undoBtn.addEventListener('click', () => {
      undone = true;
      clearInterval(ticker);
      toastEl.classList.add('is-leaving');
      setTimeout(() => toastEl.remove(), 220);
      // Restore row
      if (rowEl) {
        rowEl.style.opacity = '1';
        rowEl.style.transform = '';
        rowEl.style.pointerEvents = '';
        rowEl.querySelector('.swipe-del-btn')?.remove();
        rowEl.style.position = '';
      }
      window.showToast('Exclusão cancelada', 'info');
    });

    setTimeout(async () => {
      clearInterval(ticker);
      toastEl.classList.add('is-leaving');
      setTimeout(() => toastEl.remove(), 220);
      if (undone) return;
      try {
        await Store.deleteContract(id);
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
        // Restore row on error
        if (rowEl) {
          rowEl.style.opacity = '1';
          rowEl.style.transform = '';
          rowEl.style.pointerEvents = '';
        }
      }
    }, 5000);
  },
};
