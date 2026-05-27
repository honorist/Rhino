window.CronogramaGeral = {
  _zoom: 'all',
  _filter: '',
  _anchor: null,    // data de referência da janela (null = usar hoje / fit)
  _allShift: 0,     // deslocamento em ms aplicado ao modo 'all'

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      await Store.loadAll();
      this._draw();
    } catch (e) {
      app.innerHTML = `<div class="empty-state">Erro ao carregar: ${e.message}</div>`;
    }
  },

  _draw() {
    const app = document.getElementById('app');
    const contracts = Store.state.contracts || [];

    const statusLabels = {
      ativo:        'Ativo',
      prospeccao:   'Prospecção',
      nao_iniciado: 'Não iniciado',
      nao_aprovado: 'Não aprovado',
      pausado:      'Pausado',
      concluido:    'Concluído',
      cancelado:    'Cancelado',
    };

    const statusColors = {
      ativo:        '#10b981',
      prospeccao:   '#8b5cf6',
      nao_iniciado: '#6b7280',
      nao_aprovado: '#f97316',
      pausado:      '#f59e0b',
      concluido:    '#3b82f6',
      cancelado:    '#dc2626',
    };

    const filtered = this._filter
      ? contracts.filter(c => c.status === this._filter)
      : contracts;

    const statusOrder = ['ativo', 'prospeccao', 'nao_iniciado', 'nao_aprovado', 'pausado', 'concluido', 'cancelado'];
    const sorted = [...filtered].sort((a, b) => {
      const ai = statusOrder.indexOf(a.status);
      const bi = statusOrder.indexOf(b.status);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

    const { rangeStart, rangeEnd } = this._getRange(filtered);
    const totalMs = rangeEnd - rangeStart;

    const today = new Date();
    const todayPct = totalMs > 0
      ? Math.max(0, Math.min(100, (today - rangeStart) / totalMs * 100))
      : -1;

    const rows = sorted.map(c => {
      const start = c.startDate ? new Date(c.startDate) : null;
      const end   = c.endDate   ? new Date(c.endDate)   : null;
      let left = 0, width = 0, hasDates = false;
      if (start && end && totalMs > 0) {
        left  = Math.max(0, (start - rangeStart) / totalMs * 100);
        const rightEdge = Math.min(100, (end - rangeStart) / totalMs * 100);
        width = Math.max(0.5, rightEdge - left);
        hasDates = true;
      }
      return { c, left, width, hasDates };
    });

    const ticks = this._buildTicks(rangeStart, rangeEnd, totalMs);
    const zoomLabels = { month: 'Mês', quarter: 'Trimestre', year: 'Ano', all: 'Todos' };

    const zoomBtns = Object.entries(zoomLabels).map(([z, l]) =>
      `<button class="btn btn-sm ${this._zoom === z ? 'btn-primary' : 'btn-outline'}" data-zoom="${z}">${l}</button>`
    ).join('');

    const periodLabel = this._periodLabel(rangeStart, rangeEnd);

    const statusOptions = Object.entries(statusLabels).map(([v, l]) =>
      `<option value="${v}" ${this._filter === v ? 'selected' : ''}>${l}</option>`
    ).join('');

    const legend = Object.entries(statusLabels).map(([v, l]) =>
      `<span style="display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap;">
        <span style="width:10px;height:10px;border-radius:2px;background:${statusColors[v]};display:inline-block;flex-shrink:0;"></span>
        ${l}
      </span>`
    ).join('');

    const rowsHtml = rows.length === 0
      ? `<div style="padding:48px;text-align:center;color:var(--color-text-muted);">Nenhum contrato encontrado</div>`
      : rows.map(({ c, left, width, hasDates }) => {
          const color = statusColors[c.status] || '#6b7280';
          const label = statusLabels[c.status] || c.status || '—';
          const todayLine = todayPct >= 0 && todayPct <= 100
            ? `<div style="position:absolute;left:${todayPct}%;top:0;bottom:0;width:2px;background:#ef4444;opacity:0.4;z-index:1;pointer-events:none;"></div>`
            : '';
          const bar = hasDates
            ? `<div style="position:absolute;left:${left}%;width:${width}%;top:50%;transform:translateY(-50%);height:22px;border-radius:4px;background:${color};opacity:0.88;display:flex;align-items:center;padding:0 7px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.2);" title="${escapeHtml(c.name||'')}: ${c.startDate||'?'} → ${c.endDate||'?'}">
                <span style="font-size:11px;color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${width > 6 ? escapeHtml(c.name || '') : ''}</span>
              </div>`
            : `<div style="position:absolute;left:12px;right:12px;top:50%;transform:translateY(-50%);height:4px;border-radius:2px;border:2px dashed var(--color-border);opacity:0.4;" title="Sem datas definidas"></div>`;

          return `
            <div class="gantt-row" data-id="${c.id}" style="display:flex;align-items:stretch;border-bottom:1px solid var(--color-border);cursor:pointer;">
              <div style="flex:0 0 280px;padding:8px 16px;border-right:1px solid var(--color-border);display:flex;flex-direction:column;justify-content:center;overflow:hidden;">
                <div style="font-size:13px;font-weight:600;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(c.name||'')}">
                  ${escapeHtml(c.name || '—')}
                </div>
                <div style="display:flex;align-items:center;gap:5px;margin-top:3px;">
                  <span style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
                  <span style="font-size:11px;color:var(--color-text-muted);">${label}</span>
                  ${c.client ? `<span style="font-size:11px;color:var(--color-text-muted);">· ${escapeHtml(c.client)}</span>` : ''}
                </div>
              </div>
              <div style="flex:1;position:relative;height:48px;">
                ${todayLine}
                ${bar}
              </div>
            </div>`;
        }).join('');

    app.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Cronograma Geral</h1>
          <p class="page-subtitle">${filtered.length} contrato${filtered.length !== 1 ? 's' : ''} · visão Gantt por período</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:var(--sp-lg);padding:var(--sp-md);">
        <div style="display:flex;gap:var(--sp-md);align-items:center;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:12px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.5px;">Zoom</span>
            <div style="display:flex;gap:4px;" id="cg-zoom-btns">${zoomBtns}</div>
          </div>

          <div style="display:flex;align-items:center;gap:6px;">
            <button class="btn btn-sm btn-outline" id="cg-prev" title="Período anterior" style="padding:4px 10px;font-size:14px;">◀</button>
            <button class="btn btn-sm btn-outline" id="cg-today" title="Voltar para hoje" style="padding:4px 10px;font-size:12px;">Hoje</button>
            <button class="btn btn-sm btn-outline" id="cg-next" title="Próximo período" style="padding:4px 10px;font-size:14px;">▶</button>
            <span id="cg-period-label" style="font-size:13px;font-weight:700;color:var(--color-text);padding:4px 10px;background:var(--color-surface-2);border-radius:4px;min-width:120px;text-align:center;">${periodLabel}</span>
          </div>

          <select class="form-control" id="cg-filter-status" style="height:32px;padding:2px 10px;font-size:13px;max-width:200px;">
            <option value="">Todos os status</option>
            ${statusOptions}
          </select>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-left:auto;">${legend}</div>
        </div>
      </div>

      <div class="card" style="padding:0;overflow:hidden;">
        <div style="overflow-x:auto;">
          <div style="min-width:860px;">

            <!-- Eixo de tempo (cabeçalho) -->
            <div style="display:flex;border-bottom:2px solid var(--color-border);background:var(--color-surface);">
              <div style="flex:0 0 280px;padding:8px 16px;font-size:12px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;border-right:1px solid var(--color-border);letter-spacing:.5px;">Contrato</div>
              <div style="flex:1;position:relative;height:32px;overflow:hidden;">
                ${ticks.map(t => `
                  <div style="position:absolute;left:${t.pct}%;top:0;bottom:0;border-left:1px dashed var(--color-border);opacity:0.5;"></div>
                  <span style="position:absolute;left:${t.pct}%;top:6px;font-size:11px;font-weight:600;color:var(--color-text-muted);white-space:nowrap;padding-left:4px;">${t.label}</span>
                `).join('')}
                ${todayPct >= 0 && todayPct <= 100 ? `
                  <div style="position:absolute;left:${todayPct}%;top:0;bottom:0;width:2px;background:#ef4444;opacity:0.6;"></div>
                  <span style="position:absolute;left:${todayPct}%;top:0;font-size:10px;font-weight:700;color:#ef4444;white-space:nowrap;padding-left:3px;">hoje</span>
                ` : ''}
              </div>
            </div>

            <!-- Linhas do Gantt -->
            <div id="cg-rows">${rowsHtml}</div>
          </div>
        </div>
      </div>`;

    document.getElementById('cg-zoom-btns').addEventListener('click', e => {
      const btn = e.target.closest('[data-zoom]');
      if (!btn) return;
      this._zoom = btn.dataset.zoom;
      this._anchor = null;
      this._allShift = 0;
      this._draw();
    });

    document.getElementById('cg-prev').addEventListener('click', () => { this._shift(-1); this._draw(); });
    document.getElementById('cg-next').addEventListener('click', () => { this._shift( 1); this._draw(); });
    document.getElementById('cg-today').addEventListener('click', () => {
      this._anchor = null;
      this._allShift = 0;
      this._draw();
    });

    document.getElementById('cg-filter-status').addEventListener('change', e => {
      this._filter = e.target.value;
      this._draw();
    });

    document.getElementById('cg-rows').addEventListener('click', e => {
      const row = e.target.closest('.gantt-row');
      if (!row) return;
      location.hash = '#/contratos/' + row.dataset.id;
    });
  },

  _getRange(contracts) {
    const ref = this._anchor ? new Date(this._anchor) : new Date();

    if (this._zoom === 'month') {
      return {
        rangeStart: new Date(ref.getFullYear(), ref.getMonth(), 1),
        rangeEnd:   new Date(ref.getFullYear(), ref.getMonth() + 1, 0),
      };
    }
    if (this._zoom === 'quarter') {
      const q = Math.floor(ref.getMonth() / 3);
      return {
        rangeStart: new Date(ref.getFullYear(), q * 3, 1),
        rangeEnd:   new Date(ref.getFullYear(), q * 3 + 3, 0),
      };
    }
    if (this._zoom === 'year') {
      return {
        rangeStart: new Date(ref.getFullYear(), 0, 1),
        rangeEnd:   new Date(ref.getFullYear(), 11, 31),
      };
    }

    // 'all' — fit to contract dates (com pan via _allShift)
    const dates = contracts.flatMap(c => [
      c.startDate ? new Date(c.startDate) : null,
      c.endDate   ? new Date(c.endDate)   : null,
    ]).filter(Boolean);

    let rangeStart, rangeEnd;
    if (dates.length === 0) {
      const today = new Date();
      rangeStart = new Date(today.getFullYear() - 1, 0, 1);
      rangeEnd   = new Date(today.getFullYear() + 1, 11, 31);
    } else {
      const minD = new Date(Math.min(...dates));
      const maxD = new Date(Math.max(...dates));
      const pad  = Math.max((maxD - minD) * 0.04, 30 * 24 * 3600 * 1000);
      rangeStart = new Date(minD.getTime() - pad);
      rangeEnd   = new Date(maxD.getTime() + pad);
    }

    if (this._allShift) {
      rangeStart = new Date(rangeStart.getTime() + this._allShift);
      rangeEnd   = new Date(rangeEnd.getTime()   + this._allShift);
    }
    return { rangeStart, rangeEnd };
  },

  _shift(dir) {
    if (this._zoom === 'all') {
      // pan 'all' por ~25% da janela atual
      const contracts = (Store.state.contracts || []).filter(c =>
        !this._filter || c.status === this._filter
      );
      const { rangeStart, rangeEnd } = this._getRange(contracts);
      const span = rangeEnd - rangeStart;
      this._allShift = (this._allShift || 0) + dir * span * 0.25;
      return;
    }
    const ref = this._anchor ? new Date(this._anchor) : new Date();
    if (this._zoom === 'month')   ref.setMonth(ref.getMonth() + dir);
    if (this._zoom === 'quarter') ref.setMonth(ref.getMonth() + dir * 3);
    if (this._zoom === 'year')    ref.setFullYear(ref.getFullYear() + dir);
    this._anchor = ref;
  },

  _periodLabel(rangeStart, rangeEnd) {
    const mNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    if (this._zoom === 'month') {
      return `${mNames[rangeStart.getMonth()]} ${rangeStart.getFullYear()}`;
    }
    if (this._zoom === 'quarter') {
      const q = Math.floor(rangeStart.getMonth() / 3) + 1;
      return `T${q} ${rangeStart.getFullYear()}`;
    }
    if (this._zoom === 'year') {
      return String(rangeStart.getFullYear());
    }
    // 'all'
    const sY = rangeStart.getFullYear();
    const eY = rangeEnd.getFullYear();
    return sY === eY ? `${sY}` : `${sY} – ${eY}`;
  },

  _buildTicks(rangeStart, rangeEnd, totalMs) {
    const ticks = [];
    if (totalMs <= 0) return ticks;

    const days = totalMs / (24 * 3600 * 1000);
    const mNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    if (days <= 45) {
      // Daily
      let d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + 1);
      const step = days < 20 ? 1 : 2;
      while (d < rangeEnd) {
        ticks.push({ pct: (d - rangeStart) / totalMs * 100, label: d.getDate() + '/' + (d.getMonth() + 1) });
        d.setDate(d.getDate() + step);
      }
    } else if (days <= 200) {
      // Weekly
      let d = new Date(rangeStart);
      d.setDate(d.getDate() + (7 - d.getDay()) % 7 + 1);
      while (d < rangeEnd) {
        ticks.push({ pct: (d - rangeStart) / totalMs * 100, label: d.getDate() + '/' + (d.getMonth() + 1) });
        d.setDate(d.getDate() + 7);
      }
    } else {
      // Monthly
      let d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1);
      while (d < rangeEnd) {
        const label = days > 600
          ? mNames[d.getMonth()] + ' \'' + String(d.getFullYear()).slice(2)
          : mNames[d.getMonth()];
        ticks.push({ pct: (d - rangeStart) / totalMs * 100, label });
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    }

    return ticks;
  },
};
