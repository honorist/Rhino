// Solicitações de Compra — usuário cria, gerente aprova/rejeita.
// Aprovação gera entrada de estoque + Conta a Pagar (server.js cuida da transação).
window.SolicitacoesCompra = {
  filtroStatus: '',
  filtroContrato: '',

  _podeAprovar() {
    const abas = window.perfil?.abas?.() || [];
    if (!abas) return true; // admin sem perfil ativo
    return abas.includes('solicitacoes-compra:aprovar');
  },

  _badgeStatus(status) {
    const cfg = {
      pendente:  { bg: '#FEF3C7', color: '#92400E', label: 'Pendente' },
      aprovada:  { bg: '#D1FAE5', color: '#065F46', label: 'Aprovada' },
      rejeitada: { bg: '#FEE2E2', color: '#991B1B', label: 'Rejeitada' },
      cancelada: { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelada' },
    }[status] || { bg: '#F3F4F6', color: '#6B7280', label: status || '—' };
    return `<span class="badge" style="background:${cfg.bg};color:${cfg.color};font-size:13px;padding:2px 10px;border-radius:12px;font-weight:700;">${cfg.label}</span>`;
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      await Store.loadAll();
      this._draw();
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="card"><p class="text-danger">Erro ao carregar solicitações: ${escapeHtml(e.message)}</p></div>`;
    }
  },

  _draw() {
    const app = document.getElementById('app');
    const todas = Store.state.solicitacoes_compra || [];
    const contratos = Store.state.contracts || [];
    const podeAprovar = this._podeAprovar();

    // Filtros
    let lista = todas;
    if (this.filtroStatus) lista = lista.filter(s => s.status === this.filtroStatus);
    if (this.filtroContrato) lista = lista.filter(s => s.contractId === this.filtroContrato);

    // KPIs
    const kpiPend = todas.filter(s => s.status === 'pendente').length;
    const kpiAprov = todas.filter(s => s.status === 'aprovada').length;
    const kpiRej = todas.filter(s => s.status === 'rejeitada').length;
    const kpiTotalPend = todas.filter(s => s.status === 'pendente').reduce((sum, s) => sum + (parseFloat(s.valorTotal) || 0), 0);

    const html = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Solicitações de Compra</h1>
          <p class="page-subtitle">${todas.length} solicitação${todas.length !== 1 ? 'ões' : ''}${podeAprovar ? ' · você pode aprovar' : ''}</p>
        </div>
        <button class="btn btn-primary btn-lg" id="btnNovaSolicitacao">+ Nova Solicitação</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-md);margin-bottom:var(--sp-lg);">
        <div class="card" style="padding:var(--sp-md);">
          <div style="font-size:13px;color:var(--color-text-muted);text-transform:uppercase;font-weight:700;">Pendentes</div>
          <div style="font-size:28px;font-weight:800;color:#92400E;">${kpiPend}</div>
          <div style="font-size:13px;color:var(--color-text-muted);">${Store.formatBRL(kpiTotalPend)} aguardando aprovação</div>
        </div>
        <div class="card" style="padding:var(--sp-md);">
          <div style="font-size:13px;color:var(--color-text-muted);text-transform:uppercase;font-weight:700;">Aprovadas</div>
          <div style="font-size:28px;font-weight:800;color:#065F46;">${kpiAprov}</div>
        </div>
        <div class="card" style="padding:var(--sp-md);">
          <div style="font-size:13px;color:var(--color-text-muted);text-transform:uppercase;font-weight:700;">Rejeitadas</div>
          <div style="font-size:28px;font-weight:800;color:#991B1B;">${kpiRej}</div>
        </div>
        <div class="card" style="padding:var(--sp-md);">
          <div style="font-size:13px;color:var(--color-text-muted);text-transform:uppercase;font-weight:700;">Total</div>
          <div style="font-size:28px;font-weight:800;">${todas.length}</div>
        </div>
      </div>

      <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);">
          <div>
            <label class="form-label">Status</label>
            <select id="filtroStatus" class="form-control">
              <option value="">Todos</option>
              <option value="pendente"  ${this.filtroStatus==='pendente'?'selected':''}>Pendente</option>
              <option value="aprovada"  ${this.filtroStatus==='aprovada'?'selected':''}>Aprovada</option>
              <option value="rejeitada" ${this.filtroStatus==='rejeitada'?'selected':''}>Rejeitada</option>
              <option value="cancelada" ${this.filtroStatus==='cancelada'?'selected':''}>Cancelada</option>
            </select>
          </div>
          <div>
            <label class="form-label">Contrato</label>
            <select id="filtroContrato" class="form-control">
              <option value="">Todos</option>
              ${contratos.map(c => `<option value="${c.id}" ${this.filtroContrato===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Solicitante</th>
                <th>Destino</th>
                <th>Itens</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${lista.length === 0 ? `
                <tr><td colspan="7" class="text-center text-muted" style="padding:var(--sp-xl);">Nenhuma solicitação encontrada</td></tr>
              ` : lista.map(s => {
                const contrato = contratos.find(c => c.id === s.contractId);
                const itens = Array.isArray(s.itens) ? s.itens : (s.itens ? JSON.parse(s.itens) : []);
                return `
                <tr>
                  <td>${s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>${escapeHtml(s.solicitanteNome || '—')}</td>
                  <td>${contrato ? '🏗️ ' + escapeHtml(contrato.name) : '🏢 Sede'}</td>
                  <td>${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</td>
                  <td><strong>${Store.formatBRL(parseFloat(s.valorTotal) || 0)}</strong></td>
                  <td>${this._badgeStatus(s.status)}</td>
                  <td>
                    <div class="actions-cell" style="display:flex;gap:6px;flex-wrap:wrap;">
                      <a class="action-link btn-detalhe" data-id="${s.id}">Ver</a>
                      ${s.status === 'pendente' && podeAprovar ? `
                        <a class="action-link btn-aprovar" data-id="${s.id}" style="color:#065F46;font-weight:700;">Aprovar</a>
                        <a class="action-link btn-rejeitar" data-id="${s.id}" style="color:#991B1B;">Rejeitar</a>
                      ` : ''}
                      ${s.status === 'pendente' ? `<a class="action-link btn-editar" data-id="${s.id}">Editar</a>` : ''}
                      ${s.status !== 'aprovada' ? `<a class="action-link danger btn-excluir" data-id="${s.id}">Excluir</a>` : ''}
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    app.innerHTML = html;

    document.getElementById('btnNovaSolicitacao').addEventListener('click', () => this.showModal());
    document.getElementById('filtroStatus').addEventListener('change', e => { this.filtroStatus = e.target.value; this._draw(); });
    document.getElementById('filtroContrato').addEventListener('change', e => { this.filtroContrato = e.target.value; this._draw(); });

    document.querySelectorAll('.btn-detalhe').forEach(b => b.addEventListener('click', e => this.showDetalhe(e.target.dataset.id)));
    document.querySelectorAll('.btn-editar').forEach(b => b.addEventListener('click', e => this.showModal(e.target.dataset.id)));
    document.querySelectorAll('.btn-excluir').forEach(b => b.addEventListener('click', e => this.excluir(e.target.dataset.id)));
    document.querySelectorAll('.btn-aprovar').forEach(b => b.addEventListener('click', e => this.aprovar(e.target.dataset.id)));
    document.querySelectorAll('.btn-rejeitar').forEach(b => b.addEventListener('click', e => this.rejeitar(e.target.dataset.id)));
  },

  showModal(id) {
    const s = id ? (Store.state.solicitacoes_compra || []).find(x => x.id === id) : null;
    const itensIniciais = s ? (Array.isArray(s.itens) ? s.itens : JSON.parse(s.itens || '[]')) : [{ descricao: '', qtd: 1, precoUnit: 0, observacoes: '' }];
    const contratos = (Store.state.contracts || []).filter(c => c.status === 'ativo' || c.status === 'pausado');
    const fornecedores = Store.state.fornecedores || [];
    const itensEstoque = Store.state.itens_estoque || [];

    const renderLinhaItem = (it, idx) => `
      <tr data-i="${idx}" class="item-row">
        <td><input class="form-control" data-f="descricao" placeholder="Descrição do material" value="${escapeHtml(it.descricao || '')}"></td>
        <td><input class="form-control" data-f="qtd" type="number" step="0.01" min="0" value="${it.qtd || 1}" style="width:80px;"></td>
        <td><input class="form-control" data-f="precoUnit" type="number" step="0.01" min="0" value="${it.precoUnit || 0}" style="width:110px;"></td>
        <td style="text-align:right;font-weight:700;" class="item-subtotal">${Store.formatBRL((it.qtd || 0) * (it.precoUnit || 0))}</td>
        <td><button type="button" class="btn btn-sm btn-ghost btn-rm-item" data-i="${idx}" style="color:#DC2626;">✕</button></td>
      </tr>
    `;

    const html = `
      <div class="modal-overlay" id="modalSolicitacao">
        <div class="modal" style="width:780px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">${s ? 'Editar Solicitação' : 'Nova Solicitação de Compra'}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formSolicitacao" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Destino *</label>
                <select class="form-control" name="destino" required>
                  <option value="sede" ${(!s?.contractId)?'selected':''}>🏢 Sede / Almoxarifado Central</option>
                  ${contratos.map(c => `<option value="obra:${c.id}" ${s?.contractId===c.id?'selected':''}>🏗️ Obra · ${escapeHtml(c.name)}</option>`).join('')}
                </select>
                <span style="font-size:12px;color:var(--color-text-muted);">A entrada do estoque vai pra esse destino quando aprovada.</span>
              </div>
              <div class="form-group">
                <label class="form-label">Fornecedor</label>
                <select class="form-control" name="fornecedorId">
                  <option value="">— Selecionar depois —</option>
                  ${fornecedores.map(f => `<option value="${f.id}" ${s?.fornecedorId===f.id?'selected':''}>${escapeHtml(f.nome || f.razaoSocial)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Justificativa</label>
              <textarea class="form-control" name="justificativa" rows="2" placeholder="Por que esses materiais são necessários?">${escapeHtml(s?.justificativa || '')}</textarea>
            </div>

            <div style="margin-top:var(--sp-lg);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
                <h3 style="margin:0;font-size:16px;font-weight:700;">Itens solicitados</h3>
                <button type="button" class="btn btn-sm btn-secondary" id="btnAddItem">+ Adicionar item</button>
              </div>
              <div class="card" style="padding:0;overflow:auto;">
                <table style="width:100%;">
                  <thead>
                    <tr style="background:var(--color-surface-2);">
                      <th style="padding:8px;text-align:left;">Descrição</th>
                      <th style="padding:8px;text-align:left;">Qtd</th>
                      <th style="padding:8px;text-align:left;">Preço Unit.</th>
                      <th style="padding:8px;text-align:right;">Subtotal</th>
                      <th style="padding:8px;width:40px;"></th>
                    </tr>
                  </thead>
                  <tbody id="tbodyItens">
                    ${itensIniciais.map((it, i) => renderLinhaItem(it, i)).join('')}
                  </tbody>
                  <tfoot>
                    <tr style="background:var(--color-surface-2);">
                      <td colspan="3" style="padding:10px 8px;text-align:right;font-weight:700;">Total estimado:</td>
                      <td style="padding:10px 8px;text-align:right;font-weight:800;font-size:18px;" id="totalGeral">R$ 0,00</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${s ? 'Salvar' : 'Criar Solicitação'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalSolicitacao');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelar').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const recalcularTotais = () => {
      let total = 0;
      document.querySelectorAll('.item-row').forEach(tr => {
        const qtd = parseFloat(tr.querySelector('[data-f="qtd"]').value) || 0;
        const preco = parseFloat(tr.querySelector('[data-f="precoUnit"]').value) || 0;
        const sub = qtd * preco;
        tr.querySelector('.item-subtotal').textContent = Store.formatBRL(sub);
        total += sub;
      });
      document.getElementById('totalGeral').textContent = Store.formatBRL(total);
    };

    const reindexar = () => {
      document.querySelectorAll('#tbodyItens .item-row').forEach((tr, i) => {
        tr.dataset.i = i;
        tr.querySelector('.btn-rm-item').dataset.i = i;
      });
    };

    overlay.addEventListener('input', e => {
      if (e.target.matches('[data-f="qtd"], [data-f="precoUnit"]')) recalcularTotais();
    });

    document.getElementById('btnAddItem').addEventListener('click', () => {
      const tbody = document.getElementById('tbodyItens');
      const idx = tbody.querySelectorAll('.item-row').length;
      tbody.insertAdjacentHTML('beforeend', renderLinhaItem({ descricao: '', qtd: 1, precoUnit: 0 }, idx));
      reindexar();
      recalcularTotais();
    });

    overlay.addEventListener('click', e => {
      if (e.target.classList.contains('btn-rm-item')) {
        e.target.closest('.item-row').remove();
        reindexar();
        recalcularTotais();
      }
    });

    recalcularTotais();

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const form = document.getElementById('formSolicitacao');
      const fd = new FormData(form);
      const itens = [];
      document.querySelectorAll('.item-row').forEach(tr => {
        const desc = tr.querySelector('[data-f="descricao"]').value.trim();
        const qtd = parseFloat(tr.querySelector('[data-f="qtd"]').value) || 0;
        const precoUnit = parseFloat(tr.querySelector('[data-f="precoUnit"]').value) || 0;
        if (desc && qtd > 0) itens.push({ descricao: desc, qtd, precoUnit });
      });
      if (!itens.length) { window.showToast('Adicione pelo menos um item válido', 'error'); return; }

      // "destino" é "sede" ou "obra:<contractId>"
      const destino = fd.get('destino') || 'sede';
      let contractId = null;
      let almoxarifadoDestinoId = 'auto-central';
      if (destino.startsWith('obra:')) {
        contractId = destino.slice(5);
        almoxarifadoDestinoId = `auto-obra:${contractId}`;
      }

      const payload = {
        contractId,
        almoxarifadoDestinoId,
        fornecedorId: fd.get('fornecedorId') || null,
        justificativa: fd.get('justificativa') || '',
        itens,
      };

      try {
        const url = s ? `/api/solicitacoes-compra/${s.id}` : '/api/solicitacoes-compra';
        const method = s ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        window.showToast(s ? 'Solicitação atualizada' : 'Solicitação criada', 'success');
        close();
        this.render();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  showDetalhe(id) {
    const s = (Store.state.solicitacoes_compra || []).find(x => x.id === id);
    if (!s) return;
    const itens = Array.isArray(s.itens) ? s.itens : JSON.parse(s.itens || '[]');
    const contrato = (Store.state.contracts || []).find(c => c.id === s.contractId);
    const fornecedor = (Store.state.fornecedores || []).find(f => f.id === s.fornecedorId);

    const html = `
      <div class="modal-overlay" id="modalDetalheSol">
        <div class="modal" style="width:680px;max-width:95vw;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Solicitação ${s.numero ? '#' + s.numero : '#' + s.id.slice(-6)}</h2>
              <div style="margin-top:4px;">${this._badgeStatus(s.status)}</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:var(--sp-md);">
              <div><strong>Solicitante:</strong> ${escapeHtml(s.solicitanteNome || '—')}</div>
              <div><strong>Data:</strong> ${s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '—'}</div>
              <div><strong>Destino:</strong> ${contrato ? '🏗️ ' + escapeHtml(contrato.name) : '🏢 Sede / Almoxarifado Central'}</div>
              <div><strong>Fornecedor:</strong> ${fornecedor ? escapeHtml(fornecedor.nome || fornecedor.razaoSocial) : '—'}</div>
            </div>
            ${s.justificativa ? `<div style="padding:10px;background:var(--color-surface-2);border-radius:6px;margin-bottom:var(--sp-md);"><strong>Justificativa:</strong><br>${escapeHtml(s.justificativa)}</div>` : ''}
            <h3 style="margin:var(--sp-md) 0 8px;font-size:15px;">Itens (${itens.length})</h3>
            <table style="width:100%;border:1px solid var(--color-border);border-radius:6px;">
              <thead><tr style="background:var(--color-surface-2);"><th style="padding:8px;text-align:left;">Descrição</th><th style="padding:8px;text-align:right;">Qtd</th><th style="padding:8px;text-align:right;">Preço</th><th style="padding:8px;text-align:right;">Subtotal</th></tr></thead>
              <tbody>
                ${itens.map(it => `<tr><td style="padding:8px;">${escapeHtml(it.descricao)}</td><td style="padding:8px;text-align:right;">${it.qtd}</td><td style="padding:8px;text-align:right;">${Store.formatBRL(it.precoUnit)}</td><td style="padding:8px;text-align:right;font-weight:700;">${Store.formatBRL(it.qtd * it.precoUnit)}</td></tr>`).join('')}
              </tbody>
              <tfoot><tr style="background:var(--color-surface-2);"><td colspan="3" style="padding:8px;text-align:right;font-weight:700;">Total:</td><td style="padding:8px;text-align:right;font-weight:800;">${Store.formatBRL(parseFloat(s.valorTotal) || 0)}</td></tr></tfoot>
            </table>

            ${s.status === 'aprovada' ? `
              <div style="margin-top:var(--sp-md);padding:10px;background:#D1FAE5;border-left:3px solid #065F46;border-radius:4px;font-size:14px;">
                <strong>✓ Aprovada por ${escapeHtml(s.aprovadorNome || '—')}</strong>
                ${s.aprovadoEm ? ` em ${new Date(s.aprovadoEm).toLocaleString('pt-BR')}` : ''}
                ${s.contaPagarId ? `<br>Conta a Pagar gerada: <code>${s.contaPagarId.slice(-8)}</code>` : ''}
              </div>
            ` : ''}
            ${s.status === 'rejeitada' ? `
              <div style="margin-top:var(--sp-md);padding:10px;background:#FEE2E2;border-left:3px solid #991B1B;border-radius:4px;font-size:14px;">
                <strong>✗ Rejeitada por ${escapeHtml(s.aprovadorNome || '—')}</strong>
                ${s.motivoRejeicao ? `<br><em>Motivo:</em> ${escapeHtml(s.motivoRejeicao)}` : ''}
              </div>
            ` : ''}
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnFecharDet">Fechar</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalDetalheSol');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFecharDet').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  },

  async aprovar(id) {
    if (!confirm('Aprovar esta solicitação? Será gerada uma entrada de estoque + Conta a Pagar.')) return;
    try {
      const res = await fetch(`/api/solicitacoes-compra/${id}/aprovar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      window.showToast('Solicitação aprovada — entrada e CP gerados', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  },

  async rejeitar(id) {
    const motivo = prompt('Motivo da rejeição (opcional):') ?? null;
    if (motivo === null) return; // cancelou
    try {
      const res = await fetch(`/api/solicitacoes-compra/${id}/rejeitar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      window.showToast('Solicitação rejeitada', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  },

  async excluir(id) {
    if (!confirm('Excluir esta solicitação?')) return;
    try {
      const res = await fetch(`/api/solicitacoes-compra/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      window.showToast('Solicitação excluída', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  },
};
