/**
 * View: Catálogo de Composições de custo unitário (#/composicoes)
 *
 * Catálogo GLOBAL (não por obra) de composições de preço unitário — a "receita"
 * de insumos (mão de obra / material / equipamento) de cada serviço, com
 * coeficiente e valor unitário. O custo unitário (Σ coef × valorUnit) é calculado
 * AO VIVO no modal enquanto o usuário digita, e também é devolvido pelo backend
 * (lib/composicao.js) na resposta de cada mutação.
 *
 * Busca dados direto via fetch (não depende do Store) para ser autocontida.
 */
window.Composicoes = {
  busca: '',
  _lista: [],
  _editItens: [],

  TIPOS: [
    { v: 'mo', l: 'Mão de obra' },
    { v: 'material', l: 'Material' },
    { v: 'equipamento', l: 'Equipamento' },
  ],

  _fmtBRL(n) {
    return 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
  },

  // Aceita "1,5" ou "1.5"; inválido → 0.
  _num(v) {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  },

  // Espelho de lib/composicao.custoUnitario (o browser não carrega o CommonJS):
  // soma em centavos para não acumular drift de float.
  _custo(itens) {
    const cents = (itens || []).reduce(
      (acc, it) => acc + Math.round(this._num(it.coef) * this._num(it.valorUnit) * 100),
      0
    );
    return cents / 100;
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando composições...</div>';
    try {
      const res = await fetch('/api/composicoes');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this._lista = await res.json();

      const termo = (this.busca || '').toLowerCase().trim();
      let lista = this._lista;
      if (termo) {
        lista = lista.filter(
          (c) =>
            (c.codigo || '').toLowerCase().includes(termo) ||
            (c.descricao || '').toLowerCase().includes(termo)
        );
      }
      const total = this._lista.length;

      app.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Composições de Custo</h1>
            <p class="page-subtitle">${total} composi${total !== 1 ? 'ções' : 'ção'} no catálogo · alimenta o orçamento de propostas</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-primary btn-lg" id="btnNovaComp">+ Nova Composição</button>
          </div>
        </div>

        <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);">
          <input class="form-control" id="inputBuscaComp" placeholder="🔍 Buscar por código ou descrição..." value="${escapeHtml(this.busca)}">
        </div>

        ${
          lista.length === 0
            ? `<div class="card" style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">Nenhuma composição encontrada.</div>`
            : `<div class="card" style="padding:0;">
                 <div class="table-wrap">
                   <table>
                     <thead>
                       <tr>
                         <th scope="col" style="width:120px;">Código</th>
                         <th scope="col">Descrição</th>
                         <th scope="col" style="width:70px;text-align:center;">Un.</th>
                         <th scope="col" style="width:80px;text-align:center;">Insumos</th>
                         <th scope="col" style="width:150px;text-align:right;">Custo unitário</th>
                         <th scope="col" style="width:80px;text-align:center;">Status</th>
                         <th scope="col" style="width:150px;">Ações</th>
                       </tr>
                     </thead>
                     <tbody>${lista.map((c) => this._renderRow(c)).join('')}</tbody>
                   </table>
                 </div>
               </div>`
        }
      `;
      this._attachEvents();
    } catch (e) {
      console.error('[Composicoes] erro:', e);
      app.innerHTML = `<div class="error-banner">Erro ao carregar composições: ${escapeHtml(e.message)}</div>`;
    }
  },

  _renderRow(c) {
    const nItens = Array.isArray(c.itens) ? c.itens.length : 0;
    const custo = c.custoUnitario != null ? c.custoUnitario : this._custo(c.itens);
    return `
      <tr style="${c.ativo === false ? 'opacity:.55;' : ''}">
        <td><strong>${escapeHtml(c.codigo || '—')}</strong></td>
        <td>${escapeHtml(c.descricao || '')}</td>
        <td style="text-align:center;">${escapeHtml(c.unidade || 'un')}</td>
        <td style="text-align:center;">${nItens}</td>
        <td style="text-align:right;font-weight:600;">${this._fmtBRL(custo)}</td>
        <td style="text-align:center;">
          ${
            c.ativo === false
              ? '<span class="badge" style="background:#fee;color:#900;font-size:11px;">inativa</span>'
              : '<span class="badge" style="background:rgba(16,185,129,.15);color:#10b981;font-size:11px;">ativa</span>'
          }
        </td>
        <td>
          <div class="actions-cell">
            <button type="button" class="action-link btn-editar-comp" data-id="${c.id}">Editar</button>
            <button type="button" class="action-link danger btn-excluir-comp" data-id="${c.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  },

  _attachEvents() {
    const btnNova = document.getElementById('btnNovaComp');
    if (btnNova) btnNova.addEventListener('click', () => this.showModal(null));

    const inputBusca = document.getElementById('inputBuscaComp');
    if (inputBusca) {
      let timer;
      inputBusca.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.busca = inputBusca.value;
          this.render();
        }, 250);
      });
    }

    document.querySelectorAll('.btn-editar-comp').forEach((b) => {
      b.addEventListener('click', () => {
        const c = this._lista.find((x) => x.id === b.dataset.id);
        if (c) this.showModal(c);
      });
    });
    document.querySelectorAll('.btn-excluir-comp').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Excluir esta composição do catálogo?')) return;
        try {
          const res = await fetch('/api/composicoes/' + b.dataset.id, { method: 'DELETE' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          if (window.showToast) showToast('Composição excluída', 'success');
          this.render();
        } catch (e) {
          if (window.showToast) showToast('Erro: ' + e.message, 'error');
        }
      });
    });
  },

  showModal(comp) {
    const isEdit = !!comp;
    const c = comp || { codigo: '', descricao: '', unidade: 'un', itens: [], ativo: true };
    this._editItens = (Array.isArray(c.itens) ? c.itens : []).map((it) => ({
      tipo: it.tipo || 'material',
      descricao: it.descricao || '',
      coef: it.coef != null ? it.coef : '',
      valorUnit: it.valorUnit != null ? it.valorUnit : '',
    }));

    const html = `
      <div class="modal-overlay" id="modalOverlayComp">
        <div class="modal" style="width:780px;max-width:96vw;">
          <div class="modal-header">
            <h2 class="modal-title">${isEdit ? 'Editar Composição' : 'Nova Composição'}</h2>
            <button class="modal-close" id="btnFecharComp">✕</button>
          </div>
          <form id="formComp" class="modal-content">
            <div style="display:grid;grid-template-columns:1fr 2fr 90px;gap:12px;">
              <div class="form-group">
                <label class="form-label">Código</label>
                <input type="text" class="form-control" name="codigo" value="${escapeHtml(c.codigo || '')}" placeholder="01.01">
              </div>
              <div class="form-group">
                <label class="form-label">Descrição *</label>
                <input type="text" class="form-control" name="descricao" required value="${escapeHtml(c.descricao || '')}" placeholder="Ex: Alvenaria de bloco cerâmico">
              </div>
              <div class="form-group">
                <label class="form-label">Unidade</label>
                <input type="text" class="form-control" name="unidade" value="${escapeHtml(c.unidade || 'un')}" placeholder="m2">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Insumos</label>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style="width:150px;">Tipo</th>
                      <th>Descrição</th>
                      <th style="width:90px;text-align:right;">Coef.</th>
                      <th style="width:120px;text-align:right;">Valor unit.</th>
                      <th style="width:110px;text-align:right;">Subtotal</th>
                      <th style="width:40px;"></th>
                    </tr>
                  </thead>
                  <tbody id="compItensBody"></tbody>
                </table>
              </div>
              <button type="button" class="btn btn-secondary" id="btnAddItem" style="margin-top:8px;">+ Insumo</button>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #eee;margin-top:8px;">
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                <input type="checkbox" name="ativo" ${c.ativo === false ? '' : 'checked'}> Ativa
              </label>
              <div style="font-size:15px;">Custo unitário: <strong id="compCustoTotal">R$ 0,00</strong></div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarComp">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarComp">${isEdit ? 'Salvar Alterações' : 'Criar Composição'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => document.getElementById('modalOverlayComp')?.remove();
    document.getElementById('btnFecharComp').addEventListener('click', close);
    document.getElementById('btnCancelarComp').addEventListener('click', close);

    this._renderItensRows();
    document.getElementById('btnAddItem').addEventListener('click', () => {
      this._editItens.push({ tipo: 'mo', descricao: '', coef: '', valorUnit: '' });
      this._renderItensRows();
    });

    document.getElementById('btnSalvarComp').addEventListener('click', async () => {
      const form = document.getElementById('formComp');
      const descricao = form.descricao.value.trim();
      if (!descricao) {
        if (window.showToast) showToast('Descrição é obrigatória', 'warning');
        return;
      }
      const data = {
        codigo: form.codigo.value.trim(),
        descricao,
        unidade: form.unidade.value.trim() || 'un',
        ativo: form.ativo.checked,
        itens: this._editItens
          .filter((it) => (it.descricao || '').trim() || this._num(it.coef) || this._num(it.valorUnit))
          .map((it) => ({
            tipo: it.tipo,
            descricao: (it.descricao || '').trim(),
            coef: this._num(it.coef),
            valorUnit: this._num(it.valorUnit),
          })),
      };
      try {
        const url = isEdit ? '/api/composicoes/' + comp.id : '/api/composicoes';
        const res = await fetch(url, {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'HTTP ' + res.status);
        }
        close();
        this.render();
        if (window.showToast) showToast(isEdit ? 'Composição atualizada' : 'Composição criada', 'success');
      } catch (e) {
        if (window.showToast) showToast('Erro: ' + e.message, 'error');
      }
    });
  },

  _renderItensRows() {
    const body = document.getElementById('compItensBody');
    if (!body) return;
    if (this._editItens.length === 0) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:12px;">Nenhum insumo. Clique em "+ Insumo".</td></tr>`;
    } else {
      body.innerHTML = this._editItens
        .map((it, i) => {
          const subtotal = this._num(it.coef) * this._num(it.valorUnit);
          return `
            <tr>
              <td>
                <select class="form-control comp-item-input" data-i="${i}" data-f="tipo">
                  ${this.TIPOS.map((t) => `<option value="${t.v}" ${it.tipo === t.v ? 'selected' : ''}>${t.l}</option>`).join('')}
                </select>
              </td>
              <td><input type="text" class="form-control comp-item-input" data-i="${i}" data-f="descricao" value="${escapeHtml(String(it.descricao || ''))}"></td>
              <td><input type="text" inputmode="decimal" class="form-control comp-item-input" data-i="${i}" data-f="coef" value="${escapeHtml(String(it.coef == null ? '' : it.coef))}" style="text-align:right;"></td>
              <td><input type="text" inputmode="decimal" class="form-control comp-item-input" data-i="${i}" data-f="valorUnit" value="${escapeHtml(String(it.valorUnit == null ? '' : it.valorUnit))}" style="text-align:right;"></td>
              <td style="text-align:right;font-weight:600;" data-sub="${i}">${this._fmtBRL(subtotal)}</td>
              <td style="text-align:center;"><button type="button" class="action-link danger comp-item-del" data-i="${i}">×</button></td>
            </tr>
          `;
        })
        .join('');
    }

    body.querySelectorAll('.comp-item-input').forEach((el) => {
      el.addEventListener('input', () => {
        const i = +el.dataset.i;
        this._editItens[i][el.dataset.f] = el.value;
        if (el.dataset.f === 'coef' || el.dataset.f === 'valorUnit') {
          const sub = body.querySelector(`[data-sub="${i}"]`);
          if (sub) {
            sub.textContent = this._fmtBRL(
              this._num(this._editItens[i].coef) * this._num(this._editItens[i].valorUnit)
            );
          }
        }
        this._recalc();
      });
    });
    body.querySelectorAll('.comp-item-del').forEach((b) => {
      b.addEventListener('click', () => {
        this._editItens.splice(+b.dataset.i, 1);
        this._renderItensRows();
      });
    });
    this._recalc();
  },

  _recalc() {
    const el = document.getElementById('compCustoTotal');
    if (el) el.textContent = this._fmtBRL(this._custo(this._editItens));
  },
};
