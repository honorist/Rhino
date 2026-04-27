// Almoxarifado / Estoque — itens, almoxarifados, movimentações, saldo
window.Estoque = {
  _tab: 'saldo',  // saldo | itens | almoxarifados | movimentacoes
  _itens: [],
  _almoxarifados: [],
  _movimentacoes: [],
  _saldo: { itens: [] },
  _busca: '',

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando estoque...</div>';
    try {
      await this._loadAll();
      this._draw();
    } catch (e) {
      app.innerHTML = `<div class="card"><p class="text-danger">Erro: ${escapeHtml(e.message)}</p></div>`;
    }
  },

  async _loadAll() {
    const safe = (p) => p.then(r => r.ok ? r.json() : { itens: [], almoxarifados: [], movimentacoes: [] }).catch(() => ({}));
    const [itens, almox, saldo, movs, contratos] = await Promise.all([
      safe(fetch('/api/estoque/itens')),
      safe(fetch('/api/estoque/almoxarifados')),
      safe(fetch('/api/estoque/saldo')),
      safe(fetch('/api/estoque/movimentacoes?limit=100')),
      Store.loadAll().catch(() => null),
    ]);
    this._itens = itens.itens || [];
    this._almoxarifados = almox.almoxarifados || [];
    this._saldo = saldo;
    this._movimentacoes = movs.movimentacoes || [];
  },

  _draw() {
    const app = document.getElementById('app');
    const fmt = (v) => Store.formatBRL(v);
    const totalItens = (this._saldo.itens || []).length;
    const valorTotal = (this._saldo.itens || []).reduce((s, i) => s + (i.totalValor || 0), 0);
    const abaixoMin = (this._saldo.itens || []).filter(i => i.abaixoMinimo).length;

    app.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">📦 Almoxarifado</h1>
          <p class="page-subtitle">Controle de estoque, movimentações e custo médio</p>
        </div>
        <button class="btn btn-primary" id="btnNovaMovimentacao">+ Nova movimentação</button>
      </div>

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:var(--sp-md);">
        <div class="card" style="padding:12px;border-left:3px solid #3b82f6;">
          <div class="text-muted font-sm">Itens cadastrados</div>
          <div style="font-size:22px;font-weight:800;">${this._itens.length}</div>
        </div>
        <div class="card" style="padding:12px;border-left:3px solid #10b981;">
          <div class="text-muted font-sm">Itens com saldo</div>
          <div style="font-size:22px;font-weight:800;">${totalItens}</div>
        </div>
        <div class="card" style="padding:12px;border-left:3px solid #8b5cf6;">
          <div class="text-muted font-sm">Valor em estoque</div>
          <div style="font-size:22px;font-weight:800;">${fmt(valorTotal)}</div>
        </div>
        <div class="card" style="padding:12px;border-left:3px solid ${abaixoMin > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
          <div class="text-muted font-sm">Abaixo do mínimo</div>
          <div style="font-size:22px;font-weight:800;color:${abaixoMin > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${abaixoMin}</div>
        </div>
        <div class="card" style="padding:12px;border-left:3px solid #f59e0b;">
          <div class="text-muted font-sm">Almoxarifados ativos</div>
          <div style="font-size:22px;font-weight:800;">${this._almoxarifados.length}</div>
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:2px;margin-bottom:var(--sp-md);border-bottom:1px solid var(--color-border);">
        ${[
          { k: 'saldo',         l: '📊 Saldo Atual' },
          { k: 'itens',         l: '🏷️ Itens' },
          { k: 'almoxarifados', l: '🏬 Almoxarifados' },
          { k: 'movimentacoes', l: '🔁 Movimentações' },
        ].map(t => `
          <button class="btn-tab-est" data-tab="${t.k}" style="padding:10px 16px;background:${this._tab === t.k ? 'var(--color-primary)' : 'transparent'};color:${this._tab === t.k ? '#fff' : 'var(--color-text)'};border:none;border-radius:6px 6px 0 0;cursor:pointer;font-weight:${this._tab === t.k ? '700' : '500'};">${t.l}</button>
        `).join('')}
      </div>

      <div id="estoqueConteudo">
        ${this._tab === 'saldo'         ? this._renderSaldo() : ''}
        ${this._tab === 'itens'         ? this._renderItens() : ''}
        ${this._tab === 'almoxarifados' ? this._renderAlmoxarifados() : ''}
        ${this._tab === 'movimentacoes' ? this._renderMovimentacoes() : ''}
      </div>
    `;

    document.querySelectorAll('.btn-tab-est').forEach(b => {
      b.addEventListener('click', () => { this._tab = b.dataset.tab; this._draw(); });
    });
    document.getElementById('btnNovaMovimentacao').addEventListener('click', () => this._showModalMovimentacao());
    this._attachTabListeners();
  },

  _attachTabListeners() {
    if (this._tab === 'itens') {
      document.getElementById('btnNovoItem')?.addEventListener('click', () => this._showModalItem());
      document.querySelectorAll('.btn-edit-item').forEach(b => b.addEventListener('click', () => {
        const item = this._itens.find(x => x.id === b.dataset.id);
        if (item) this._showModalItem(item);
      }));
      document.querySelectorAll('.btn-del-item').forEach(b => b.addEventListener('click', async () => {
        if (!confirm(`Inativar item "${b.dataset.nome}"? Histórico de movimentações será preservado.`)) return;
        try {
          const r = await fetch(`/api/estoque/itens/${b.dataset.id}`, { method: 'DELETE' });
          if (!r.ok) throw new Error(await r.text());
          window.showToast('Item inativado', 'success');
          await this._loadAll(); this._draw();
        } catch (e) { window.showToast(e.message, 'error'); }
      }));
    }
    if (this._tab === 'almoxarifados') {
      document.getElementById('btnNovoAlmox')?.addEventListener('click', () => this._showModalAlmoxarifado());
      document.querySelectorAll('.btn-edit-almox').forEach(b => b.addEventListener('click', () => {
        const a = this._almoxarifados.find(x => x.id === b.dataset.id);
        if (a) this._showModalAlmoxarifado(a);
      }));
      document.querySelectorAll('.btn-del-almox').forEach(b => b.addEventListener('click', async () => {
        if (!confirm(`Inativar almoxarifado "${b.dataset.nome}"?`)) return;
        try {
          const r = await fetch(`/api/estoque/almoxarifados/${b.dataset.id}`, { method: 'DELETE' });
          if (!r.ok) throw new Error(await r.text());
          window.showToast('Almoxarifado inativado', 'success');
          await this._loadAll(); this._draw();
        } catch (e) { window.showToast(e.message, 'error'); }
      }));
    }
    if (this._tab === 'movimentacoes') {
      document.querySelectorAll('.btn-del-mov').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Reverter esta movimentação? O saldo será ajustado de volta.')) return;
        try {
          const r = await fetch(`/api/estoque/movimentacoes/${b.dataset.id}`, { method: 'DELETE' });
          if (!r.ok) throw new Error(await r.text());
          window.showToast('Movimentação revertida', 'success');
          await this._loadAll(); this._draw();
        } catch (e) { window.showToast(e.message, 'error'); }
      }));
    }
  },

  _renderSaldo() {
    const itens = this._saldo.itens || [];
    if (itens.length === 0) {
      return `<div class="card" style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
        Nenhum item com saldo. Cadastre itens e faça uma entrada de estoque.</div>`;
    }
    const fmt = (v) => Store.formatBRL(v);
    const filtro = this._busca.toLowerCase();
    const filtrados = filtro
      ? itens.filter(i => (i.descricao || '').toLowerCase().includes(filtro) || (i.codigo || '').toLowerCase().includes(filtro))
      : itens;

    return `
      <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-md);">
        <input class="form-control" id="inputBuscaSaldo" placeholder="🔎 Buscar item..." value="${escapeHtml(this._busca)}">
      </div>
      <div class="card" style="padding:0;overflow:hidden;">
        <div style="overflow-x:auto;">
          <table class="table" style="margin:0;">
            <thead>
              <tr>
                <th>Item</th>
                <th>Categoria</th>
                <th style="text-align:right;">Saldo total</th>
                <th style="text-align:right;">Mínimo</th>
                <th style="text-align:right;">Custo médio</th>
                <th style="text-align:right;">Valor total</th>
                <th>Detalhe por almox.</th>
              </tr>
            </thead>
            <tbody>
              ${filtrados.map(i => `
                <tr style="background:${i.abaixoMinimo ? 'rgba(220,38,38,.06)' : 'transparent'};">
                  <td>
                    <strong>${escapeHtml(i.descricao || '')}</strong>
                    ${i.codigo ? `<div class="text-muted font-sm">cod. ${escapeHtml(i.codigo)}</div>` : ''}
                  </td>
                  <td>${escapeHtml(i.categoria || '—')}</td>
                  <td style="text-align:right;font-weight:700;color:${i.abaixoMinimo ? 'var(--color-danger)' : 'var(--color-text)'};">
                    ${i.totalQtd.toFixed(2)} ${escapeHtml(i.unidade || '')}
                    ${i.abaixoMinimo ? '<div style="font-size:11px;color:var(--color-danger);">⚠ abaixo do mín.</div>' : ''}
                  </td>
                  <td style="text-align:right;">${i.estoqueMinimo.toFixed(2)}</td>
                  <td style="text-align:right;">${fmt(i.custoMedio)}</td>
                  <td style="text-align:right;font-weight:600;">${fmt(i.totalValor)}</td>
                  <td style="font-size:13px;">
                    ${i.porAlmox.map(a => `<div>${escapeHtml(a.almoxNome)}: <strong>${a.quantidade.toFixed(2)}</strong></div>`).join('')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <script>
        document.getElementById('inputBuscaSaldo')?.addEventListener('input', (e) => {
          window.Estoque._busca = e.target.value;
          window.Estoque._draw();
          const inp = document.getElementById('inputBuscaSaldo');
          if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
        });
      </script>
    `;
  },

  _renderItens() {
    return `
      <div style="display:flex;justify-content:flex-end;margin-bottom:var(--sp-md);">
        <button class="btn btn-primary" id="btnNovoItem">+ Novo item</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden;">
        <table class="table" style="margin:0;">
          <thead>
            <tr>
              <th>Código</th><th>Descrição</th><th>Categoria</th><th>Unidade</th>
              <th style="text-align:right;">Mínimo</th><th style="text-align:right;">Custo médio</th>
              <th style="text-align:center;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${this._itens.length === 0 ? `<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhum item cadastrado</td></tr>` : ''}
            ${this._itens.map(i => `
              <tr>
                <td><code>${escapeHtml(i.codigo || '—')}</code></td>
                <td><strong>${escapeHtml(i.descricao)}</strong></td>
                <td>${escapeHtml(i.categoria || '—')}</td>
                <td>${escapeHtml(i.unidade || '—')}</td>
                <td style="text-align:right;">${(parseFloat(i.estoqueMinimo) || 0).toFixed(2)}</td>
                <td style="text-align:right;">${Store.formatBRL(parseFloat(i.custoMedio) || 0)}</td>
                <td style="text-align:center;">
                  <button class="btn btn-sm btn-secondary btn-edit-item" data-id="${i.id}" title="Editar">✏️</button>
                  <button class="btn btn-sm btn-danger btn-del-item" data-id="${i.id}" data-nome="${escapeHtml(i.descricao)}" title="Inativar">🗑️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  _renderAlmoxarifados() {
    return `
      <div style="display:flex;justify-content:flex-end;margin-bottom:var(--sp-md);">
        <button class="btn btn-primary" id="btnNovoAlmox">+ Novo almoxarifado</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden;">
        <table class="table" style="margin:0;">
          <thead>
            <tr><th>Nome</th><th>Vínculo</th><th>Endereço</th><th style="text-align:center;">Ações</th></tr>
          </thead>
          <tbody>
            ${this._almoxarifados.length === 0 ? `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhum almoxarifado. Cadastre um para começar.</td></tr>` : ''}
            ${this._almoxarifados.map(a => `
              <tr>
                <td><strong>${escapeHtml(a.nome)}</strong></td>
                <td>${a.contractName ? `<span class="badge" style="background:rgba(59,130,246,.15);color:#3b82f6;">obra: ${escapeHtml(a.contractName)}</span>` : '<span class="text-muted">central</span>'}</td>
                <td>${escapeHtml(a.endereco || '—')}</td>
                <td style="text-align:center;">
                  <button class="btn btn-sm btn-secondary btn-edit-almox" data-id="${a.id}" title="Editar">✏️</button>
                  <button class="btn btn-sm btn-danger btn-del-almox" data-id="${a.id}" data-nome="${escapeHtml(a.nome)}" title="Inativar">🗑️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  _renderMovimentacoes() {
    const tipoCor = { entrada: '#10b981', saida: '#dc2626', transferencia: '#3b82f6', ajuste: '#f59e0b' };
    const tipoLbl = { entrada: '🟢 Entrada', saida: '🔴 Saída', transferencia: '🔵 Transferência', ajuste: '🟡 Ajuste' };

    return `
      <div class="card" style="padding:0;overflow:hidden;">
        <table class="table" style="margin:0;">
          <thead>
            <tr>
              <th>Data</th><th>Tipo</th><th>Item</th><th style="text-align:right;">Qtd</th>
              <th>Origem</th><th>Destino</th><th>Obra</th><th>Doc.</th>
              <th style="text-align:center;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${this._movimentacoes.length === 0 ? `<tr><td colspan="9" style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhuma movimentação ainda</td></tr>` : ''}
            ${this._movimentacoes.map(m => `
              <tr>
                <td>${new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td><span style="color:${tipoCor[m.tipo]};font-weight:700;font-size:13px;">${tipoLbl[m.tipo]}</span></td>
                <td>${escapeHtml(m.itemDesc || '—')}</td>
                <td style="text-align:right;font-weight:700;">${parseFloat(m.quantidade).toFixed(2)} ${escapeHtml(m.unidade || '')}</td>
                <td>${escapeHtml(m.origemNome || '—')}</td>
                <td>${escapeHtml(m.destinoNome || '—')}</td>
                <td>${escapeHtml(m.contractName || '—')}</td>
                <td>${escapeHtml(m.documento || '—')}</td>
                <td style="text-align:center;">
                  <button class="btn btn-sm btn-danger btn-del-mov" data-id="${m.id}" title="Reverter">↩️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  // ───── Modais ─────
  _showModalItem(item) {
    const editing = !!item;
    const html = `
      <div class="modal-overlay" id="modalItem">
        <div class="modal" style="width:560px;">
          <div class="modal-header">
            <h2 class="modal-title">${editing ? '✏️ Editar' : '+ Novo'} item</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formItem" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Código</label>
                <input class="form-control" name="codigo" value="${escapeHtml(item?.codigo || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Unidade</label>
                <input class="form-control" name="unidade" placeholder="pç, kg, m, l..." value="${escapeHtml(item?.unidade || '')}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input class="form-control" name="descricao" required value="${escapeHtml(item?.descricao || '')}">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Categoria</label>
                <input class="form-control" name="categoria" placeholder="Ex: EPI, ferramenta..." value="${escapeHtml(item?.categoria || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Estoque mínimo</label>
                <input class="form-control" type="number" step="0.01" name="estoqueMinimo" value="${item?.estoqueMinimo || 0}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Notas</label>
              <textarea class="form-control" name="notas" rows="2">${escapeHtml(item?.notas || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelItem">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveItem">${editing ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalItem');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelItem').addEventListener('click', close);

    document.getElementById('btnSaveItem').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formItem'));
      const data = Object.fromEntries(fd);
      if (!data.descricao?.trim()) { window.showToast('Descrição obrigatória', 'error'); return; }
      try {
        const url = editing ? `/api/estoque/itens/${item.id}` : `/api/estoque/itens`;
        const method = editing ? 'PUT' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!r.ok) throw new Error(await r.text());
        window.showToast(editing ? 'Item atualizado' : 'Item criado', 'success');
        close();
        await this._loadAll(); this._draw();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  _showModalAlmoxarifado(almox) {
    const editing = !!almox;
    const contracts = (Store.state.contracts || []).filter(c => c.status === 'ativo' || c.status === 'pausado');
    const html = `
      <div class="modal-overlay" id="modalAlmox">
        <div class="modal" style="width:520px;">
          <div class="modal-header">
            <h2 class="modal-title">${editing ? '✏️ Editar' : '+ Novo'} almoxarifado</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formAlmox" class="modal-content">
            <div class="form-group">
              <label class="form-label">Nome *</label>
              <input class="form-control" name="nome" required value="${escapeHtml(almox?.nome || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Vinculado a contrato (opcional)</label>
              <select class="form-control" name="contractId">
                <option value="">— Almoxarifado central —</option>
                ${contracts.map(c => `<option value="${c.id}" ${almox?.contractId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Endereço</label>
              <input class="form-control" name="endereco" value="${escapeHtml(almox?.endereco || '')}">
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelAlmox">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveAlmox">${editing ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalAlmox');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelAlmox').addEventListener('click', close);

    document.getElementById('btnSaveAlmox').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formAlmox'));
      const data = Object.fromEntries(fd);
      if (!data.nome?.trim()) { window.showToast('Nome obrigatório', 'error'); return; }
      try {
        const url = editing ? `/api/estoque/almoxarifados/${almox.id}` : `/api/estoque/almoxarifados`;
        const method = editing ? 'PUT' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!r.ok) throw new Error(await r.text());
        window.showToast(editing ? 'Almoxarifado atualizado' : 'Almoxarifado criado', 'success');
        close();
        await this._loadAll(); this._draw();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  _showModalMovimentacao() {
    if (this._itens.length === 0 || this._almoxarifados.length === 0) {
      window.showToast('Cadastre itens e almoxarifados antes de movimentar', 'error');
      return;
    }
    const contracts = (Store.state.contracts || []).filter(c => c.status === 'ativo' || c.status === 'pausado');
    const hoje = new Date().toISOString().split('T')[0];

    const html = `
      <div class="modal-overlay" id="modalMov">
        <div class="modal" style="width:600px;">
          <div class="modal-header">
            <h2 class="modal-title">+ Nova movimentação de estoque</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formMov" class="modal-content">
            <div class="form-group">
              <label class="form-label">Tipo *</label>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
                <label style="cursor:pointer;text-align:center;padding:10px;border:1px solid var(--color-border);border-radius:6px;">
                  <input type="radio" name="tipo" value="entrada" checked style="margin-right:4px;">🟢 Entrada
                </label>
                <label style="cursor:pointer;text-align:center;padding:10px;border:1px solid var(--color-border);border-radius:6px;">
                  <input type="radio" name="tipo" value="saida" style="margin-right:4px;">🔴 Saída
                </label>
                <label style="cursor:pointer;text-align:center;padding:10px;border:1px solid var(--color-border);border-radius:6px;">
                  <input type="radio" name="tipo" value="transferencia" style="margin-right:4px;">🔵 Transf.
                </label>
                <label style="cursor:pointer;text-align:center;padding:10px;border:1px solid var(--color-border);border-radius:6px;">
                  <input type="radio" name="tipo" value="ajuste" style="margin-right:4px;">🟡 Ajuste
                </label>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Item *</label>
                <select class="form-control" name="itemId" required>
                  <option value="">Selecione...</option>
                  ${this._itens.map(i => `<option value="${i.id}">${escapeHtml(i.descricao)}${i.unidade ? ' (' + escapeHtml(i.unidade) + ')' : ''}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Quantidade *</label>
                <input class="form-control" type="number" step="0.001" min="0.001" name="quantidade" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group" id="grpOrigem">
                <label class="form-label">Almoxarifado origem</label>
                <select class="form-control" name="almoxarifadoOrigemId">
                  <option value="">—</option>
                  ${this._almoxarifados.map(a => `<option value="${a.id}">${escapeHtml(a.nome)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" id="grpDestino">
                <label class="form-label">Almoxarifado destino</label>
                <select class="form-control" name="almoxarifadoDestinoId">
                  <option value="">—</option>
                  ${this._almoxarifados.map(a => `<option value="${a.id}">${escapeHtml(a.nome)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Custo unitário (R$)</label>
                <input class="form-control" type="number" step="0.01" min="0" name="custoUnit" placeholder="Atualiza custo médio em entradas">
              </div>
              <div class="form-group">
                <label class="form-label">Data</label>
                <input class="form-control" type="date" name="data" value="${hoje}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Vincular a obra (saída/transf.)</label>
                <select class="form-control" name="contractId">
                  <option value="">—</option>
                  ${contracts.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Documento (NF, OC, RM)</label>
                <input class="form-control" name="documento">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="notas" rows="2"></textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelMov">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveMov">Registrar movimentação</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalMov');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelMov').addEventListener('click', close);

    // Mostra/esconde campos conforme tipo
    const updateCampos = () => {
      const tipo = document.querySelector('input[name="tipo"]:checked').value;
      const grpOrig = document.getElementById('grpOrigem');
      const grpDest = document.getElementById('grpDestino');
      grpOrig.style.opacity = (tipo === 'entrada') ? '0.4' : '1';
      grpDest.style.opacity = (tipo === 'saida')   ? '0.4' : '1';
    };
    document.querySelectorAll('input[name="tipo"]').forEach(r => r.addEventListener('change', updateCampos));
    updateCampos();

    document.getElementById('btnSaveMov').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formMov'));
      const data = Object.fromEntries(fd);
      if (!data.itemId || !data.quantidade) { window.showToast('Item e quantidade obrigatórios', 'error'); return; }
      try {
        const r = await fetch('/api/estoque/movimentacoes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        });
        if (!r.ok) throw new Error(await r.text());
        window.showToast('Movimentação registrada', 'success');
        close();
        await this._loadAll(); this._draw();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },
};
