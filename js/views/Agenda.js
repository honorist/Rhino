'use strict';
// Agenda — lista cronológica de eventos futuros de múltiplas origens do sistema.
window.Agenda = {
  _store: (window.UIKit?.persistFilter?.('agenda', { days: 30, tipos: '' })) || null,
  get _days()  { return parseInt(this._store?.get('days') ?? 30)  || 30; },
  set _days(v) { this._store?.set('days', v); },
  get _tipos() { return this._store?.get('tipos') ?? ''; },
  set _tipos(v){ this._store?.set('tipos', v); },

  _eventosCache: [],

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando agenda…</div>';
    try {
      const res = await fetch(`/api/agenda/eventos?days=${this._days}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { eventos } = await res.json();
      this._eventosCache = eventos || [];
      this._draw();
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="card"><p class="text-danger">Erro ao carregar agenda: ${escapeHtml(e.message)}</p></div>`;
    }
  },

  _draw() {
    const app = document.getElementById('app');
    const tiposFiltro = this._tipos ? this._tipos.split(',').filter(Boolean) : [];
    let lista = this._eventosCache;
    if (tiposFiltro.length) lista = lista.filter(e => tiposFiltro.includes(e.tipo));

    const tipoCfg = {
      nf:          { icon: '🔴', label: 'NF a emitir',      color: '#B91C1C', bg: '#FEE2E2' },
      cp:          { icon: '🟠', label: 'Conta a pagar',     color: '#9A3412', bg: '#FFEDD5' },
      marco:       { icon: '📋', label: 'Marco de obra',     color: '#1E40AF', bg: '#DBEAFE' },
      doc:         { icon: '🟡', label: 'Doc. colaborador',  color: '#92400E', bg: '#FEF3C7' },
      compra:      { icon: '📦', label: 'SC — data obra',    color: '#3730A3', bg: '#E0E7FF' },
      contratacao: { icon: '👤', label: 'Contratação',       color: '#065F46', bg: '#D1FAE5' },
    };

    // KPIs
    const total = lista.length;
    const hoje  = new Date().toISOString().slice(0, 10);
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const proximos7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const nHoje    = lista.filter(e => e.data === hoje).length;
    const nAmanha  = lista.filter(e => e.data === amanha).length;
    const n7dias   = lista.filter(e => e.data > hoje && e.data <= proximos7).length;

    const kpisHtml = window.UIKit?.kpiGrid ? window.UIKit.kpiGrid([
      { label: 'Total no período', value: total,   color: 'var(--color-primary)' },
      { label: 'Hoje',             value: nHoje,   color: 'var(--color-danger)' },
      { label: 'Amanhã',           value: nAmanha, color: 'var(--color-warning)' },
      { label: 'Próx. 7 dias',     value: n7dias,  color: 'var(--color-info)' },
    ]) : '';

    // Botões de período
    const periodoHtml = `
      <div style="display:flex;gap:6px;margin-bottom:var(--sp-md);">
        ${[30, 60, 90].map(d => `
          <button class="btn btn-sm ${this._days === d ? 'btn-primary' : 'btn-secondary'} btn-periodo" data-days="${d}">${d} dias</button>
        `).join('')}
      </div>`;

    // Chips de tipo
    const allTipos = [...new Set(this._eventosCache.map(e => e.tipo))];
    const chipsHtml = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:var(--sp-md);">
        <button class="btn btn-sm ${!tiposFiltro.length ? 'btn-primary' : 'btn-ghost'}" id="chipTodos">Todos</button>
        ${allTipos.map(t => {
          const cfg = tipoCfg[t] || { icon: '•', label: t, color: '#374151', bg: '#F3F4F6' };
          const ativo = tiposFiltro.includes(t);
          return `<button class="btn btn-sm chip-tipo" data-tipo="${t}"
            style="${ativo ? `background:${cfg.bg};color:${cfg.color};border-color:${cfg.color};font-weight:700;` : ''}">
            ${cfg.icon} ${cfg.label}
          </button>`;
        }).join('')}
      </div>`;

    // Agrupar por data
    const grupos = [];
    let dAtual = null;
    for (const e of lista) {
      if (e.data !== dAtual) {
        dAtual = e.data;
        grupos.push({ data: e.data, label: this._labelDia(e.data), eventos: [] });
      }
      grupos[grupos.length - 1].eventos.push(e);
    }

    const fmtBRL = v => v != null ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';

    const listaHtml = grupos.length === 0 ? `
      <div class="card" style="text-align:center;padding:var(--sp-2xl) var(--sp-lg);color:var(--color-text-muted);">
        <div style="font-size:40px;margin-bottom:var(--sp-md);opacity:.4;">📅</div>
        <div style="font-size:17px;font-weight:600;color:var(--color-text);">Nenhum evento nos próximos ${this._days} dias</div>
        <div style="font-size:14px;">Aumente o período ou adicione datas nas solicitações de compra, marcos, NFs e contas.</div>
      </div>
    ` : grupos.map(g => `
      <div style="margin-bottom:var(--sp-xl);">
        <div style="font-size:13px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:var(--sp-sm);">
          ${escapeHtml(g.label)}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${g.eventos.map(e => {
            const cfg = tipoCfg[e.tipo] || { icon: '•', label: e.tipo, color: '#374151', bg: '#F3F4F6' };
            return `
              <a href="${e.href || '#'}" class="agenda-item" style="
                display:flex;align-items:center;gap:var(--sp-md);padding:10px 14px;
                background:var(--color-surface);border:1px solid var(--color-border);
                border-radius:8px;text-decoration:none;color:inherit;
                border-left:4px solid ${cfg.color};
                transition:box-shadow .15s;
              ">
                <span style="font-size:20px;flex-shrink:0;">${cfg.icon}</span>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(e.titulo || '—')}</div>
                  ${e.subtitulo ? `<div style="font-size:12px;color:var(--color-text-muted);margin-top:2px;">${escapeHtml(e.subtitulo)}</div>` : ''}
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <span style="background:${cfg.bg};color:${cfg.color};font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">
                    ${cfg.label}
                  </span>
                  ${e.valor != null ? `<div style="font-size:12px;font-weight:700;margin-top:3px;">${fmtBRL(e.valor)}</div>` : ''}
                </div>
              </a>`;
          }).join('')}
        </div>
      </div>
    `).join('');

    const headerHtml = window.UIKit?.pageHeader ? window.UIKit.pageHeader({
      title: '📅 Agenda',
      subtitle: `Próximos ${this._days} dias — ${lista.length} evento${lista.length !== 1 ? 's' : ''}`,
    }) : '<h2>Agenda</h2>';

    app.innerHTML = `
      ${headerHtml}
      ${kpisHtml}
      <div class="card" style="padding:var(--sp-md);">
        ${periodoHtml}
        ${chipsHtml}
      </div>
      ${listaHtml}
    `;

    // Período buttons
    document.querySelectorAll('.btn-periodo').forEach(btn => {
      btn.addEventListener('click', () => {
        this._days = parseInt(btn.dataset.days);
        this.render();
      });
    });

    // Chips
    document.getElementById('chipTodos')?.addEventListener('click', () => { this._tipos = ''; this._draw(); });
    document.querySelectorAll('.chip-tipo').forEach(btn => {
      btn.addEventListener('click', () => {
        const tipo = btn.dataset.tipo;
        const ativos = new Set(this._tipos ? this._tipos.split(',').filter(Boolean) : []);
        if (ativos.has(tipo)) ativos.delete(tipo); else ativos.add(tipo);
        this._tipos = [...ativos].join(',');
        this._draw();
      });
    });
  },

  _labelDia(iso) {
    if (!iso) return '—';
    const hoje  = new Date().toISOString().slice(0, 10);
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    if (iso === hoje)   return 'Hoje';
    if (iso === amanha) return 'Amanhã';
    const d = new Date(iso + 'T12:00:00');
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    return `${dias[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')} ${meses[d.getMonth()]}`;
  },
};
