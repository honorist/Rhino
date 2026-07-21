/**
 * View: Mapa de Cotações + Pedido de Compra (#/mapa-cotacoes)
 *
 * Fluxo de compras GLOBAL: cotar vários fornecedores por item (a MATRIZ do mapa),
 * comparar (menor preço por item, total por fornecedor, economia) e emitir um
 * pedido de compra (PO) do vencedor.
 *
 * Duas telas: a LISTA de cotações (+ pedidos emitidos) e o DETALHE de uma cotação
 * (a matriz item×fornecedor editável, com destaque do menor preço por linha).
 * A fonte de verdade da análise (mapa, vencedores, totais, economia) mora no
 * servidor — cada mutação de item/preço devolve o envelope recalculado.
 *
 * Busca dados direto via fetch (não depende do Store) para ser autocontida.
 */
window.MapaCotacoes = {
  busca: '',
  _cotacoes: [],
  _ordens: [],
  _fornecedores: [],
  _sel: null,          // envelope de detalhe da cotação aberta
  _pendingForn: [],    // colunas de fornecedor adicionadas mas ainda sem preço

  STATUS_COT: [
    { v: 'aberta', l: 'Aberta' },
    { v: 'em_analise', l: 'Em análise' },
    { v: 'fechada', l: 'Fechada' },
    { v: 'cancelada', l: 'Cancelada' },
  ],
  STATUS_ORD: [
    { v: 'emitida', l: 'Emitida' },
    { v: 'recebida', l: 'Recebida' },
    { v: 'cancelada', l: 'Cancelada' },
  ],

  _fmtBRL(n) {
    return 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
  },
  _fmtNum(n) {
    const x = Number(n) || 0;
    return (Number.isInteger(x) ? String(x) : x.toFixed(2)).replace('.', ',');
  },
  _num(v) {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  },
  _fornNome(id) {
    const f = this._fornecedores.find((x) => x.id === id);
    return f ? (f.nome || f.id) : (id || '—');
  },
  _labelCot(v) {
    const s = this.STATUS_COT.find((x) => x.v === v);
    return s ? s.l : (v || '—');
  },
  _labelOrd(v) {
    const s = this.STATUS_ORD.find((x) => x.v === v);
    return s ? s.l : (v || '—');
  },
  _badgeCot(v) {
    const map = {
      aberta: ['#dbeafe', '#1e40af'],
      em_analise: ['#fef3c7', '#b45309'],
      fechada: ['#d1fae5', '#047857'],
      cancelada: ['#fee2e2', '#b91c1c'],
    };
    const [bg, fg] = map[v] || ['var(--color-surface-2)', 'var(--color-text-muted)'];
    return `<span class="badge" style="background:${bg};color:${fg};font-size:11px;">${escapeHtml(this._labelCot(v))}</span>`;
  },
  _badgeOrd(v) {
    const map = {
      emitida: ['#dbeafe', '#1e40af'],
      recebida: ['#d1fae5', '#047857'],
      cancelada: ['#fee2e2', '#b91c1c'],
    };
    const [bg, fg] = map[v] || ['var(--color-surface-2)', 'var(--color-text-muted)'];
    return `<span class="badge" style="background:${bg};color:${fg};font-size:11px;">${escapeHtml(this._labelOrd(v))}</span>`;
  },

  // ═══════════ Tela: LISTA ═══════════
  async render() {
    this._sel = null;
    this._pendingForn = [];
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando cotações...</div>';
    try {
      const [rc, ro, rf] = await Promise.all([
        fetch('/api/cotacoes'),
        fetch('/api/ordens-compra'),
        fetch('/api/fornecedores'),
      ]);
      if (!rc.ok) throw new Error('HTTP ' + rc.status);
      this._cotacoes = await rc.json();
      this._ordens = ro.ok ? await ro.json() : [];
      this._fornecedores = rf.ok ? await rf.json() : [];
      if (!Array.isArray(this._fornecedores)) this._fornecedores = [];

      const termo = (this.busca || '').toLowerCase().trim();
      let lista = this._cotacoes;
      if (termo) {
        lista = lista.filter((c) => (c.descricao || '').toLowerCase().includes(termo));
      }
      const total = this._cotacoes.length;

      app.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Mapa de Cotações</h1>
            <p class="page-subtitle">${total} cotaç${total !== 1 ? 'ões' : 'ão'} · cote fornecedores, compare e emita o pedido de compra</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-primary btn-lg" id="btnNovaCot">+ Nova Cotação</button>
          </div>
        </div>

        <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);">
          <input class="form-control" id="inputBuscaCot" placeholder="🔍 Buscar cotação por descrição..." value="${escapeHtml(this.busca)}">
        </div>

        ${this._renderListaCotacoes(lista)}

        <div class="page-header" style="margin-top:var(--sp-xl);">
          <div>
            <h2 class="page-title" style="font-size:20px;">Pedidos de compra emitidos</h2>
            <p class="page-subtitle">${this._ordens.length} pedido${this._ordens.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        ${this._renderListaOrdens()}
      `;
      this._attachListEvents();
    } catch (e) {
      console.error('[MapaCotacoes] erro:', e);
      app.innerHTML = `<div class="error-banner">Erro ao carregar cotações: ${escapeHtml(e.message)}</div>`;
    }
  },

  _renderListaCotacoes(lista) {
    if (!lista.length) {
      return `<div class="card" style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
        <div style="font-size:44px;margin-bottom:8px;opacity:.6;">🧾</div>
        <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhuma cotação</div>
        <div style="font-size:13px;">Crie uma cotação, adicione itens e cote fornecedores.</div>
      </div>`;
    }
    return `<div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Descrição</th>
              <th scope="col" style="width:120px;text-align:center;">Status</th>
              <th scope="col" style="width:120px;">Abertura</th>
              <th scope="col" style="width:170px;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map((c) => `
              <tr>
                <td><strong>${escapeHtml(c.descricao || '—')}</strong></td>
                <td style="text-align:center;">${this._badgeCot(c.status)}</td>
                <td>${this._fmtData(c.dataAbertura)}</td>
                <td>
                  <div class="actions-cell">
                    <button type="button" class="action-link btn-abrir-cot" data-id="${c.id}">Abrir mapa</button>
                    <button type="button" class="action-link danger btn-excluir-cot" data-id="${c.id}">Excluir</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  },

  _renderListaOrdens() {
    if (!this._ordens.length) {
      return `<div class="card" style="padding:var(--sp-lg);text-align:center;color:var(--color-text-muted);">Nenhum pedido de compra emitido ainda.</div>`;
    }
    return `<div class="card" style="padding:0;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col" style="width:120px;">Número</th>
              <th scope="col">Fornecedor</th>
              <th scope="col" style="width:70px;text-align:center;">Itens</th>
              <th scope="col" style="width:140px;text-align:right;">Valor total</th>
              <th scope="col" style="width:110px;text-align:center;">Status</th>
              <th scope="col" style="width:120px;">Emissão</th>
              <th scope="col" style="width:210px;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${this._ordens.map((o) => `
              <tr>
                <td><strong>${escapeHtml(o.numero || '—')}</strong></td>
                <td>${escapeHtml(this._fornNome(o.fornecedorId))}</td>
                <td style="text-align:center;">${Array.isArray(o.itens) ? o.itens.length : 0}</td>
                <td style="text-align:right;font-weight:600;">${this._fmtBRL(o.valorTotal)}</td>
                <td style="text-align:center;">${this._badgeOrd(o.status)}</td>
                <td>${this._fmtData(o.dataEmissao)}</td>
                <td>
                  <div class="actions-cell">
                    ${o.status === 'emitida' ? `<button type="button" class="action-link btn-ord-status" data-id="${o.id}" data-st="recebida">Marcar recebida</button>` : ''}
                    ${o.status !== 'cancelada' ? `<button type="button" class="action-link btn-ord-status" data-id="${o.id}" data-st="cancelada">Cancelar</button>` : ''}
                    <button type="button" class="action-link danger btn-ord-del" data-id="${o.id}">Excluir</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  },

  _fmtData(s) {
    if (!s) return '—';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : escapeHtml(String(s));
  },

  _attachListEvents() {
    const btnNova = document.getElementById('btnNovaCot');
    if (btnNova) btnNova.addEventListener('click', () => this._showModalCotacao(null));

    const inputBusca = document.getElementById('inputBuscaCot');
    if (inputBusca) {
      let timer;
      inputBusca.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { this.busca = inputBusca.value; this.render(); }, 250);
      });
    }

    document.querySelectorAll('.btn-abrir-cot').forEach((b) => {
      b.addEventListener('click', () => this._openCotacao(b.dataset.id));
    });
    document.querySelectorAll('.btn-excluir-cot').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Excluir esta cotação e todos os seus itens/preços?')) return;
        try {
          const res = await fetch('/api/cotacoes/' + b.dataset.id, { method: 'DELETE' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          if (window.showToast) showToast('Cotação excluída', 'success');
          this.render();
        } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
      });
    });

    document.querySelectorAll('.btn-ord-status').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/ordens-compra/' + b.dataset.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: b.dataset.st }),
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          if (window.showToast) showToast('Pedido atualizado', 'success');
          this.render();
        } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
      });
    });
    document.querySelectorAll('.btn-ord-del').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Excluir este pedido de compra?')) return;
        try {
          const res = await fetch('/api/ordens-compra/' + b.dataset.id, { method: 'DELETE' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          if (window.showToast) showToast('Pedido excluído', 'success');
          this.render();
        } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
      });
    });
  },

  // ═══════════ Tela: DETALHE (matriz) ═══════════
  async _openCotacao(id) {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando mapa...</div>';
    try {
      if (!this._fornecedores.length) {
        const rf = await fetch('/api/fornecedores');
        this._fornecedores = rf.ok ? await rf.json() : [];
        if (!Array.isArray(this._fornecedores)) this._fornecedores = [];
      }
      const res = await fetch('/api/cotacoes/' + id);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this._sel = await res.json();
      this._pendingForn = [];
      this._renderDetalhe();
    } catch (e) {
      app.innerHTML = `<div class="error-banner">Erro ao abrir cotação: ${escapeHtml(e.message)}</div>`;
    }
  },

  // Colunas da matriz = fornecedores com preço + os adicionados (pendentes).
  _colunas() {
    const cols = (this._sel.mapa.fornecedorIds || []).slice();
    for (const fid of this._pendingForn) if (!cols.includes(fid)) cols.push(fid);
    return cols;
  },

  _renderDetalhe() {
    const app = document.getElementById('app');
    const d = this._sel;
    const cot = d.cotacao || {};
    const itens = d.itens || [];
    const colunas = this._colunas();
    const linhasMapa = d.mapa.linhas || [];
    const melhores = d.melhores || [];
    const totais = d.totais || [];
    const economia = d.economia || { itens: [], total: 0 };

    const vencedorPorItem = {};
    melhores.forEach((m) => { vencedorPorItem[m.itemId] = m; });
    const totalPorForn = {};
    totais.forEach((t) => { totalPorForn[t.fornecedorId] = t; });
    const melhorFornId = totais.length ? totais[0].fornecedorId : null;

    // KPIs
    const kpis = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:var(--sp-md);">
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #3b82f6;">
          <div class="text-muted font-sm">Itens</div>
          <div style="font-size:18px;font-weight:700;">${itens.length}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #8b5cf6;">
          <div class="text-muted font-sm">Fornecedores cotados</div>
          <div style="font-size:18px;font-weight:700;">${(d.mapa.fornecedorIds || []).length}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #10b981;">
          <div class="text-muted font-sm" title="Vencedor global: menor total">Melhor fornecedor</div>
          <div style="font-size:16px;font-weight:700;">${melhorFornId ? escapeHtml(this._fornNome(melhorFornId)) : '—'}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #f59e0b;">
          <div class="text-muted font-sm" title="Soma de (média − menor) × quantidade por item">Economia estimada</div>
          <div style="font-size:18px;font-weight:700;">${this._fmtBRL(economia.total)}</div>
        </div>
      </div>`;

    // Cabeçalho da matriz
    const thForn = colunas.map((fid) => {
      const isBest = fid === melhorFornId;
      return `<th scope="col" style="text-align:right;white-space:nowrap;${isBest ? 'background:rgba(16,185,129,.12);' : ''}">
        ${escapeHtml(this._fornNome(fid))}${isBest ? ' 🏆' : ''}
      </th>`;
    }).join('');

    // Linhas (itens)
    const corpo = linhasMapa.length === 0
      ? `<tr><td colspan="${colunas.length + 3}" class="text-muted" style="text-align:center;padding:var(--sp-lg);">Nenhum item. Clique em "+ Item" para começar.</td></tr>`
      : linhasMapa.map((lin) => {
          const venc = vencedorPorItem[lin.itemId] || {};
          const celulas = colunas.map((fid) => {
            const cel = lin.celulas[fid];
            const preco = cel ? cel.precoUnit : '';
            const isWin = venc.fornecedorId && venc.fornecedorId === fid;
            return `<td style="text-align:right;${isWin ? 'background:rgba(16,185,129,.14);font-weight:700;' : ''}">
              <input type="text" inputmode="decimal" class="form-control cot-preco" data-item="${escapeHtml(lin.itemId)}" data-forn="${escapeHtml(fid)}"
                value="${preco === '' ? '' : escapeHtml(String(preco))}" placeholder="—"
                style="text-align:right;padding:4px 6px;max-width:110px;">
            </td>`;
          }).join('');
          const vencTxt = venc.fornecedorId
            ? `${escapeHtml(this._fornNome(venc.fornecedorId))} · ${this._fmtBRL(venc.precoUnit)}`
            : '<span class="text-muted">—</span>';
          return `<tr>
            <td>
              <strong>${escapeHtml(lin.descricao || '—')}</strong>
              <div class="text-muted font-sm">${this._fmtNum(lin.quantidade)} ${escapeHtml(lin.unidade || 'un')}</div>
            </td>
            ${celulas}
            <td style="white-space:nowrap;">${vencTxt}</td>
            <td style="text-align:center;white-space:nowrap;">
              <button class="action-link cot-item-edit" data-id="${escapeHtml(lin.itemId)}" title="Editar item">✎</button>
              <button class="action-link danger cot-item-del" data-id="${escapeHtml(lin.itemId)}" title="Excluir item">×</button>
            </td>
          </tr>`;
        }).join('');

    // Rodapé: total por fornecedor
    const tfoot = colunas.length && linhasMapa.length
      ? `<tfoot>
          <tr style="border-top:2px solid var(--color-border);">
            <td style="font-weight:700;">Total (itens cotados)</td>
            ${colunas.map((fid) => {
              const t = totalPorForn[fid];
              const isBest = fid === melhorFornId;
              return `<td style="text-align:right;font-weight:700;${isBest ? 'background:rgba(16,185,129,.12);' : ''}">${t ? this._fmtBRL(t.total) : '—'}</td>`;
            }).join('')}
            <td colspan="2"></td>
          </tr>
        </tfoot>`
      : '';

    app.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm" id="btnVoltarCot" style="margin-bottom:8px;">← Voltar</button>
          <h1 class="page-title">${escapeHtml(cot.descricao || 'Cotação')}</h1>
          <p class="page-subtitle">Abertura ${this._fmtData(cot.dataAbertura)} · ${escapeHtml(this._labelCot(cot.status))}</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select id="cotStatusSel" class="form-control" style="max-width:180px;">
            ${this.STATUS_COT.map((s) => `<option value="${s.v}" ${cot.status === s.v ? 'selected' : ''}>${escapeHtml(s.l)}</option>`).join('')}
          </select>
          <button class="btn btn-secondary" id="btnEditCotHdr">Editar</button>
          <button class="btn btn-primary" id="btnGerarOrdem">Gerar pedido de compra</button>
        </div>
      </div>

      ${kpis}

      <div style="display:flex;gap:8px;margin-bottom:var(--sp-md);flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" id="btnAddItem">+ Item</button>
        <button class="btn btn-secondary btn-sm" id="btnAddForn">+ Fornecedor (coluna)</button>
      </div>

      <div class="card" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Item</th>
                ${thForn}
                <th scope="col" style="width:180px;">Vencedor</th>
                <th scope="col" style="width:80px;text-align:center;">Ações</th>
              </tr>
            </thead>
            <tbody>${corpo}</tbody>
            ${tfoot}
          </table>
        </div>
      </div>
    `;
    this._attachDetalheEvents();
  },

  _attachDetalheEvents() {
    const d = this._sel;
    const cot = d.cotacao || {};

    document.getElementById('btnVoltarCot').addEventListener('click', () => this.render());
    document.getElementById('btnEditCotHdr').addEventListener('click', () => this._showModalCotacao(cot));
    document.getElementById('btnAddItem').addEventListener('click', () => this._showModalItem(null));
    document.getElementById('btnAddForn').addEventListener('click', () => this._showModalAddForn());
    document.getElementById('btnGerarOrdem').addEventListener('click', () => this._showModalGerarOrdem());

    const stSel = document.getElementById('cotStatusSel');
    if (stSel) {
      stSel.addEventListener('change', async () => {
        try {
          const res = await fetch('/api/cotacoes/' + cot.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: stSel.value }),
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this._sel.cotacao = await res.json();
          if (window.showToast) showToast('Status atualizado', 'success');
          this._renderDetalhe();
        } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
      });
    }

    // Edição de preço (célula da matriz) → upsert.
    document.querySelectorAll('.cot-preco').forEach((inp) => {
      inp.addEventListener('change', async () => {
        const itemId = inp.dataset.item;
        const fornecedorId = inp.dataset.forn;
        try {
          const res = await fetch('/api/cotacoes/' + cot.id + '/precos', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId, fornecedorId, precoUnit: this._num(inp.value) }),
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this._sel = await res.json();
          this._renderDetalhe();
        } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
      });
    });

    document.querySelectorAll('.cot-item-edit').forEach((b) => {
      b.addEventListener('click', () => {
        const it = (this._sel.itens || []).find((x) => x.id === b.dataset.id);
        if (it) this._showModalItem(it);
      });
    });
    document.querySelectorAll('.cot-item-del').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Excluir este item e seus preços?')) return;
        try {
          const res = await fetch('/api/cotacoes/' + cot.id + '/itens/' + b.dataset.id, { method: 'DELETE' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this._sel = await res.json();
          if (window.showToast) showToast('Item excluído', 'success');
          this._renderDetalhe();
        } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
      });
    });
  },

  // ─── Modais ───
  _closeModal(id) { const el = document.getElementById(id); if (el) el.remove(); },

  _showModalCotacao(cot) {
    const isEdit = !!(cot && cot.id);
    const c = cot || { descricao: '', status: 'aberta', observacoes: '', dataAbertura: '' };
    const html = `
      <div class="modal-overlay" id="modalCot" style="z-index:1100;">
        <div class="modal" style="width:560px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">${isEdit ? 'Editar Cotação' : 'Nova Cotação'}</h2>
            <button class="modal-close" id="btnCloseCot">✕</button>
          </div>
          <form id="formCot" class="modal-content">
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input type="text" class="form-control" name="descricao" required value="${escapeHtml(c.descricao || '')}" placeholder="Ex: Materiais elétricos - Obra Norte">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group">
                <label class="form-label">Data de abertura</label>
                <input type="date" class="form-control" name="dataAbertura" value="${escapeHtml(c.dataAbertura ? String(c.dataAbertura).slice(0, 10) : '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-control" name="status">
                  ${this.STATUS_COT.map((s) => `<option value="${s.v}" ${c.status === s.v ? 'selected' : ''}>${escapeHtml(s.l)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" rows="2">${escapeHtml(c.observacoes || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelCot">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveCot">${isEdit ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('btnCloseCot').addEventListener('click', () => this._closeModal('modalCot'));
    document.getElementById('btnCancelCot').addEventListener('click', () => this._closeModal('modalCot'));
    document.getElementById('btnSaveCot').addEventListener('click', async () => {
      const form = document.getElementById('formCot');
      const descricao = form.descricao.value.trim();
      if (!descricao) { if (window.showToast) showToast('Descrição é obrigatória', 'warning'); return; }
      const data = {
        descricao,
        status: form.status.value,
        dataAbertura: form.dataAbertura.value || null,
        observacoes: form.observacoes.value.trim(),
      };
      try {
        const url = isEdit ? '/api/cotacoes/' + cot.id : '/api/cotacoes';
        const res = await fetch(url, {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'HTTP ' + res.status); }
        const saved = await res.json();
        this._closeModal('modalCot');
        if (window.showToast) showToast(isEdit ? 'Cotação atualizada' : 'Cotação criada', 'success');
        if (isEdit && this._sel) { this._sel.cotacao = saved; this._renderDetalhe(); }
        else if (!isEdit) { this._openCotacao(saved.id); }
        else { this.render(); }
      } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
    });
  },

  _showModalItem(item) {
    const isEdit = !!(item && item.id);
    const it = item || { descricao: '', unidade: 'un', quantidade: '' };
    const cotId = this._sel.cotacao.id;
    const html = `
      <div class="modal-overlay" id="modalItem" style="z-index:1100;">
        <div class="modal" style="width:520px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">${isEdit ? 'Editar item' : 'Novo item'}</h2>
            <button class="modal-close" id="btnCloseItem">✕</button>
          </div>
          <form id="formItem" class="modal-content">
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input type="text" class="form-control" name="descricao" required value="${escapeHtml(it.descricao || '')}" placeholder="Ex: Cabo flexível 2,5mm²">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group">
                <label class="form-label">Unidade</label>
                <input type="text" class="form-control" name="unidade" value="${escapeHtml(it.unidade || 'un')}" placeholder="m">
              </div>
              <div class="form-group">
                <label class="form-label">Quantidade</label>
                <input type="text" inputmode="decimal" class="form-control" name="quantidade" value="${escapeHtml(String(it.quantidade == null ? '' : it.quantidade))}" style="text-align:right;">
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelItem">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveItem">${isEdit ? 'Salvar' : 'Adicionar'}</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('btnCloseItem').addEventListener('click', () => this._closeModal('modalItem'));
    document.getElementById('btnCancelItem').addEventListener('click', () => this._closeModal('modalItem'));
    document.getElementById('btnSaveItem').addEventListener('click', async () => {
      const form = document.getElementById('formItem');
      const descricao = form.descricao.value.trim();
      if (!descricao) { if (window.showToast) showToast('Descrição é obrigatória', 'warning'); return; }
      const data = {
        descricao,
        unidade: form.unidade.value.trim() || 'un',
        quantidade: this._num(form.quantidade.value),
      };
      try {
        const url = isEdit ? `/api/cotacoes/${cotId}/itens/${item.id}` : `/api/cotacoes/${cotId}/itens`;
        const res = await fetch(url, {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'HTTP ' + res.status); }
        this._sel = await res.json();
        this._closeModal('modalItem');
        if (window.showToast) showToast(isEdit ? 'Item atualizado' : 'Item adicionado', 'success');
        this._renderDetalhe();
      } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
    });
  },

  _showModalAddForn() {
    const jaColunas = this._colunas();
    const disponiveis = this._fornecedores.filter((f) => !jaColunas.includes(f.id));
    if (!disponiveis.length) {
      if (window.showToast) showToast('Todos os fornecedores já estão no mapa (ou nenhum cadastrado)', 'warning');
      return;
    }
    const html = `
      <div class="modal-overlay" id="modalAddForn" style="z-index:1100;">
        <div class="modal" style="width:460px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">Adicionar fornecedor à matriz</h2>
            <button class="modal-close" id="btnCloseAddForn">✕</button>
          </div>
          <div class="modal-content">
            <div class="form-group">
              <label class="form-label">Fornecedor</label>
              <select class="form-control" id="selAddForn">
                ${disponiveis.map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.nome || f.id)}</option>`).join('')}
              </select>
            </div>
            <p class="text-muted font-sm">A coluna aparece vazia; digite os preços para salvá-la.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelAddForn">Cancelar</button>
            <button class="btn btn-primary" id="btnConfirmAddForn">Adicionar coluna</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('btnCloseAddForn').addEventListener('click', () => this._closeModal('modalAddForn'));
    document.getElementById('btnCancelAddForn').addEventListener('click', () => this._closeModal('modalAddForn'));
    document.getElementById('btnConfirmAddForn').addEventListener('click', () => {
      const fid = document.getElementById('selAddForn').value;
      if (fid && !this._pendingForn.includes(fid)) this._pendingForn.push(fid);
      this._closeModal('modalAddForn');
      this._renderDetalhe();
    });
  },

  _showModalGerarOrdem() {
    const totais = this._sel.totais || [];
    if (!totais.length) {
      if (window.showToast) showToast('Cote ao menos um fornecedor antes de gerar o pedido', 'warning');
      return;
    }
    const cotId = this._sel.cotacao.id;
    const opts = totais.map((t, i) =>
      `<option value="${escapeHtml(t.fornecedorId)}" ${i === 0 ? 'selected' : ''}>${escapeHtml(this._fornNome(t.fornecedorId))} · ${this._fmtBRL(t.total)} (${t.itensCotados} ${t.itensCotados === 1 ? 'item' : 'itens'})</option>`
    ).join('');
    const html = `
      <div class="modal-overlay" id="modalGerar" style="z-index:1100;">
        <div class="modal" style="width:520px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">Gerar pedido de compra</h2>
            <button class="modal-close" id="btnCloseGerar">✕</button>
          </div>
          <div class="modal-content">
            <div class="form-group">
              <label class="form-label">Fornecedor (o 1º é o vencedor global)</label>
              <select class="form-control" id="selGerarForn">${opts}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Número do pedido (opcional)</label>
              <input type="text" class="form-control" id="inpGerarNum" placeholder="deixe em branco para gerar automático">
            </div>
            <p class="text-muted font-sm">O pedido inclui só os itens cotados por esse fornecedor, com os preços da cotação. A cotação será marcada como fechada.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelGerar">Cancelar</button>
            <button class="btn btn-primary" id="btnConfirmGerar">Emitir pedido</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('btnCloseGerar').addEventListener('click', () => this._closeModal('modalGerar'));
    document.getElementById('btnCancelGerar').addEventListener('click', () => this._closeModal('modalGerar'));
    document.getElementById('btnConfirmGerar').addEventListener('click', async () => {
      const fornecedorId = document.getElementById('selGerarForn').value;
      const numero = document.getElementById('inpGerarNum').value.trim();
      try {
        const res = await fetch('/api/cotacoes/' + cotId + '/gerar-ordem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fornecedorId, numero: numero || undefined }),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'HTTP ' + res.status); }
        const out = await res.json();
        this._closeModal('modalGerar');
        if (window.showToast) showToast('Pedido ' + ((out.ordem && out.ordem.numero) || '') + ' emitido', 'success');
        this.render();
      } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
    });
  },
};
