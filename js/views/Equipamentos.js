/**
 * View: Equipamentos próprios/locados (#/equipamentos)
 *
 * Cadastro GLOBAL (não por obra) do parque de equipamentos — próprios e locados
 * de terceiros — com status operacional, valores e o histórico de locações a
 * obras. Ao abrir um equipamento, mostra os dados + as locações com o custo
 * acumulado calculado pelo backend (lib/equipamento.js) e os alertas de devolução.
 *
 * Busca dados via fetch (autocontida); para os selects de fornecedor/obra
 * reutiliza o Store já carregado quando disponível.
 */
window.Equipamentos = {
  filtro: 'todos', // todos | proprio | locado
  _lista: [],
  _resumo: {},
  _page: 1,
  _pageSize: 25,

  PROPRIEDADES: [
    { v: 'proprio', l: 'Próprio' },
    { v: 'locado', l: 'Locado' },
  ],
  STATUS: [
    { v: 'disponivel', l: 'Disponível' },
    { v: 'em_uso', l: 'Em uso' },
    { v: 'manutencao', l: 'Manutenção' },
    { v: 'devolvido', l: 'Devolvido' },
  ],
  STATUS_LOC: [
    { v: 'ativa', l: 'Ativa' },
    { v: 'encerrada', l: 'Encerrada' },
  ],

  _fmtBRL(n) {
    return 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
  },

  _fmtDate(s) {
    if (!s) return '—';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : escapeHtml(String(s));
  },

  _fornecedores() {
    return (window.Store && Store.state && Store.state.fornecedores) || [];
  },
  _contratos() {
    return (window.Store && Store.state && Store.state.contracts) || [];
  },
  _fornecedorNome(id) {
    const f = this._fornecedores().find((x) => x.id === id);
    return f ? f.nome || f.razaoSocial || id : '';
  },
  _contratoNome(id) {
    const c = this._contratos().find((x) => x.id === id);
    return c ? c.name || c.nome || id : '';
  },

  _statusBadge(st) {
    const map = {
      disponivel: ['Disponível', '#d1fae5', '#047857'],
      em_uso: ['Em uso', '#dbeafe', '#1e40af'],
      manutencao: ['Manutenção', '#fef3c7', '#b45309'],
      devolvido: ['Devolvido', 'var(--color-surface-2)', 'var(--color-text-muted)'],
    };
    const [lbl, bg, fg] = map[st] || [st || '—', 'var(--color-surface-2)', 'var(--color-text-muted)'];
    return `<span class="badge" style="background:${bg};color:${fg};font-size:11px;">${escapeHtml(lbl)}</span>`;
  },

  _propBadge(p) {
    return p === 'locado'
      ? '<span class="badge" style="background:#ede9fe;color:#6d28d9;font-size:11px;">Locado</span>'
      : '<span class="badge" style="background:#e0f2fe;color:#0369a1;font-size:11px;">Próprio</span>';
  },

  // Item 13 do backlog: exportação CSV/PDF do parque de equipamentos (lista já filtrada).
  _propriedadeLabelPlano(p) { return p === 'locado' ? 'Locado' : 'Próprio'; },
  _statusLabelPlano(st) {
    return (this.STATUS.find((s) => s.v === st) || {}).l || st || '—';
  },
  _exportRowsPlanas(lista) {
    return lista.map((e) => {
      const locado = (e.propriedade || 'proprio') === 'locado';
      return {
        nome: e.nome || '',
        tipo: e.tipo || '',
        propriedade: this._propriedadeLabelPlano(e.propriedade),
        status: this._statusLabelPlano(e.status),
        fornecedor: locado && e.fornecedorId ? this._fornecedorNome(e.fornecedorId) : '',
        valor: locado ? this._fmtBRL(e.valorLocacaoMensal) + '/mês' : this._fmtBRL(e.valorAquisicao),
      };
    });
  },
  _exportarCSV(lista) {
    const rows = this._exportRowsPlanas(lista);
    if (!rows.length) { if (window.showToast) showToast('Nada para exportar', 'warning'); return; }
    window.RhinoExport.csv(
      rows.map((r) => ({
        Equipamento: r.nome, Tipo: r.tipo, Propriedade: r.propriedade,
        Status: r.status, Fornecedor: r.fornecedor, Valor: r.valor,
      })),
      { filename: `equipamentos_${new Date().toISOString().slice(0, 10)}.csv` }
    );
  },
  async _exportarPDF(lista) {
    const rows = this._exportRowsPlanas(lista);
    if (!rows.length) { if (window.showToast) showToast('Nada para exportar', 'warning'); return; }
    await window.RhinoExport.tablePdf({
      title: 'Equipamentos',
      columns: [
        { key: 'nome', label: 'Equipamento' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'propriedade', label: 'Propriedade' },
        { key: 'status', label: 'Status' },
        { key: 'fornecedor', label: 'Fornecedor' },
        { key: 'valor', label: 'Valor' },
      ],
      rows,
      filename: `equipamentos_${new Date().toISOString().slice(0, 10)}.pdf`,
      orientation: 'landscape',
    });
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando equipamentos...</div>';
    try {
      const res = await fetch('/api/equipamentos');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      this._lista = data.equipamentos || [];
      this._resumo = data.resumo || {};

      const r = this._resumo;
      let lista = this._lista;
      if (this.filtro !== 'todos') lista = lista.filter((e) => (e.propriedade || 'proprio') === this.filtro);

      // Paginação (UIKit.paginate) — cobre a lista já filtrada por propriedade.
      let pagina = null;
      let listaPagina = lista;
      if (window.UIKit?.paginate) {
        pagina = window.UIKit.paginate(lista, this._page, this._pageSize);
        this._page = pagina.page; // clamp: lista pode ter encolhido pelo filtro
        listaPagina = pagina.slice;
      }

      const kpis = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:var(--sp-lg);">
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #3b82f6;">
            <div class="text-muted font-sm">Equipamentos</div>
            <div style="font-size:18px;font-weight:700;">${r.total || 0}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #0369a1;">
            <div class="text-muted font-sm">Próprios</div>
            <div style="font-size:18px;font-weight:700;">${r.proprios || 0}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #6d28d9;">
            <div class="text-muted font-sm">Locados</div>
            <div style="font-size:18px;font-weight:700;">${r.locados || 0}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #f59e0b;">
            <div class="text-muted font-sm" title="Soma do valor mensal de locação dos equipamentos locados">Custo mensal de locação</div>
            <div style="font-size:18px;font-weight:700;">${this._fmtBRL(r.custoLocacaoMensal)}</div>
          </div>
        </div>
      `;

      const pill = (v, l) =>
        `<button class="btn btn-sm ${this.filtro === v ? 'btn-primary' : 'btn-secondary'} eqp-filtro" data-f="${v}">${l}</button>`;

      app.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Equipamentos</h1>
            <p class="page-subtitle">${this._lista.length} equipamento${this._lista.length !== 1 ? 's' : ''} no parque · próprios e locados</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-secondary btn-sm" id="btnExportarEqpCSV">Exportar CSV</button>
            <button class="btn btn-secondary btn-sm" id="btnExportarEqpPDF">Exportar PDF</button>
            <button class="btn btn-primary btn-lg" id="btnNovoEqp">+ Novo Equipamento</button>
          </div>
        </div>

        ${kpis}

        <div style="display:flex;gap:6px;margin-bottom:var(--sp-md);">
          ${pill('todos', 'Todos')}
          ${pill('proprio', 'Próprios')}
          ${pill('locado', 'Locados')}
        </div>

        ${
          lista.length === 0
            ? `<div class="card" style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
                 <div style="font-size:44px;margin-bottom:8px;opacity:.6;">📦</div>
                 <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhum equipamento</div>
                 <div style="font-size:13px;">Cadastre os equipamentos próprios e locados da empresa.</div>
               </div>`
            : `<div class="card" style="padding:0;">
                 <div class="table-wrap">
                   <table>
                     <thead>
                       <tr>
                         <th scope="col">Equipamento</th>
                         <th scope="col" style="width:110px;">Propriedade</th>
                         <th scope="col" style="width:120px;text-align:center;">Status</th>
                         <th scope="col" style="width:180px;">Fornecedor</th>
                         <th scope="col" style="width:160px;text-align:right;">Valor</th>
                         <th scope="col" style="width:200px;">Ações</th>
                       </tr>
                     </thead>
                     <tbody>${listaPagina.map((e) => this._renderRow(e)).join('')}</tbody>
                   </table>
                 </div>
                 ${pagina && window.UIKit?.pagination ? window.UIKit.pagination(pagina, { label: 'equipamentos' }) : ''}
               </div>`
        }
      `;
      this._attachEvents(lista, pagina);
    } catch (e) {
      console.error('[Equipamentos] erro:', e);
      app.innerHTML = `<div class="error-banner">Erro ao carregar equipamentos: ${escapeHtml(e.message)}</div>`;
    }
  },

  _renderRow(e) {
    const locado = (e.propriedade || 'proprio') === 'locado';
    const valor = locado
      ? `${this._fmtBRL(e.valorLocacaoMensal)}<span class="text-muted font-sm">/mês</span>`
      : this._fmtBRL(e.valorAquisicao);
    return `
      <tr>
        <td>
          <strong>${escapeHtml(e.nome || '—')}</strong>
          ${e.tipo ? `<div class="text-muted font-sm">${escapeHtml(e.tipo)}</div>` : ''}
          ${e.localizacao ? `<div class="text-muted font-sm">📍 ${escapeHtml(e.localizacao)}</div>` : ''}
        </td>
        <td>${this._propBadge(e.propriedade)}</td>
        <td style="text-align:center;">${this._statusBadge(e.status)}</td>
        <td>${escapeHtml(locado && e.fornecedorId ? this._fornecedorNome(e.fornecedorId) : '—')}</td>
        <td style="text-align:right;font-weight:600;">${valor}</td>
        <td>
          <div class="actions-cell">
            <button type="button" class="action-link eqp-detalhe" data-id="${e.id}">Detalhes</button>
            <button type="button" class="action-link eqp-editar" data-id="${e.id}">Editar</button>
            <button type="button" class="action-link danger eqp-excluir" data-id="${e.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  },

  _attachEvents(listaFiltrada, pagina) {
    const btnNovo = document.getElementById('btnNovoEqp');
    if (btnNovo) btnNovo.addEventListener('click', () => this.showModal(null));

    document.getElementById('btnExportarEqpCSV')?.addEventListener('click', () => this._exportarCSV(listaFiltrada || this._lista));
    document.getElementById('btnExportarEqpPDF')?.addEventListener('click', () => this._exportarPDF(listaFiltrada || this._lista));

    if (pagina && window.UIKit?.wirePagination) {
      window.UIKit.wirePagination(document.getElementById('app'), pagina, ({ page, pageSize }) => {
        this._page = page;
        this._pageSize = pageSize;
        this.render();
      });
    }

    document.querySelectorAll('.eqp-filtro').forEach((b) => {
      b.addEventListener('click', () => {
        this.filtro = b.dataset.f;
        this._page = 1;
        this.render();
      });
    });

    document.querySelectorAll('.eqp-detalhe').forEach((b) => {
      b.addEventListener('click', () => {
        const e = this._lista.find((x) => x.id === b.dataset.id);
        if (e) this.showDetalhe(e);
      });
    });
    document.querySelectorAll('.eqp-editar').forEach((b) => {
      b.addEventListener('click', () => {
        const e = this._lista.find((x) => x.id === b.dataset.id);
        if (e) this.showModal(e);
      });
    });
    document.querySelectorAll('.eqp-excluir').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Excluir este equipamento e todas as suas locações?')) return;
        try {
          const res = await fetch('/api/equipamentos/' + b.dataset.id, { method: 'DELETE' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          if (window.showToast) showToast('Equipamento excluído', 'success');
          this.render();
        } catch (e) {
          if (window.showToast) showToast('Erro: ' + e.message, 'error');
        }
      });
    });
  },

  _fornecedorOptions(sel) {
    return ['<option value="">— sem fornecedor —</option>']
      .concat(
        this._fornecedores().map(
          (f) => `<option value="${escapeHtml(f.id)}" ${sel === f.id ? 'selected' : ''}>${escapeHtml(f.nome || f.razaoSocial || f.id)}</option>`
        )
      )
      .join('');
  },
  _contratoOptions(sel) {
    return ['<option value="">— sem obra —</option>']
      .concat(
        this._contratos().map(
          (c) => `<option value="${escapeHtml(c.id)}" ${sel === c.id ? 'selected' : ''}>${escapeHtml(c.name || c.nome || c.id)}</option>`
        )
      )
      .join('');
  },
  _optionsFrom(arr, sel) {
    return arr.map((o) => `<option value="${o.v}" ${sel === o.v ? 'selected' : ''}>${o.l}</option>`).join('');
  },

  showModal(equip) {
    const isEdit = !!equip;
    const e = equip || { nome: '', tipo: '', propriedade: 'proprio', status: 'disponivel', fornecedorId: '', valorAquisicao: '', valorLocacaoMensal: '', localizacao: '' };

    const html = `
      <div class="modal-overlay" id="modalEqp" style="z-index:1100;">
        <div class="modal" style="width:640px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <h2 class="modal-title">${isEdit ? 'Editar' : 'Novo'} Equipamento</h2>
            <button class="modal-close" id="btnFecharEqp" aria-label="Fechar">✕</button>
          </div>
          <form id="formEqp" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Nome *</label>
                <input type="text" class="form-control" name="nome" required value="${escapeHtml(e.nome || '')}" placeholder="Ex: Betoneira 400L">
              </div>
              <div class="form-group">
                <label class="form-label">Tipo</label>
                <input type="text" class="form-control" name="tipo" value="${escapeHtml(e.tipo || '')}" placeholder="Ex: Concretagem">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Propriedade</label>
                <select class="form-control" name="propriedade">${this._optionsFrom(this.PROPRIEDADES, e.propriedade || 'proprio')}</select>
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-control" name="status">${this._optionsFrom(this.STATUS, e.status || 'disponivel')}</select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Fornecedor (se locado)</label>
                <select class="form-control" name="fornecedorId">${this._fornecedorOptions(e.fornecedorId || '')}</select>
              </div>
              <div class="form-group">
                <label class="form-label">Localização</label>
                <input type="text" class="form-control" name="localizacao" value="${escapeHtml(e.localizacao || '')}" placeholder="Ex: Almoxarifado / Obra X">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Valor de aquisição (R$)</label>
                <input type="text" inputmode="decimal" class="form-control" name="valorAquisicao" value="${escapeHtml(String(e.valorAquisicao == null || e.valorAquisicao === '' ? '' : e.valorAquisicao))}" placeholder="0,00">
              </div>
              <div class="form-group">
                <label class="form-label">Valor locação mensal (R$)</label>
                <input type="text" inputmode="decimal" class="form-control" name="valorLocacaoMensal" value="${escapeHtml(String(e.valorLocacaoMensal == null || e.valorLocacaoMensal === '' ? '' : e.valorLocacaoMensal))}" placeholder="0,00">
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarEqp">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarEqp">${isEdit ? 'Salvar Alterações' : 'Criar Equipamento'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const close = () => document.getElementById('modalEqp')?.remove();
    document.getElementById('btnFecharEqp').addEventListener('click', close);
    document.getElementById('btnCancelarEqp').addEventListener('click', close);

    document.getElementById('btnSalvarEqp').addEventListener('click', async () => {
      const form = document.getElementById('formEqp');
      const nome = form.nome.value.trim();
      if (!nome) {
        if (window.showToast) showToast('Nome é obrigatório', 'warning');
        return;
      }
      const num = (s) => (String(s || '').trim() === '' ? 0 : parseFloat(String(s).replace(',', '.')) || 0);
      const data = {
        nome,
        tipo: form.tipo.value.trim(),
        propriedade: form.propriedade.value,
        status: form.status.value,
        fornecedorId: form.fornecedorId.value || null,
        localizacao: form.localizacao.value.trim(),
        valorAquisicao: num(form.valorAquisicao.value),
        valorLocacaoMensal: num(form.valorLocacaoMensal.value),
      };
      try {
        const url = isEdit ? '/api/equipamentos/' + equip.id : '/api/equipamentos';
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
        if (window.showToast) showToast(isEdit ? 'Equipamento atualizado' : 'Equipamento criado', 'success');
      } catch (e) {
        if (window.showToast) showToast('Erro: ' + e.message, 'error');
      }
    });
  },

  // ═══════════ Detalhe do equipamento + locações ═══════════

  async showDetalhe(equip) {
    const html = `
      <div class="modal-overlay" id="modalEqpDet" style="z-index:1100;">
        <div class="modal" style="width:760px;max-width:96vw;max-height:92vh;overflow-y:auto;">
          <div class="modal-header">
            <h2 class="modal-title">${escapeHtml(equip.nome || 'Equipamento')}</h2>
            <button class="modal-close" id="btnFecharEqpDet" aria-label="Fechar">✕</button>
          </div>
          <div class="modal-content" id="eqpDetConteudo">
            <div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Carregando…</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarEqpDet">Fechar</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const close = () => document.getElementById('modalEqpDet')?.remove();
    document.getElementById('btnFecharEqpDet').addEventListener('click', close);
    document.getElementById('btnCancelarEqpDet').addEventListener('click', close);
    await this._loadDetalhe(equip);
  },

  async _loadDetalhe(equip) {
    const box = document.getElementById('eqpDetConteudo');
    if (!box) return;
    try {
      const res = await fetch(`/api/equipamentos/${equip.id}/locacoes`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      box.innerHTML = this._renderDetalhe(equip, data.locacoes || [], data.alertas || []);
      this._attachDetalheEvents(equip);
    } catch (e) {
      box.innerHTML = `<p class="text-danger">Erro ao carregar locações: ${escapeHtml(e.message)}</p>`;
    }
  },

  _renderDetalhe(equip, locacoes, alertas) {
    const locado = (equip.propriedade || 'proprio') === 'locado';
    const info = [
      ['Propriedade', this._propBadge(equip.propriedade)],
      ['Status', this._statusBadge(equip.status)],
      ['Tipo', escapeHtml(equip.tipo || '—')],
      ['Localização', escapeHtml(equip.localizacao || '—')],
      ['Fornecedor', escapeHtml(equip.fornecedorId ? this._fornecedorNome(equip.fornecedorId) : '—')],
      ['Valor de aquisição', this._fmtBRL(equip.valorAquisicao)],
      ['Valor locação mensal', this._fmtBRL(equip.valorLocacaoMensal)],
    ];
    const dados = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:var(--sp-md);">
        ${info
          .map(
            ([k, v]) => `<div style="padding:8px 10px;background:var(--color-surface-2);border-radius:6px;">
              <div class="text-muted font-sm">${k}</div><div style="font-weight:600;">${v}</div>
            </div>`
          )
          .join('')}
      </div>
    `;

    const alertasBanner = alertas.length
      ? `<div class="card" style="padding:10px 12px;margin-bottom:var(--sp-md);background:#fef2f2;border-left:3px solid #dc2626;">
           <strong style="color:#b91c1c;">⚠ Devolução</strong>
           <div class="font-sm" style="margin-top:2px;">${alertas
             .map((a) => `${escapeHtml(this._contratoNome(a.contractId) || 'Sem obra')} — ${a.situacao === 'vencida' ? `vencida há ${Math.abs(a.diasRestantes)} dia(s)` : `vence em ${a.diasRestantes} dia(s)`}`)
             .join(' · ')}</div>
         </div>`
      : '';

    const linhas = locacoes.length
      ? locacoes
          .map(
            (l) => `
        <tr>
          <td>${escapeHtml(l.contractId ? this._contratoNome(l.contractId) : '—')}</td>
          <td style="white-space:nowrap;">${this._fmtDate(l.dataInicio)}</td>
          <td style="white-space:nowrap;">${this._fmtDate(l.dataFim)}</td>
          <td style="text-align:right;">${this._fmtBRL(l.valorMensal)}</td>
          <td style="text-align:right;font-weight:600;">${this._fmtBRL(l.custoAcumulado)}</td>
          <td>
            <select class="form-control eqploc-status" data-id="${escapeHtml(l.id)}" style="min-width:130px;padding:4px 8px;">
              ${this._optionsFrom(this.STATUS_LOC, l.status)}
            </select>
          </td>
          <td style="text-align:center;">
            <button type="button" class="action-link danger eqploc-del" data-id="${escapeHtml(l.id)}">Excluir</button>
          </td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="7" class="text-muted" style="text-align:center;padding:var(--sp-md);">Nenhuma locação registrada.</td></tr>`;

    return `
      ${dados}
      ${alertasBanner}
      <h3 style="font-size:14px;font-weight:700;margin:var(--sp-sm) 0;">Locações</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Obra</th>
              <th scope="col">Início</th>
              <th scope="col">Fim</th>
              <th scope="col" style="text-align:right;">Valor/mês</th>
              <th scope="col" style="text-align:right;">Custo acumulado</th>
              <th scope="col" style="width:150px;">Status</th>
              <th scope="col" style="width:80px;"></th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>

      <div class="card" style="padding:var(--sp-md);margin-top:var(--sp-md);">
        <div style="font-weight:600;margin-bottom:8px;">+ Nova locação</div>
        <form id="formEqpLoc">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Obra</label>
              <select class="form-control" name="contractId">${this._contratoOptions('')}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Valor mensal (R$)</label>
              <input type="text" inputmode="decimal" class="form-control" name="valorMensal" value="${escapeHtml(String(equip.valorLocacaoMensal || ''))}" placeholder="0,00">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Início</label>
              <input type="date" class="form-control" name="dataInicio">
            </div>
            <div class="form-group">
              <label class="form-label">Fim (previsto)</label>
              <input type="date" class="form-control" name="dataFim">
            </div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="btnAddEqpLoc">Adicionar locação</button>
        </form>
      </div>
    `;
  },

  _attachDetalheEvents(equip) {
    const btnAdd = document.getElementById('btnAddEqpLoc');
    if (btnAdd) {
      btnAdd.addEventListener('click', async () => {
        const form = document.getElementById('formEqpLoc');
        const num = (s) => (String(s || '').trim() === '' ? 0 : parseFloat(String(s).replace(',', '.')) || 0);
        const body = {
          contractId: form.contractId.value || null,
          valorMensal: num(form.valorMensal.value),
          dataInicio: form.dataInicio.value || null,
          dataFim: form.dataFim.value || null,
        };
        try {
          const res = await fetch(`/api/equipamentos/${equip.id}/locacoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error(await res.text());
          if (window.showToast) showToast('Locação adicionada', 'success');
          this._loadDetalhe(equip);
        } catch (e) {
          if (window.showToast) showToast('Erro: ' + e.message, 'error');
        }
      });
    }

    document.querySelectorAll('.eqploc-status').forEach((sel) => {
      sel.addEventListener('change', async () => {
        try {
          const res = await fetch(`/api/equipamentos/${equip.id}/locacoes/${sel.dataset.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: sel.value }),
          });
          if (!res.ok) throw new Error(await res.text());
          if (window.showToast) showToast('Status atualizado', 'success');
          this._loadDetalhe(equip);
        } catch (e) {
          if (window.showToast) showToast('Erro: ' + e.message, 'error');
        }
      });
    });

    document.querySelectorAll('.eqploc-del').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Excluir esta locação?')) return;
        try {
          const res = await fetch(`/api/equipamentos/${equip.id}/locacoes/${b.dataset.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error(await res.text());
          if (window.showToast) showToast('Locação excluída', 'success');
          this._loadDetalhe(equip);
        } catch (e) {
          if (window.showToast) showToast('Erro: ' + e.message, 'error');
        }
      });
    });
  },
};
