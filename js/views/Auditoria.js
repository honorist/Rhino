// Auditoria — quem fez o quê, quando.
window.Auditoria = {
  _filters: { user: '', entity: '', action: '', from: '', to: '' },
  _page: 0,
  _pageSize: 50,
  _data: { rows: [], total: 0 },

  // Tradução de "entidade" técnica → nome amigável
  _entityLabel(e) {
    const map = {
      'clientes':              'Cliente',
      'fornecedores':          'Fornecedor',
      'recursos':              'Colaborador',
      'recursos.folgas':       'Folga do colaborador',
      'recursos.documentos':   'Documento do colaborador',
      'recursos.passagem':     'Passagem (folga)',
      'contracts':             'Contrato',
      'contracts.saidas':      'Medição (saída/BM)',
      'contracts.budget':      'Item de orçamento',
      'contracts.organograma': 'Membro da equipe',
      'contracts.rdos':        'RDO',
      'caixa':                 'Lançamento de caixa',
      'contas-pagar':          'Conta a pagar',
      'notas-fiscais':         'Nota fiscal (BM)',
      'investimentos':         'Aporte',
      'base':                  'Item da BASE',
      'tipos-base':            'Tipo de custo',
      'niveis-acesso':         'Nível de acesso',
      'doc-templates':         'Template de documento',
      'socios':                'Sócio',
      'users':                 'Usuário (login)',
      'saidas':                'Medição (saída)',
    };
    return map[e] || e || '—';
  },

  // Tradução de ação técnica → verbo amigável
  _actionVerb(a) {
    const map = {
      create:              { verbo: 'Criou',     cor: '#10b981', bg: 'rgba(16,185,129,.15)' },
      update:              { verbo: 'Editou',    cor: '#3b82f6', bg: 'rgba(59,130,246,.15)' },
      delete:              { verbo: 'Excluiu',   cor: '#dc2626', bg: 'rgba(220,38,38,.15)' },
      pagar:               { verbo: 'Pagou',     cor: '#22c55e', bg: 'rgba(34,197,94,.15)' },
      estornar:            { verbo: 'Estornou',  cor: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
      emitir:              { verbo: 'Emitiu',    cor: '#6366f1', bg: 'rgba(99,102,241,.15)' },
      'cancelar-emissao':  { verbo: 'Cancelou emissão', cor: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
      passagem:            { verbo: 'Comprou passagem', cor: '#a855f7', bg: 'rgba(168,85,247,.15)' },
    };
    return map[a] || { verbo: a || '—', cor: 'var(--color-text)', bg: 'var(--color-bg)' };
  },

  _tempoRelativo(ts) {
    if (!ts) return '';
    const diff = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return 'agora há pouco';
    if (diff < 3600) return `há ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff/3600)} h`;
    if (diff < 604800) return `há ${Math.floor(diff/86400)} dias`;
    return new Date(ts).toLocaleDateString('pt-BR');
  },

  _statusLabel(s) {
    if (s === 200) return { texto: 'Sucesso',         cor: '#10b981' };
    if (s === 400) return { texto: 'Erro de validação', cor: '#dc2626' };
    if (s === 401) return { texto: 'Sem permissão',    cor: '#dc2626' };
    if (s === 404) return { texto: 'Não encontrado',   cor: '#f59e0b' };
    if (s === 429) return { texto: 'Limite atingido',  cor: '#f59e0b' };
    if (s >= 400)  return { texto: 'Erro',             cor: '#dc2626' };
    if (s >= 300)  return { texto: 'Aviso',            cor: '#f59e0b' };
    return { texto: 'OK', cor: '#10b981' };
  },

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

    // Lista de entidades + ações pra dropdowns (em português)
    const entidadesOpts = [
      'clientes','fornecedores','recursos','contracts','contracts.saidas','contracts.budget',
      'contracts.organograma','contracts.rdos','caixa','contas-pagar','notas-fiscais',
      'investimentos','base','tipos-base','niveis-acesso','doc-templates','users',
      'recursos.folgas','recursos.documentos','recursos.passagem','socios',
    ];
    const acoesOpts = ['create','update','delete','pagar','estornar','emitir','cancelar-emissao','passagem'];

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Histórico de Atividades</h1>
          <p class="page-subtitle">Tudo que aconteceu no sistema — quem fez, o quê e quando</p>
        </div>
        <div style="font-size:14px;color:var(--color-text-muted);">${total} ${total === 1 ? 'atividade' : 'atividades'}</div>
      </div>

      <!-- Filtros -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr auto;gap:var(--sp-md);margin-bottom:var(--sp-md);align-items:end;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Quem? (email do usuário)</label>
          <input class="form-control" id="fAuditUser" placeholder="ex: joão@" value="${escapeHtml(this._filters.user)}">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Em quê? (tela/recurso)</label>
          <select class="form-control" id="fAuditEntity">
            <option value="">Tudo</option>
            ${entidadesOpts.map(e => `<option value="${e}" ${this._filters.entity === e ? 'selected' : ''}>${this._entityLabel(e)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">O que fez?</label>
          <select class="form-control" id="fAuditAction">
            <option value="">Qualquer ação</option>
            ${acoesOpts.map(a => `<option value="${a}" ${this._filters.action === a ? 'selected' : ''}>${this._actionVerb(a).verbo}</option>`).join('')}
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
            <th style="width:160px;">Quando</th>
            <th>Quem</th>
            <th>Fez o quê</th>
            <th style="width:120px;text-align:center;">Resultado</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhuma atividade no filtro selecionado</td></tr>` : ''}
          ${rows.map(r => {
            const verbInfo = this._actionVerb(r.action);
            const entLabel = this._entityLabel(r.entity);
            const statusInfo = this._statusLabel(r.status);
            return `
              <tr class="row-audit" data-id="${r.id}" style="cursor:pointer;">
                <td>
                  <div style="font-weight:500;">${fmtDT(r.ts)}</div>
                  <div style="font-size:12px;color:var(--color-text-muted);">${this._tempoRelativo(r.ts)}</div>
                </td>
                <td>
                  <strong>${escapeHtml((r.userEmail || '').split('@')[0] || '—')}</strong>
                  <div style="font-size:12px;color:var(--color-text-muted);">${escapeHtml(r.userEmail || r.userId || '—')}</div>
                </td>
                <td>
                  <span style="background:${verbInfo.bg};color:${verbInfo.cor};padding:2px 10px;border-radius:99px;font-weight:600;font-size:13px;margin-right:6px;">${verbInfo.verbo}</span>
                  <strong>${escapeHtml(entLabel)}</strong>
                  ${r.entityId ? `<span style="font-size:12px;color:var(--color-text-muted);font-family:monospace;margin-left:6px;">${escapeHtml(r.entityId).slice(0, 16)}${r.entityId.length > 16 ? '…' : ''}</span>` : ''}
                </td>
                <td style="text-align:center;">
                  <span style="color:${statusInfo.cor};font-weight:600;font-size:13px;">${statusInfo.texto}</span>
                </td>
              </tr>
            `;
          }).join('')}
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
    const verbInfo = this._actionVerb(ev.action);
    const entLabel = this._entityLabel(ev.entity);
    const statusInfo = this._statusLabel(ev.status);
    const bodyJson = ev.body ? JSON.stringify(ev.body, null, 2) : '(sem dados enviados)';

    const userName = (ev.userEmail || '').split('@')[0] || ev.userId || 'Desconhecido';
    const frase = `${userName} ${verbInfo.verbo.toLowerCase()} ${entLabel.toLowerCase()}`;

    const html = `
      <div class="modal-overlay" id="modalAudit">
        <div class="modal" style="width:680px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title" style="margin:0;">${escapeHtml(frase)}</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">${fmtDT(ev.ts)} (${this._tempoRelativo(ev.ts)})</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <!-- Resumo amigável -->
            <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;margin-bottom:var(--sp-md);">
              <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;font-size:14px;line-height:1.7;">
                <div style="color:var(--color-text-muted);">Quem fez</div>
                <div><strong>${escapeHtml(ev.userEmail || '—')}</strong></div>

                <div style="color:var(--color-text-muted);">O que fez</div>
                <div>
                  <span style="background:${verbInfo.bg};color:${verbInfo.cor};padding:2px 10px;border-radius:99px;font-weight:700;font-size:13px;">${verbInfo.verbo}</span>
                  <strong style="margin-left:6px;">${escapeHtml(entLabel)}</strong>
                </div>

                ${ev.entityId ? `
                  <div style="color:var(--color-text-muted);">Identificador</div>
                  <div style="font-family:monospace;font-size:12px;">${escapeHtml(ev.entityId)}</div>
                ` : ''}

                <div style="color:var(--color-text-muted);">Resultado</div>
                <div style="color:${statusInfo.cor};font-weight:600;">${statusInfo.texto}</div>

                <div style="color:var(--color-text-muted);">De qual rede</div>
                <div style="font-family:monospace;font-size:12px;">${escapeHtml(ev.ip || '—')}</div>
              </div>
            </div>

            <!-- Dados enviados (quando faz sentido) -->
            ${ev.body && Object.keys(ev.body || {}).length > 0 ? `
              <details>
                <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">
                  Detalhes técnicos (dados enviados)
                </summary>
                <pre style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;padding:var(--sp-md);font-size:12px;font-family:monospace;overflow:auto;max-height:300px;white-space:pre-wrap;margin-top:8px;">${escapeHtml(bodyJson)}</pre>
              </details>
            ` : ''}
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
