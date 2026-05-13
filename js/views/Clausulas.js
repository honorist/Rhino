/**
 * View: Biblioteca de Cláusulas (#/clausulas)
 *
 * CRUD com filtros por categoria, busca livre em titulo/texto/tags.
 * Categorias: obrigacoes_contratada, obrigacoes_contratante, pagamento, garantia, geral.
 * Cláusulas marcadas como `ativa=false` ficam escondidas do picker do editor.
 */
window.Clausulas = {
  filtroCategoria: 'todas',
  busca: '',

  CATEGORIAS: [
    { v: 'todas',                  l: 'Todas' },
    { v: 'obrigacoes_contratada',  l: 'Obrigações da Contratada' },
    { v: 'obrigacoes_contratante', l: 'Obrigações da Contratante' },
    { v: 'pagamento',              l: 'Pagamento' },
    { v: 'garantia',               l: 'Garantia' },
    { v: 'geral',                  l: 'Geral' },
  ],

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando biblioteca de cláusulas...</div>';

    try {
      await Store.loadFor(['clausulas']);

      let clausulas = Store.state.clausulas || [];
      if (this.filtroCategoria !== 'todas') {
        clausulas = clausulas.filter(c => c.categoria === this.filtroCategoria);
      }
      const termo = (this.busca || '').toLowerCase().trim();
      if (termo) {
        clausulas = clausulas.filter(c =>
          (c.titulo || '').toLowerCase().includes(termo) ||
          (c.texto || '').toLowerCase().includes(termo) ||
          (Array.isArray(c.tags) ? c.tags.join(' ').toLowerCase() : '').includes(termo)
        );
      }

      const contagem = (Store.state.clausulas || []).reduce((acc, c) => {
        acc[c.categoria] = (acc[c.categoria] || 0) + 1;
        return acc;
      }, {});
      const totalGeral = Store.state.clausulas.length;

      app.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Biblioteca de Cláusulas</h1>
            <p class="page-subtitle">${totalGeral} cláusula${totalGeral !== 1 ? 's' : ''} cadastrada${totalGeral !== 1 ? 's' : ''} · reutilizáveis em propostas</p>
          </div>
          <div style="display:flex;gap:8px;">
            <a class="btn btn-secondary btn-lg" href="#/proposta">← Voltar para Propostas</a>
            <button class="btn btn-primary btn-lg" id="btnNovaClausula">+ Nova Cláusula</button>
          </div>
        </div>

        <div class="rh-status-chips" style="display:flex;gap:6px;flex-wrap:wrap;padding:0 0 12px 0;">
          ${this.CATEGORIAS.map(c => `
            <button class="rh-chip${this.filtroCategoria === c.v ? ' is-active' : ''}" data-cat="${c.v}">
              ${c.l} ${c.v !== 'todas' && contagem[c.v] ? `<span class="chip-count">${contagem[c.v]}</span>` : ''}
            </button>
          `).join('')}
        </div>

        <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);">
          <input class="form-control" id="inputBuscaCla" placeholder="🔍 Buscar por título, texto ou tag..." value="${escapeHtml(this.busca)}">
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px;">
          ${clausulas.length === 0 ? `
            <div class="card" style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);grid-column:1/-1;">
              Nenhuma cláusula encontrada.
            </div>
          ` : clausulas.map(c => this._renderCard(c)).join('')}
        </div>
      `;

      this._attachEvents();
    } catch (e) {
      console.error('[Clausulas] erro:', e);
      app.innerHTML = `<div class="error-banner">Erro: ${escapeHtml(e.message)}</div>`;
    }
  },

  _renderCard(c) {
    const catLabel = this.CATEGORIAS.find(x => x.v === c.categoria)?.l || c.categoria;
    const tags = Array.isArray(c.tags) ? c.tags : [];
    return `
      <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:8px;${!c.ativa ? 'opacity:.55;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <strong style="font-size:15px;">${escapeHtml(c.titulo)}</strong>
          ${!c.ativa ? '<span class="badge" style="background:#fee;color:#900;font-size:11px;">inativa</span>' : ''}
        </div>
        <div style="font-size:12px;color:#1F497D;font-weight:600;">${catLabel}</div>
        <p style="font-size:13px;color:var(--color-text-muted);line-height:1.5;margin:0;max-height:96px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(c.texto)}</p>
        ${tags.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${tags.map(t => `<span class="badge" style="background:#f1f5f9;color:#475569;font-size:10px;">${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}
        ${c.usoCount > 0 ? `<div style="font-size:11px;color:#888;">Usada em ${c.usoCount} proposta(s)</div>` : ''}
        <div class="actions-cell" style="margin-top:auto;padding-top:8px;border-top:1px solid #eee;">
          <a class="action-link btn-editar-cla" data-id="${c.id}">Editar</a>
          <a class="action-link btn-toggle-cla" data-id="${c.id}">${c.ativa ? 'Desativar' : 'Ativar'}</a>
          <a class="action-link danger btn-excluir-cla" data-id="${c.id}">Excluir</a>
        </div>
      </div>
    `;
  },

  _attachEvents() {
    document.querySelectorAll('.rh-chip[data-cat]').forEach(b => {
      b.addEventListener('click', () => { this.filtroCategoria = b.dataset.cat; this.render(); });
    });
    const inputBusca = document.getElementById('inputBuscaCla');
    if (inputBusca) {
      let timer;
      inputBusca.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { this.busca = inputBusca.value; this.render(); }, 250);
      });
    }
    const btnNova = document.getElementById('btnNovaClausula');
    if (btnNova) btnNova.addEventListener('click', () => this.showModal(null));

    document.querySelectorAll('.btn-editar-cla').forEach(b => {
      b.addEventListener('click', () => {
        const c = (Store.state.clausulas || []).find(x => x.id === b.dataset.id);
        if (c) this.showModal(c);
      });
    });
    document.querySelectorAll('.btn-toggle-cla').forEach(b => {
      b.addEventListener('click', async () => {
        const c = (Store.state.clausulas || []).find(x => x.id === b.dataset.id);
        if (!c) return;
        try {
          await Store.atualizarClausula(c.id, { ativa: !c.ativa });
          this.render();
        } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
      });
    });
    document.querySelectorAll('.btn-excluir-cla').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Excluir esta cláusula? Propostas que já a usam não serão afetadas (texto está copiado).')) return;
        try {
          await Store.deletarClausula(b.dataset.id);
          this.render();
        } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
      });
    });
  },

  showModal(clausula) {
    const isEdit = !!clausula;
    const c = clausula || { titulo: '', texto: '', categoria: 'obrigacoes_contratada', tags: [], ativa: true };

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:680px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">${isEdit ? 'Editar Cláusula' : 'Nova Cláusula'}</h2>
            <button class="modal-close" id="btnFecharModalCla">✕</button>
          </div>
          <form id="formCla" class="modal-content">
            <div class="form-group">
              <label class="form-label">Categoria *</label>
              <select class="form-control" name="categoria" required>
                <option value="obrigacoes_contratada"  ${c.categoria==='obrigacoes_contratada' ? 'selected':''}>Obrigações da Contratada</option>
                <option value="obrigacoes_contratante" ${c.categoria==='obrigacoes_contratante' ? 'selected':''}>Obrigações da Contratante</option>
                <option value="pagamento"              ${c.categoria==='pagamento' ? 'selected':''}>Pagamento</option>
                <option value="garantia"               ${c.categoria==='garantia' ? 'selected':''}>Garantia</option>
                <option value="geral"                  ${c.categoria==='geral' ? 'selected':''}>Geral</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Título *</label>
              <input type="text" class="form-control" name="titulo" required value="${escapeHtml(c.titulo)}" placeholder="Ex: EPIs e EPCs">
            </div>
            <div class="form-group">
              <label class="form-label">Texto *</label>
              <textarea class="form-control" name="texto" rows="8" required placeholder="Texto completo da cláusula como aparecerá na proposta...">${escapeHtml(c.texto)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Tags (separadas por vírgula)</label>
              <input type="text" class="form-control" name="tags" value="${escapeHtml((c.tags || []).join(', '))}" placeholder="seguranca, padrao, fabricacao">
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarCla">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarCla">${isEdit ? 'Salvar Alterações' : 'Criar Cláusula'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const close = () => document.getElementById('modalOverlay')?.remove();
    document.getElementById('btnFecharModalCla').addEventListener('click', close);
    document.getElementById('btnCancelarCla').addEventListener('click', close);
    document.getElementById('btnSalvarCla').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formCla'));
      const data = Object.fromEntries(fd);
      if (!data.titulo?.trim() || !data.texto?.trim()) {
        if (window.showToast) showToast('Título e texto são obrigatórios', 'warning');
        return;
      }
      data.tags = (data.tags || '').split(',').map(s => s.trim()).filter(Boolean);
      try {
        if (isEdit) await Store.atualizarClausula(clausula.id, data);
        else        await Store.criarClausula(data);
        close();
        this.render();
        if (window.showToast) showToast(isEdit ? 'Cláusula atualizada' : 'Cláusula criada', 'success');
      } catch (e) {
        if (window.showToast) showToast('Erro: ' + e.message, 'error');
      }
    });
  },
};
