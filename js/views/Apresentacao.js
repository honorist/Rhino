/**
 * View: Apresentação da Empresa (#/apresentacao)
 *
 * Configuração GLOBAL usada em TODAS as propostas geradas — uma única vez,
 * vale para todas. Tem:
 *   - 3 campos textuais: APRESENTAÇÃO, CASES DE SUCESSO RECENTES, SEGURANÇA E SAÚDE
 *   - Galeria de logos de clientes que vão na seção de Cases
 */
window.Apresentacao = {
  _dados: { apresentacao: '', casesSucesso: '', segurancaSaude: '' },
  _logos: [],
  _saveTimer: null,

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando apresentação...</div>';
    try {
      const [aprRes, logosRes] = await Promise.all([
        fetch('/api/app-settings/proposta_apresentacao').then(r => r.json()),
        fetch('/api/case-logos').then(r => r.json()),
      ]);
      this._dados = aprRes.apresentacao || { apresentacao: '', casesSucesso: '', segurancaSaude: '' };
      this._logos = logosRes.logos || [];
      this._renderUI();
    } catch (e) {
      app.innerHTML = `<div class="error-banner">Erro: ${escapeHtml(e.message)}</div>`;
    }
  },

  _renderUI() {
    const app = document.getElementById('app');
    const d = this._dados;
    app.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Apresentação da Empresa</h1>
          <p class="page-subtitle">Configuração padrão usada em TODAS as propostas geradas.</p>
        </div>
        <a class="btn btn-secondary btn-lg" href="#/proposta">← Voltar para Propostas</a>
      </div>

      <div class="card prop-dados-card" style="margin-bottom:20px;">
        <h3 class="prop-section-title">Textos (aparecem no DOCX e PDF)</h3>
        <p class="text-muted" style="font-size:12px;margin:0 0 14px;">
          Os 3 campos abaixo são opcionais. Cada um vira uma seção na proposta gerada — vazio = oculto.
          <strong>Estes textos são fixos e iguais em todas as propostas.</strong>
        </p>
        <div class="form-group prop-fg" style="margin-bottom:14px;">
          <label class="form-label">APRESENTAÇÃO — sobre a Rhino</label>
          <textarea class="form-control" id="apresentacao" rows="6"
                    placeholder="Ex: Fundada em 2015, a Rhino Manutenções atua em manutenção industrial, montagem de equipamentos...">${escapeHtml(d.apresentacao || '')}</textarea>
        </div>
        <div class="form-group prop-fg" style="margin-bottom:14px;">
          <label class="form-label">CASES DE SUCESSO RECENTES</label>
          <textarea class="form-control" id="casesSucesso" rows="6"
                    placeholder="Ex:&#10;• Suzano — Fabricação de tanque T-401 (2025)&#10;• Arauco — Montagem de tubulação L-202 (2024)">${escapeHtml(d.casesSucesso || '')}</textarea>
          <small class="form-hint">Use bullets (•) ou hifens (-) no início de cada linha — vão como lista no documento.</small>
        </div>
        <div class="form-group prop-fg">
          <label class="form-label">SEGURANÇA E SAÚDE</label>
          <textarea class="form-control" id="segurancaSaude" rows="6"
                    placeholder="Ex: A Rhino mantém política de segurança alinhada às NRs 10, 33, 34 e 35...">${escapeHtml(d.segurancaSaude || '')}</textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
          <span id="saveStatus" style="font-size:12px;color:#10b981;align-self:center;display:none;">✓ salvo</span>
          <span id="savingStatus" style="font-size:12px;color:#64748b;align-self:center;display:none;">salvando…</span>
        </div>
      </div>

      <div class="card" style="padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
          <div>
            <h3 style="margin:0;color:#1F497D;">Logos de Clientes (Cases)</h3>
            <p class="text-muted" style="font-size:12px;margin:4px 0 0;">
              Imagens dos clientes mais relevantes — aparecem em grade na seção "Cases de Sucesso" do DOCX/PDF.
              Formato: JPG/PNG/WebP, até 2 MB cada.
            </p>
          </div>
          <label class="btn btn-primary" style="cursor:pointer;">
            + Adicionar Logo
            <input type="file" id="upLogo" accept="image/jpeg,image/png,image/webp" style="display:none;">
          </label>
        </div>

        ${this._logos.length === 0 ? `
          <div style="text-align:center;padding:36px;color:#94a3b8;border:2px dashed #e2e8f0;border-radius:8px;">
            Nenhuma logo cadastrada. Adicione logos dos clientes que você teve cases relevantes (Suzano, Arauco, etc.).
          </div>
        ` : `
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
            ${this._logos.map((lg, idx) => `
              <div class="card" style="padding:8px;display:flex;flex-direction:column;gap:6px;${!lg.ativo ? 'opacity:.5;' : ''}">
                <div style="height:80px;display:flex;align-items:center;justify-content:center;background:#f8fafc;border-radius:4px;">
                  <img src="/api/case-logos/${lg.id}/image" alt="${escapeHtml(lg.nome)}"
                       style="max-width:100%;max-height:80px;object-fit:contain;">
                </div>
                <input type="text" class="form-control logo-nome" data-id="${lg.id}" value="${escapeHtml(lg.nome)}" style="font-size:12px;padding:3px 6px;" placeholder="Nome">
                <input type="number" class="form-control logo-ordem" data-id="${lg.id}" value="${lg.ordem || 0}" style="font-size:12px;padding:3px 6px;" placeholder="Ordem" min="0">
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                  <a class="action-link btn-logo-toggle" data-id="${lg.id}">${lg.ativo ? 'Desativar' : 'Ativar'}</a>
                  <a class="action-link danger btn-logo-del" data-id="${lg.id}">Excluir</a>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

    // Eventos de autosave dos 3 campos
    const bindAutosave = (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this._save(), 800);
      });
    };
    bindAutosave('apresentacao');
    bindAutosave('casesSucesso');
    bindAutosave('segurancaSaude');

    // Upload de logo
    const up = document.getElementById('upLogo');
    if (up) up.addEventListener('change', () => this._uploadLogo(up.files[0]));

    // Toggle / delete logo
    document.querySelectorAll('.btn-logo-toggle').forEach(b => {
      b.addEventListener('click', async () => {
        const lg = this._logos.find(x => x.id === b.dataset.id);
        if (!lg) return;
        await this._putLogo(lg.id, { ativo: !lg.ativo });
      });
    });
    document.querySelectorAll('.btn-logo-del').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Excluir esta logo?')) return;
        await this._deleteLogo(b.dataset.id);
      });
    });
    document.querySelectorAll('.logo-nome').forEach(inp => {
      let t;
      inp.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => this._putLogo(inp.dataset.id, { nome: inp.value }), 500);
      });
    });
    document.querySelectorAll('.logo-ordem').forEach(inp => {
      let t;
      inp.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => this._putLogo(inp.dataset.id, { ordem: parseInt(inp.value, 10) || 0 }), 500);
      });
    });
  },

  async _save() {
    const apresentacao   = document.getElementById('apresentacao')?.value || '';
    const casesSucesso   = document.getElementById('casesSucesso')?.value || '';
    const segurancaSaude = document.getElementById('segurancaSaude')?.value || '';
    const indSaving = document.getElementById('savingStatus');
    const indSaved  = document.getElementById('saveStatus');
    if (indSaving) indSaving.style.display = '';
    if (indSaved)  indSaved.style.display = 'none';
    try {
      const r = await fetch('/api/app-settings/proposta_apresentacao', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apresentacao, casesSucesso, segurancaSaude }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      this._dados = j.apresentacao || this._dados;
      if (indSaving) indSaving.style.display = 'none';
      if (indSaved) {
        indSaved.style.display = '';
        setTimeout(() => { if (indSaved) indSaved.style.display = 'none'; }, 1500);
      }
    } catch (e) {
      if (window.showToast) showToast('Erro ao salvar: ' + e.message, 'error');
      if (indSaving) indSaving.style.display = 'none';
    }
  },

  async _uploadLogo(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('nome', file.name.replace(/\.[^.]+$/, ''));
    try {
      const r = await fetch('/api/case-logos', { method: 'POST', body: fd });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      this._logos = j.logos || [];
      this._renderUI();
      if (window.showToast) showToast('Logo adicionada', 'success');
    } catch (e) {
      if (window.showToast) showToast('Erro: ' + e.message, 'error');
    }
  },

  async _putLogo(id, patch) {
    try {
      const r = await fetch(`/api/case-logos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      this._logos = j.logos || [];
      // Não re-renderiza se foi só edição de campo (preserva foco)
      if (patch.ativo !== undefined) this._renderUI();
    } catch (e) {
      if (window.showToast) showToast('Erro: ' + e.message, 'error');
    }
  },

  async _deleteLogo(id) {
    try {
      const r = await fetch(`/api/case-logos/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      this._logos = j.logos || [];
      this._renderUI();
    } catch (e) {
      if (window.showToast) showToast('Erro: ' + e.message, 'error');
    }
  },
};
