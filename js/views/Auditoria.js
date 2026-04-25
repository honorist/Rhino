// Auditoria — quem fez o quê, quando.
window.Auditoria = {
  _filters: { user: '', entity: '', action: '', from: '', to: '' },
  _page: 0,
  _pageSize: 50,
  _data: { rows: [], total: 0 },

  async render() {
    const root = document.getElementById('app');
    root.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    await this._fetch();
    this._draw();
  },

  async _fetch() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(this._filters)) {
      if (v) params.set(k, v);
    }
    params.set('limit', this._pageSize);
    params.set('offset', this._page * this._pageSize);
    try {
      const r = await fetch('/api/audit?' + params.toString());
      this._data = await r.json();
    } catch (e) {
      this._data = { rows: [], total: 0 };
    }
  },

  _draw() {
    const root = document.getElementById('app');
    const { rows, total } = this._data;
    const totalPages = Math.max(1, Math.ceil(total / this._pageSize));
    const fmtDT = (s) => s ? new Date(s).toLocaleString('pt-BR') : '—';

    const actionBadge = (a) => {
      const colors = {
        create: { bg: 'rgba(16,185,129,.15)', fg: '#10b981' },
        update: { bg: 'rgba(59,130,246,.15)', fg: '#3b82f6' },
        delete: { bg: 'rgba(220,38,38,.15)', fg: '#dc2626' },
        pagar:  { bg: 'rgba(34,197,94,.15)', fg: '#22c55e' },
        estornar: { bg: 'rgba(245,158,11,.15)', fg: '#f59e0b' },
        emitir: { bg: 'rgba(99,102,241,.15)', fg: '#6366f1' },
        'cancelar-emissao': { bg: 'rgba(245,158,11,.15)', fg: '#f59e0b' },
        passagem: { bg: 'rgba(168,85,247,.15)', fg: '#a855f7' },
      };
      const c = colors[a] || { bg: 'var(--color-bg)', fg: 'var(--color-text)' };
      return `<span style="background:${c.bg};color:${c.fg};padding:2px 8px;border-radius:99px;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">${a || '—'}</span>`;
    };

    const statusBadge = (s) => {
      const cor = s >= 400 ? '#dc2626' : s >= 300 ? '#f59e0b' : '#10b981';
      return `<span style="color:${cor};font-weight:700;font-family:monospace;">${s}</span>`;
    };

    root.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Auditoria</h1>
        <p class="page-subtitle">${total} evento${total === 1 ? '' : 's'} registrado${total === 1 ? '' : 's'}</p>
      </div>

      <!-- Filtros -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr auto;gap:var(--sp-md);margin-bottom:var(--sp-md);align-items:end;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Usuário (email)</label>
          <input class="form-control" id="fAuditUser" placeholder="ex: admin@" value="${escapeHtml(this._filters.user)}">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Entidade</label>
          <select class="form-control" id="fAuditEntity">
            <option value="">— todas —</option>
            ${['users','clientes','fornecedores','recursos','contracts','contracts.saidas','contracts.budget','contracts.organograma','contracts.rdos','caixa','contas-pagar','notas-fiscais','investimentos','base','tipos-base','niveis-acesso','doc-templates','recursos.folgas','recursos.documentos','recursos.passagem']
              .map(e => `<option value="${e}" ${this._filters.entity === e ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Ação</label>
          <select class="form-control" id="fAuditAction">
            <option value="">— todas —</option>
            ${['create','update','delete','pagar','estornar','emitir','cancelar-emissao','passagem']
              .map(a => `<option value="${a}" ${this._filters.action === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">De</label>
          <input class="form-control" type="date" id="fAuditFrom" value="${escapeHtml(this._filters.from)}">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Até</label>
          <input class="form-control" type="date" id="fAuditTo" value="${escapeHtml(this._filters.to)}">
        </div>
        <button class="btn btn-secondary" id="fAuditClear">Limpar</button>
      </div>

      <!-- Tabela -->
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:160px;">Data/Hora</th>
            <th>Usuário</th>
            <th style="width:90px;">Ação</th>
            <th>Entidade</th>
            <th>ID alvo</th>
            <th>Path</th>
            <th style="width:60px;text-align:center;">Status</th>
            <th style="width:60px;text-align:right;">Δms</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="8" style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhum evento no filtro selecionado</td></tr>` : ''}
          ${rows.map(r => `
            <tr class="row-audit" data-id="${r.id}" style="cursor:pointer;">
              <td style="font-family:monospace;font-size:12px;">${fmtDT(r.ts)}</td>
              <td>${escapeHtml(r.userEmail || r.userId || '—')}</td>
              <td>${actionBadge(r.action)}</td>
              <td><strong>${escapeHtml(r.entity || '—')}</strong></td>
              <td style="font-family:monospace;font-size:12px;color:var(--color-text-muted);">${r.entityId ? escapeHtml(r.entityId).slice(0, 22) + (r.entityId.length > 22 ? '…' : '') : '—'}</td>
              <td style="font-family:monospace;font-size:12px;color:var(--color-text-muted);">${escapeHtml(r.method)} ${escapeHtml(r.path)}</td>
              <td style="text-align:center;">${statusBadge(r.status)}</td>
              <td style="text-align:right;font-family:monospace;font-size:12px;color:var(--color-text-muted);">${r.durationMs}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${totalPages > 1 ? `
        <div style="display:flex;justify-content:center;gap:var(--sp-sm);margin-top:var(--sp-md);">
          <button class="btn btn-secondary" id="auditPrev" ${this._page === 0 ? 'disabled' : ''}>← Anterior</button>
          <span style="display:flex;align-items:center;color:var(--color-text-muted);">Página ${this._page + 1} de ${totalPages}</span>
          <button class="btn btn-secondary" id="auditNext" ${this._page >= totalPages - 1 ? 'disabled' : ''}>Próxima →</button>
        </div>
      ` : ''}
    `;

    // Filtros
    const apply = () => {
      this._filters.user = document.getElementById('fAuditUser').value.trim();
      this._filters.entity = document.getElementById('fAuditEntity').value;
      this._filters.action = document.getElementById('fAuditAction').value;
      this._filters.from = document.getElementById('fAuditFrom').value;
      this._filters.to = document.getElementById('fAuditTo').value;
      this._page = 0;
      this.render();
    };
    document.getElementById('fAuditUser').addEventListener('change', apply);
    document.getElementById('fAuditEntity').addEventListener('change', apply);
    document.getElementById('fAuditAction').addEventListener('change', apply);
    document.getElementById('fAuditFrom').addEventListener('change', apply);
    document.getElementById('fAuditTo').addEventListener('change', apply);
    document.getElementById('fAuditClear').addEventListener('click', () => {
      this._filters = { user: '', entity: '', action: '', from: '', to: '' };
      this._page = 0;
      this.render();
    });

    // Click linha → mostra detalhe
    document.querySelectorAll('.row-audit').forEach(tr => {
      tr.addEventListener('click', () => {
        const ev = rows.find(x => String(x.id) === tr.dataset.id);
        if (ev) this._showDetail(ev);
      });
    });

    // Paginação
    const prev = document.getElementById('auditPrev');
    const next = document.getElementById('auditNext');
    if (prev) prev.addEventListener('click', () => { this._page--; this.render(); });
    if (next) next.addEventListener('click', () => { this._page++; this.render(); });
  },

  _showDetail(ev) {
    const fmtDT = (s) => s ? new Date(s).toLocaleString('pt-BR') : '—';
    const bodyJson = ev.body ? JSON.stringify(ev.body, null, 2) : '(vazio)';
    const html = `
      <div class="modal-overlay" id="modalAudit">
        <div class="modal" style="width:680px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Evento #${ev.id}</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">${fmtDT(ev.ts)}</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;font-size:13px;line-height:1.7;margin-bottom:var(--sp-md);">
              <div style="color:var(--color-text-muted);">Usuário</div><div><strong>${escapeHtml(ev.userEmail || ev.userId || '—')}</strong></div>
              <div style="color:var(--color-text-muted);">IP</div><div style="font-family:monospace;">${escapeHtml(ev.ip || '—')}</div>
              <div style="color:var(--color-text-muted);">Método</div><div style="font-family:monospace;">${escapeHtml(ev.method)}</div>
              <div style="color:var(--color-text-muted);">Path</div><div style="font-family:monospace;">${escapeHtml(ev.path)}</div>
              <div style="color:var(--color-text-muted);">Entidade</div><div><strong>${escapeHtml(ev.entity || '—')}</strong></div>
              <div style="color:var(--color-text-muted);">ID alvo</div><div style="font-family:monospace;">${escapeHtml(ev.entityId || '—')}</div>
              <div style="color:var(--color-text-muted);">Ação</div><div><strong>${escapeHtml(ev.action || '—')}</strong></div>
              <div style="color:var(--color-text-muted);">Status</div><div style="font-family:monospace;font-weight:700;color:${ev.status >= 400 ? '#dc2626' : '#10b981'};">${ev.status}</div>
              <div style="color:var(--color-text-muted);">Duração</div><div style="font-family:monospace;">${ev.durationMs} ms</div>
              <div style="color:var(--color-text-muted);">Request ID</div><div style="font-family:monospace;font-size:11px;">${escapeHtml(ev.requestId || '—')}</div>
            </div>
            <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:6px;">Payload (body da requisição)</div>
            <pre style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;padding:var(--sp-md);font-size:12px;font-family:monospace;overflow:auto;max-height:300px;white-space:pre-wrap;">${escapeHtml(bodyJson)}</pre>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnAuditClose">Fechar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalAudit');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnAuditClose').addEventListener('click', close);
  },
};
