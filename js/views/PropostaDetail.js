/**
 * View: Editor de Proposta (#/proposta/:id)
 *
 * Orquestrador com 7 abas + autosave debounced (800ms).
 * Submódulos em `js/views/proposta/*` expõem:
 *   window.PropostaDetail.tabs[name] = {
 *     id, label, icon, condition?(proposta),
 *     render(container, proposta, onChange)
 *   }
 *
 * `onChange(patch)` atualiza `this.proposta` localmente e dispara autosave.
 */
window.PropostaDetail = {
  proposta: null,
  _currentTab: 'dados',
  _saveTimer: null,
  _pendingPatch: {},
  _saving: false,
  tabs: {},

  /**
   * Submódulos chamam isso para se registrar.
   */
  registerTab(tabDef) {
    if (!tabDef || !tabDef.id) return;
    this.tabs[tabDef.id] = tabDef;
  },

  async render(params) {
    const id = params?.id;
    const app = document.getElementById('app');
    if (!id) {
      app.innerHTML = '<div class="error-banner">ID da proposta não informado</div>';
      return;
    }
    app.innerHTML = '<div class="loading-spinner">Carregando proposta...</div>';

    try {
      // Carrega proposta completa + slices auxiliares
      const [proposta] = await Promise.all([
        Store.fetchProposta(id),
        Store.loadFor(['clientes', 'clausulas']).catch(e => console.warn('[PropostaDetail] loadFor clientes/clausulas falhou — selects podem ficar vazios:', e?.message || e)),
      ]);
      if (!proposta) {
        app.innerHTML = '<div class="error-banner">Proposta não encontrada</div>';
        return;
      }
      this.proposta = this._normalize(proposta);
      this._pendingPatch = {};
      this._renderShell();
    } catch (e) {
      console.error('[PropostaDetail] erro:', e);
      app.innerHTML = `<div class="error-banner">Erro: ${escapeHtml(e.message)}</div>`;
    }
  },

  /**
   * Normaliza JSONB strings → arrays. Postgres já devolve como objeto, mas
   * mantém defesa caso venha como string.
   */
  _normalize(p) {
    const parseJson = (v, fallback) => {
      if (Array.isArray(v) || (v && typeof v === 'object')) return v;
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { return fallback; }
      }
      return fallback;
    };
    return {
      ...p,
      escopo:               parseJson(p.escopo, []),
      obrigacoesContratada: parseJson(p.obrigacoesContratada, []),
      obrigacoesContratante:parseJson(p.obrigacoesContratante, []),
      cronograma:           parseJson(p.cronograma, []),
      investimentoHh:       parseJson(p.investimentoHh, []),
      investimentoMat:      parseJson(p.investimentoMat, []),
      metadata:             parseJson(p.metadata, {}),
      custos:               Array.isArray(p.custos) ? p.custos : [],
      anexos:               Array.isArray(p.anexos) ? p.anexos : [],
    };
  },

  _renderShell() {
    const app = document.getElementById('app');
    const p = this.proposta;
    const numeroCompleto = `PC_${p.numero}-${String(p.ano).padStart(2,'0')}${p.revisao > 0 ? ` Rev.${String(p.revisao).padStart(2,'0')}` : ''}`;
    const cliente = p.clienteEmpresa || p.clienteNome || '— sem cliente —';

    const tabsOrdem = ['dados','escopo','obrigacoes','cronograma','investimento','custo-interno','anexos','preview'];
    const tabs = tabsOrdem
      .map(id => this.tabs[id])
      .filter(t => t && (!t.condition || t.condition(p)));

    const statusColors = window.Propostas?.STATUS_COLORS?.[p.status] || { bg:'#f1f5f9', fg:'#475569', border:'#cbd5e1' };
    const statusLabel = window.Propostas?.STATUS_LABELS?.[p.status] || p.status;

    app.innerHTML = `
      <div class="page-header" style="margin-bottom:12px;">
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <a href="#/proposta" class="action-link" style="color:#64748b;">← Propostas</a>
            <span style="color:#cbd5e1;">/</span>
            <h1 class="page-title" style="margin:0;">${escapeHtml(numeroCompleto)}</h1>
            <span class="badge" style="background:${statusColors.bg};color:${statusColors.fg};border:1px solid ${statusColors.border};padding:4px 12px;border-radius:14px;">
              ${statusLabel}
            </span>
            <span id="saveIndicator" style="font-size:12px;color:#10b981;display:none;">✓ salvo</span>
            <span id="savingIndicator" style="font-size:12px;color:#64748b;display:none;">salvando…</span>
          </div>
          <p class="page-subtitle" style="margin-top:4px;">
            ${escapeHtml(p.titulo || 'Sem título')} · ${escapeHtml(cliente)}
          </p>
        </div>
        <div id="acoes-header" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
      </div>

      <div class="card" style="padding:0;margin-bottom:16px;">
        <div class="tabs-nav" id="tabsNav" style="display:flex;gap:0;border-bottom:1px solid #e2e8f0;overflow-x:auto;padding:0 8px;">
          ${tabs.map(t => `
            <button class="tab-btn${this._currentTab === t.id ? ' is-active' : ''}" data-tab="${t.id}"
                    style="padding:14px 18px;border:none;background:none;cursor:pointer;font-weight:${this._currentTab === t.id ? '600' : '400'};
                           color:${this._currentTab === t.id ? '#1F497D' : '#64748b'};
                           border-bottom:3px solid ${this._currentTab === t.id ? '#1F497D' : 'transparent'};white-space:nowrap;">
              ${t.icon || ''} ${escapeHtml(t.label)}
            </button>
          `).join('')}
        </div>
      </div>

      <div id="tabContent" class="tab-content"></div>
    `;

    // Eventos das tabs
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._currentTab === btn.dataset.tab) return;
        // Salva pendente antes de trocar de aba
        if (Object.keys(this._pendingPatch).length > 0) {
          this._flushSave();
        }
        this._currentTab = btn.dataset.tab;
        this._renderShell();
      });
    });

    this._renderActions();
    this._renderCurrentTab();
  },

  _renderActions() {
    const container = document.getElementById('acoes-header');
    if (!container) return;
    const p = this.proposta;
    const actions = [];

    if (p.status === 'rascunho') {
      actions.push(`<button class="btn btn-primary" id="btnEnviar">📨 Marcar como Enviada</button>`);
    }
    if (p.status === 'enviada') {
      actions.push(`<button class="btn btn-success" id="btnAceitar" style="background:#10b981;color:white;">✓ Marcar como Aceita</button>`);
      actions.push(`<button class="btn btn-secondary" id="btnRejeitar">✗ Rejeitar</button>`);
    }
    actions.push(`<button class="btn btn-secondary" id="btnDuplicar" title="Cria nova revisão (Rev.+1)">📋 Nova Revisão</button>`);
    actions.push(`<button class="btn btn-secondary" id="btnDocx" title="Baixar DOCX timbrado">📄 DOCX</button>`);
    actions.push(`<button class="btn btn-secondary" id="btnPdf"  title="Baixar PDF">📑 PDF</button>`);

    container.innerHTML = actions.join('');

    document.getElementById('btnEnviar')?.addEventListener('click', async () => {
      if (!confirm(`Marcar proposta como ENVIADA? Use isso após enviar ao cliente. O contrato em prospecção continuará vinculado e ativará automaticamente quando você marcar como Aceita.`)) return;
      try {
        await this._flushSave();
        const j = await Store.enviarProposta(this.proposta.id);
        if (j.proposta) this.proposta = this._normalize(j.proposta);
        if (window.showToast) showToast('Proposta marcada como enviada', 'success');
        this._renderShell();
      } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
    });

    document.getElementById('btnAceitar')?.addEventListener('click', async () => {
      if (!confirm(`Marcar como ACEITA? O contrato em prospecção vinculado mudará automaticamente para "ativo".`)) return;
      try {
        const j = await Store.aceitarProposta(this.proposta.id);
        if (j.proposta) this.proposta = this._normalize(j.proposta);
        if (window.showToast) showToast('Proposta aceita! Contrato ativado.', 'success');
        this._renderShell();
      } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
    });

    document.getElementById('btnRejeitar')?.addEventListener('click', async () => {
      const motivo = prompt('Motivo da rejeição (opcional):');
      if (motivo === null) return; // cancel
      try {
        const j = await Store.rejeitarProposta(this.proposta.id, motivo);
        if (j.proposta) this.proposta = this._normalize(j.proposta);
        if (window.showToast) showToast('Proposta rejeitada', 'warning');
        this._renderShell();
      } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
    });

    document.getElementById('btnDuplicar')?.addEventListener('click', async () => {
      if (!confirm('Criar nova revisão (Rev.+1)? A versão atual será preservada para histórico.')) return;
      try {
        await this._flushSave();
        const j = await Store.duplicarProposta(this.proposta.id);
        if (j.proposta) location.hash = `#/proposta/${j.proposta.id}`;
      } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
    });

    document.getElementById('btnDocx')?.addEventListener('click', async () => {
      await this._flushSave();
      window.open(`/api/propostas/${this.proposta.id}/docx`, '_blank');
    });
    document.getElementById('btnPdf')?.addEventListener('click', async () => {
      await this._flushSave();
      window.open(`/api/propostas/${this.proposta.id}/pdf`, '_blank');
    });
  },

  _renderCurrentTab() {
    const container = document.getElementById('tabContent');
    if (!container) return;
    container.innerHTML = '';
    const tab = this.tabs[this._currentTab];
    if (!tab) {
      container.innerHTML = `<div class="card" style="padding:24px;"><p>Aba não implementada: ${this._currentTab}</p></div>`;
      return;
    }
    try {
      tab.render(container, this.proposta, (patch) => this._onChange(patch));
    } catch (e) {
      console.error(`[PropostaDetail] erro na aba ${this._currentTab}:`, e);
      container.innerHTML = `<div class="error-banner">Erro: ${escapeHtml(e.message)}</div>`;
    }
  },

  /**
   * Recebe um patch parcial da aba, aplica em `this.proposta` e agenda autosave.
   */
  _onChange(patch) {
    if (!patch || typeof patch !== 'object') return;
    Object.assign(this.proposta, patch);
    Object.assign(this._pendingPatch, patch);
    this._scheduleSave();
  },

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._flushSave(), 800);
  },

  async _flushSave() {
    if (this._saving) return;
    if (!this._pendingPatch || Object.keys(this._pendingPatch).length === 0) return;
    const patch = this._pendingPatch;
    this._pendingPatch = {};
    this._saving = true;
    const indSaving = document.getElementById('savingIndicator');
    const indSaved  = document.getElementById('saveIndicator');
    if (indSaving) indSaving.style.display = '';
    if (indSaved)  indSaved.style.display = 'none';
    try {
      const updated = await Store.atualizarProposta(this.proposta.id, patch);
      if (updated) {
        // Mantém escolhas locais que ainda não saíram, e atualiza valor_total etc
        this.proposta = this._normalize({ ...this.proposta, ...updated });
        // Re-render header para atualizar status/valor
        const v = document.querySelector('.page-subtitle');
        if (v && this.proposta) {
          const cliente = this.proposta.clienteEmpresa || this.proposta.clienteNome || '— sem cliente —';
          v.textContent = `${this.proposta.titulo || 'Sem título'} · ${cliente}`;
        }
      }
      if (indSaving) indSaving.style.display = 'none';
      if (indSaved) {
        indSaved.style.display = '';
        setTimeout(() => { if (indSaved) indSaved.style.display = 'none'; }, 1500);
      }
    } catch (e) {
      console.error('[PropostaDetail] autosave falhou:', e);
      if (indSaving) indSaving.style.display = 'none';
      if (window.showToast) showToast('Falha ao salvar: ' + e.message, 'error');
      // Re-injeta patch para tentar novamente
      Object.assign(this._pendingPatch, patch);
    } finally {
      this._saving = false;
    }
  },
};
