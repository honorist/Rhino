// Manutenção de Equipamentos — fluxo de aprovação (paridade com Solicitações de Compra).
//   1) Solicitante: solicita (equipamento + problema + fotos).
//   2) Equipe de compras: avalia — define oficina, prazo e custo.
//   3) Gerência: aprova ou rejeita.
//   4) Encerramento: registra o retorno do equipamento.
// Status: solicitada → pendente_aprovacao → aprovada → retornado
//         (+ rejeitada / cancelada)
window.Manutencao = {
  // Persistido: filtros + modo de visualização (lista/kanban), igual a SolicitacoesCompra.
  _store: (window.UIKit?.persistFilter?.('manutencao', {
    filtroStatus: '', filtroContrato: '', filtroAtrasadas: false, view: 'list',
  })) || null,
  get filtroStatus()    { return this._store?.get('filtroStatus')   ?? ''; },
  set filtroStatus(v)   { this._store?.set('filtroStatus', v); },
  get filtroContrato()  { return this._store?.get('filtroContrato') ?? ''; },
  set filtroContrato(v) { this._store?.set('filtroContrato', v); },
  // Drill-down do Dashboard (#/manutencoes?filtro=atrasadas) — "atrasada" não
  // é um status, é status=aprovada + retorno previsto vencido (_isAtrasada).
  get filtroAtrasadas()  { return this._store?.get('filtroAtrasadas') ?? false; },
  set filtroAtrasadas(v) { this._store?.set('filtroAtrasadas', v); },
  get view()            { return this._store?.get('view')           ?? 'list'; },
  set view(v)           { this._store?.set('view', v); },

  _abas() {
    return window.perfil?.abas?.() || null;
  },
  _podeAvaliar() {
    const a = this._abas();
    return !a || a.includes('manutencao:avaliar');
  },
  _podeAprovar() {
    const a = this._abas();
    return !a || a.includes('manutencao:aprovar');
  },

  async render(params) {
    // Drill-down do Dashboard: aplica o filtro inicial da URL uma vez.
    if (params?.query?.filtro === 'atrasadas') this.filtroAtrasadas = true;
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      await Store.loadAll();
      this._draw();
    } catch (e) {
      console.error('[Manutencao]', e);
      app.innerHTML =
        '<div class="card"><p class="text-danger">Erro ao carregar manutenções. Tente novamente.</p></div>';
    }
  },

  // ── Helpers ────────────────────────────────────────────────────────────────
  _fmtDate(s) {
    if (!s) return '—';
    const d = String(s).slice(0, 10).split('-');
    return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : '—';
  },

  _fmtDt(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return this._fmtDate(s);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR').slice(0, 5);
  },

  _hoje() {
    return new Date().toISOString().slice(0, 10);
  },

  _dias(deStr, ateStr) {
    if (!deStr) return null;
    const de = new Date(String(deStr).slice(0, 10) + 'T12:00:00');
    const ate = new Date((ateStr ? String(ateStr).slice(0, 10) : this._hoje()) + 'T12:00:00');
    if (isNaN(de) || isNaN(ate)) return null;
    return Math.floor((ate - de) / 86400000);
  },

  // Em manutenção (aprovada) e já passou da previsão de retorno.
  _isAtrasada(m) {
    return (
      m.status === 'aprovada' &&
      m.dataRetornoPrevista &&
      String(m.dataRetornoPrevista).slice(0, 10) < this._hoje()
    );
  },

  _statusCfg(status) {
    return (
      {
        solicitada: { label: '📋 A avaliar', bg: '#E0E7FF', cor: '#3730A3' },
        pendente_aprovacao: { label: '🟡 Aguardando aprovação', bg: '#FEF3C7', cor: '#92400E' },
        aprovada: { label: '🔧 Em manutenção', bg: '#FFEDD5', cor: '#9A3412' },
        retornado: { label: '✅ Retornado', bg: '#D1FAE5', cor: '#065F46' },
        rejeitada: { label: '❌ Rejeitada', bg: '#FEE2E2', cor: '#991B1B' },
        cancelada: { label: '⛔ Cancelada', bg: '#E5E7EB', cor: '#374151' },
      }[status] || { label: status || '—', bg: '#E5E7EB', cor: '#374151' }
    );
  },

  _badgeStatus(status) {
    const c = this._statusCfg(status);
    return `<span class="badge" style="background:${c.bg};color:${c.cor};">${c.label}</span>`;
  },

  _nomeContrato(contractId) {
    if (!contractId) return '🏢 Sede';
    const c = (Store.state.contracts || []).find((x) => x.id === contractId);
    return c ? '🏗️ ' + escapeHtml(c.name) : '🏗️ Obra';
  },

  _fmtBRL(v) {
    const n = parseFloat(v) || 0;
    return Store.formatBRL ? Store.formatBRL(n) : 'R$ ' + n.toFixed(2);
  },

  _fotos(m) {
    return Array.isArray(m.fotos) ? m.fotos : (m.fotos ? JSON.parse(m.fotos) : []);
  },

  _itens(m) {
    return Array.isArray(m.itens) ? m.itens : (m.itens ? JSON.parse(m.itens) : []);
  },

  // ── Ações (compartilhadas por lista e kanban) ───────────────────────────────
  _acoes(m, podeAvaliar, podeAprovar) {
    const a = [`<button type="button" class="action-link btn-detalhe-man" data-id="${m.id}">Ver</button>`];
    if (m.status === 'solicitada') {
      if (podeAvaliar)
        a.push(`<button type="button" class="action-link btn-avaliar-man" data-id="${m.id}" style="color:#4F46E5;">Avaliar</button>`);
      a.push(`<button type="button" class="action-link btn-editar-man" data-id="${m.id}">Editar</button>`);
      a.push(`<button type="button" class="action-link btn-cancelar-man" data-id="${m.id}" style="color:#D97706;">Cancelar</button>`);
    } else if (m.status === 'pendente_aprovacao') {
      if (podeAprovar)
        a.push(`<button type="button" class="action-link btn-aprovar-man" data-id="${m.id}" style="color:#059669;">Aprovar / rejeitar</button>`);
      a.push(`<button type="button" class="action-link btn-cancelar-man" data-id="${m.id}" style="color:#D97706;">Cancelar</button>`);
    } else if (m.status === 'aprovada') {
      a.push(`<button type="button" class="action-link btn-retorno" data-id="${m.id}" style="color:#059669;">Registrar retorno</button>`);
      a.push(`<button type="button" class="action-link btn-cancelar-man" data-id="${m.id}" style="color:#D97706;">Cancelar</button>`);
    }
    // Romaneio do envio — disponível quando o equipamento já tem destino/oficina definidos.
    if (['pendente_aprovacao', 'aprovada', 'retornado'].includes(m.status)) {
      a.push(`<button type="button" class="action-link btn-romaneio" data-id="${m.id}" style="color:#2563EB;">🖨️ Romaneio</button>`);
    }
    a.push(`<button type="button" class="action-link danger btn-excluir-man" data-id="${m.id}">Excluir</button>`);
    return a;
  },

  // ── Card do Kanban ──────────────────────────────────────────────────────────
  renderCard(m) {
    const podeAvaliar = this._podeAvaliar();
    const podeAprovar = this._podeAprovar();
    const atrasada = this._isAtrasada(m);
    const nFotos = this._fotos(m).length;
    const data = m.createdAt ? new Date(m.createdAt).toLocaleDateString('pt-BR') : '—';
    const actions = this._acoes(m, podeAvaliar, podeAprovar).join('');
    return `
      <div class="ui-kanban__card" data-id="${m.id}">
        <div class="ui-kanban__card-title">
          ${escapeHtml(m.equipamento || '—')}
          ${atrasada ? '<span style="background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:6px;vertical-align:middle;">⏰ ATRASADO</span>' : ''}
        </div>
        <div class="ui-kanban__card-meta">
          <span>📅 ${data}</span>
          <span>${this._nomeContrato(m.contractId)}</span>
          ${m.oficina ? `<span>🔧 ${escapeHtml(m.oficina)}</span>` : ''}
          ${m.dataRetornoPrevista ? `<span style="color:${atrasada ? '#DC2626' : 'var(--color-warning-dark)'};font-weight:600;">🏁 ${this._fmtDate(m.dataRetornoPrevista)}</span>` : ''}
          ${nFotos ? `<span>📷 ${nFotos}</span>` : ''}
        </div>
        ${actions ? `<div class="ui-kanban__card-actions">${actions}</div>` : ''}
      </div>`;
  },

  // ── Tela ────────────────────────────────────────────────────────────────────
  _draw() {
    const app = document.getElementById('app');
    const todas = Store.state.manutencoes || [];
    const contratos = Store.state.contracts || [];
    const podeAvaliar = this._podeAvaliar();
    const podeAprovar = this._podeAprovar();

    let lista = todas;
    // No modo Kanban, ignora o filtro de status (as colunas já fazem esse split).
    if (this.view !== 'kanban' && this.filtroStatus) {
      lista = lista.filter((m) => m.status === this.filtroStatus);
    }
    if (this.filtroContrato) lista = lista.filter((m) => (m.contractId || '') === this.filtroContrato);
    if (this.filtroAtrasadas) lista = lista.filter((m) => this._isAtrasada(m));

    const aAvaliar = todas.filter((m) => m.status === 'solicitada').length;
    const aAprovar = todas.filter((m) => m.status === 'pendente_aprovacao').length;
    const emManut = todas.filter((m) => m.status === 'aprovada').length;
    const atrasadas = todas.filter((m) => this._isAtrasada(m)).length;

    const filtroAtivo = !!(this.filtroStatus || this.filtroContrato || this.filtroAtrasadas);
    const headerHtml = window.UIKit?.pageHeader ? window.UIKit.pageHeader({
      title: 'Manutenção de Equipamentos',
      subtitle: `${todas.length} registro${todas.length !== 1 ? 's' : ''}${podeAvaliar ? ' · você pode avaliar' : ''}${podeAprovar ? ' · você pode aprovar' : ''}`,
      actions: `
        ${window.UIKit?.viewToggle ? window.UIKit.viewToggle({ current: this.view, options: [
          { value: 'list',   label: '☰ Lista' },
          { value: 'kanban', label: '▦ Kanban' },
        ]}) : ''}
        <button class="btn btn-primary btn-lg" id="btnNovaManutencao">+ Solicitar Manutenção</button>`,
    }) : '';

    const kpisHtml = window.UIKit?.kpiGrid ? window.UIKit.kpiGrid([
      { label: '📋 A avaliar',            value: aAvaliar,  color: 'var(--color-info)' },
      { label: '🟡 Aguard. aprovação',    value: aAprovar,  color: 'var(--color-warning)' },
      { label: '🔧 Em manutenção',        value: emManut,   color: 'var(--color-orange)' },
      { label: '⏰ Atrasados',            value: atrasadas, color: atrasadas > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' },
    ]) : '';

    const toolbarHtml = window.UIKit?.toolbar ? window.UIKit.toolbar({
      selects: [
        { id: 'filtroStatus', label: 'Status', options: [
          { value: '',                   label: 'Todos os status',          selected: !this.filtroStatus },
          { value: 'solicitada',         label: '📋 A avaliar',             selected: this.filtroStatus === 'solicitada' },
          { value: 'pendente_aprovacao', label: '🟡 Aguardando aprovação',  selected: this.filtroStatus === 'pendente_aprovacao' },
          { value: 'aprovada',           label: '🔧 Em manutenção',         selected: this.filtroStatus === 'aprovada' },
          { value: 'retornado',          label: '✅ Retornado',             selected: this.filtroStatus === 'retornado' },
          { value: 'rejeitada',          label: '❌ Rejeitada',             selected: this.filtroStatus === 'rejeitada' },
          { value: 'cancelada',          label: '⛔ Cancelada',             selected: this.filtroStatus === 'cancelada' },
        ]},
        { id: 'filtroContrato', label: 'Origem', options: [
          { value: '', label: `Todas (${contratos.length})`, selected: !this.filtroContrato },
          ...contratos.map((c) => ({ value: c.id, label: c.name, selected: this.filtroContrato === c.id })),
        ]},
      ],
      showClear: filtroAtivo, clearId: 'btnLimparMan',
    }) : '';

    let contentHtml = '';
    if (this.view === 'kanban') {
      const columns = [
        { key: 'solicitada',         title: 'A Avaliar',  icon: '📋', variant: 'warning',
          items: lista.filter((m) => m.status === 'solicitada'),  emptyMsg: 'Nenhuma solicitação' },
        { key: 'pendente_aprovacao', title: 'Gerente',    icon: '👔', variant: 'orange',
          items: lista.filter((m) => m.status === 'pendente_aprovacao'), emptyMsg: 'Nada aguardando aprovação' },
        { key: 'aprovada',           title: 'Em Manutenção', icon: '🔧', variant: 'blue',
          items: lista.filter((m) => m.status === 'aprovada'),    emptyMsg: 'Nada na oficina' },
        { key: 'retornado',          title: 'Retornado',  icon: '✅', variant: 'success',
          items: lista.filter((m) => m.status === 'retornado'),   emptyMsg: 'Nenhum retorno ainda' },
      ];
      contentHtml = window.UIKit?.kanban ? window.UIKit.kanban({ columns, renderCard: (m) => this.renderCard(m) }) : '';
    } else {
      contentHtml = `
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Equipamento</th>
                  <th scope="col">Origem</th>
                  <th scope="col">Oficina</th>
                  <th scope="col">Enviado</th>
                  <th scope="col">Previsão</th>
                  <th scope="col">Retorno</th>
                  <th scope="col">Status</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody id="manutTbody">
                ${
                  lista.length === 0
                    ? `<tr><td colspan="8" class="text-center text-muted" style="padding:var(--sp-xl);">
                      ${filtroAtivo ? 'Nenhum registro neste filtro' : 'Nenhuma solicitação. Clique em "+ Solicitar Manutenção".'}
                     </td></tr>`
                    : lista.map((m) => this._renderRow(m, podeAvaliar, podeAprovar)).join('')
                }
              </tbody>
            </table>
          </div>
        </div>`;
    }

    app.innerHTML = `
      ${headerHtml}
      ${kpisHtml}
      <div class="card mb-2xl" style="background:rgba(49,130,206,.05);border-left:4px solid var(--color-info);padding:var(--sp-sm) var(--sp-md);">
        <div style="font-size:13px;line-height:1.5;">
          <strong>ℹ️ Como funciona:</strong> qualquer pessoa <strong>solicita</strong> a manutenção (equipamento + problema + fotos).
          A <strong>equipe de compras</strong> avalia — define oficina, prazo e custo. A <strong>gerência</strong> aprova.
          Depois, registra-se o retorno do equipamento.
        </div>
      </div>
      ${toolbarHtml}
      ${contentHtml}
    `;

    document.getElementById('btnNovaManutencao').addEventListener('click', () => this.showModalNova());
    document.getElementById('filtroStatus')?.addEventListener('change', (e) => { this.filtroStatus = e.target.value; this._draw(); });
    document.getElementById('filtroContrato')?.addEventListener('change', (e) => { this.filtroContrato = e.target.value; this._draw(); });
    document.getElementById('btnLimparMan')?.addEventListener('click', () => { this.filtroStatus = ''; this.filtroContrato = ''; this.filtroAtrasadas = false; this._draw(); });
    document.querySelectorAll('.ui-view-toggle button[data-view]').forEach((b) => {
      b.addEventListener('click', () => { this.view = b.dataset.view; this._draw(); });
    });
    this._attachListeners();
  },

  _renderRow(m, podeAvaliar, podeAprovar) {
    const atrasada = this._isAtrasada(m);
    const diasFora = m.status === 'aprovada' ? this._dias(m.dataEnvio) : null;
    const nFotos = this._fotos(m).length;

    const previsaoCell = m.dataRetornoPrevista
      ? `<span style="color:${atrasada ? '#DC2626' : 'inherit'};font-weight:${atrasada ? '700' : '400'};">${this._fmtDate(m.dataRetornoPrevista)}${atrasada ? ' ⏰' : ''}</span>`
      : '—';

    const acoes = this._acoes(m, podeAvaliar, podeAprovar);

    return `<tr>
      <td>
        <strong>${escapeHtml(m.equipamento || '—')}</strong>
        ${nFotos ? `<span style="font-size:12px;color:var(--color-text-muted);margin-left:6px;">📷 ${nFotos}</span>` : ''}
        ${m.problema ? `<div style="font-size:13px;color:var(--color-text-muted);">${escapeHtml(m.problema)}</div>` : ''}
        ${m.solicitanteNome ? `<div style="font-size:12px;color:var(--color-text-muted);">por ${escapeHtml(m.solicitanteNome)}</div>` : ''}
      </td>
      <td style="font-size:14px;">${this._nomeContrato(m.contractId)}</td>
      <td style="font-size:14px;">${escapeHtml(m.oficina || '—')}</td>
      <td style="font-size:14px;">
        ${this._fmtDate(m.dataEnvio)}
        ${diasFora != null && diasFora >= 0 ? `<div style="font-size:12px;color:var(--color-text-muted);">há ${diasFora} dia${diasFora !== 1 ? 's' : ''}</div>` : ''}
      </td>
      <td style="font-size:14px;">${previsaoCell}</td>
      <td style="font-size:14px;">${m.status === 'retornado' ? this._fmtDate(m.dataRetorno) : '—'}</td>
      <td>${this._badgeStatus(m.status)}</td>
      <td><div class="actions-cell" style="display:flex;gap:6px;flex-wrap:wrap;">${acoes.join('')}</div></td>
    </tr>`;
  },

  _attachListeners() {
    const on = (cls, fn) => document.querySelectorAll(cls).forEach((b) =>
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(e.currentTarget.dataset.id); }));
    on('.btn-detalhe-man', (id) => this.showDetalhe(id));
    on('.btn-avaliar-man', (id) => this.showModalAvaliar(id));
    on('.btn-aprovar-man', (id) => this.showModalAprovar(id));
    on('.btn-retorno', (id) => this.showModalRetorno(id));
    on('.btn-editar-man', (id) => this.showModalNova(id));
    on('.btn-cancelar-man', (id) => this._cancelar(id));
    on('.btn-excluir-man', (id) => this._excluir(id));
    on('.btn-romaneio', (id) => this.imprimirRomaneio(id));
  },

  _modalShell(id, titulo, sub, corpo, btnId, btnLabel) {
    return `
      <div class="modal-overlay" id="${id}">
        <div class="modal" style="width:560px;max-width:95vw;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${titulo}</h2>
              ${sub ? `<div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">${sub}</div>` : ''}
            </div>
            <button class="modal-close">✕</button>
          </div>
          ${corpo}
          <div class="modal-footer">
            <button class="btn btn-secondary modal-cancel">Cancelar</button>
            <button class="btn btn-primary" id="${btnId}">${btnLabel}</button>
          </div>
        </div>
      </div>`;
  },

  _wire(overlayId, btnId, onSubmit) {
    const overlay = document.getElementById(overlayId);
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('.modal-cancel').addEventListener('click', close);
    const btn = document.getElementById(btnId);
    btn.addEventListener('click', async () => {
      if (btn.disabled) return; // anti-duplo-clique
      const txt = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      try {
        await onSubmit();
        close();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = txt;
      }
    });
    return { overlay, close, btn };
  },

  async _fetchJson(url, method, payload) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return res.json();
  },

  // ── 1ª etapa: solicitar / editar (com fotos) ────────────────────────────────
  showModalNova(id) {
    const m = id ? (Store.state.manutencoes || []).find((x) => x.id === id) : null;
    const contratos = (Store.state.contracts || []).filter(
      (c) => c.status === 'ativo' || c.status === 'pausado'
    );
    const origemAtual = m?.contractId || '';
    const fotos = m ? this._fotos(m) : [];
    const itens = m && this._itens(m).length ? this._itens(m) : [{ descricao: '', patrimonio: '', qtd: 1 }];

    const linhaItem = (it) => `
      <tr class="man-item-row">
        <td><input class="form-control" data-f="descricao" placeholder="Descrição do material" value="${escapeHtml(it.descricao || '')}"></td>
        <td><input class="form-control" data-f="patrimonio" placeholder="Patrimônio / código" value="${escapeHtml(it.patrimonio || '')}" style="width:150px;"></td>
        <td><input class="form-control" data-f="qtd" type="number" step="1" min="0" value="${it.qtd ?? 1}" style="width:90px;"></td>
        <td><button type="button" class="btn btn-sm btn-ghost man-rm-item" style="color:#DC2626;">✕</button></td>
      </tr>`;

    const thumb = (f) => `
      <div class="man-foto-thumb" data-foto-id="${f.id}" style="position:relative;width:72px;height:72px;border-radius:6px;overflow:hidden;border:1px solid var(--color-border);">
        <img src="${f.url}" alt="foto" style="width:100%;height:100%;object-fit:cover;">
        <button type="button" class="man-foto-rm" data-foto-id="${f.id}" title="Remover" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;line-height:1;">✕</button>
      </div>`;

    const corpo = `
      <form id="formManutencao" class="modal-content">
        <div class="form-group">
          <label class="form-label">Equipamento *</label>
          <input class="form-control" name="equipamento" value="${escapeHtml(m?.equipamento || '')}" placeholder="Ex: Máquina de solda Bambozzi" required>
        </div>
        <div class="form-group">
          <label class="form-label">Problema / defeito relatado</label>
          <textarea class="form-control" name="problema" rows="2" placeholder="O que está acontecendo com o equipamento?">${escapeHtml(m?.problema || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Origem do equipamento</label>
          <select class="form-control" name="contractId">
            <option value="">🏢 Sede</option>
            ${contratos.map((c) => `<option value="${escapeHtml(c.id)}" ${origemAtual === c.id ? 'selected' : ''}>🏗️ ${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" name="observacoes" rows="2" placeholder="Notas adicionais (opcional)">${escapeHtml(m?.observacoes || '')}</textarea>
        </div>
        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label class="form-label" style="margin:0;">Materiais / ferramentas (para o romaneio)</label>
            <button type="button" class="btn btn-sm btn-secondary" id="btnAddItemMan">+ Item</button>
          </div>
          <table style="width:100%;font-size:14px;">
            <thead><tr style="background:var(--color-surface-2);">
              <th scope="col" style="padding:6px;text-align:left;">Descrição</th>
              <th scope="col" style="padding:6px;text-align:left;">Patrimônio / Código</th>
              <th scope="col" style="padding:6px;text-align:left;">Qtd</th>
              <th scope="col" style="padding:6px;width:36px;"></th>
            </tr></thead>
            <tbody id="manItensBody">${itens.map(linhaItem).join('')}</tbody>
          </table>
          <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;">Opcional. Lista o que está sendo enviado; aparece na tabela do romaneio.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Fotos do equipamento / defeito</label>
          <div id="manFotosGrid" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
            ${fotos.map(thumb).join('')}
          </div>
          <input class="form-control" type="file" id="manFotoInput" accept="image/*" multiple>
          <div id="manFotoPreview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
          <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;">Opcional. Você pode anexar várias fotos (serão comprimidas automaticamente).</div>
        </div>
      </form>`;

    document.body.insertAdjacentHTML(
      'beforeend',
      this._modalShell(
        'modalManutencao',
        m ? 'Editar Solicitação' : 'Solicitar Manutenção',
        'A equipe de compras vai definir oficina, prazo e custo.',
        corpo,
        'btnSalvarManutencao',
        m ? 'Salvar' : 'Enviar solicitação'
      )
    );

    // Itens do romaneio: adicionar / remover linhas.
    document.getElementById('btnAddItemMan').addEventListener('click', () => {
      document.getElementById('manItensBody').insertAdjacentHTML('beforeend', linhaItem({ descricao: '', patrimonio: '', qtd: 1 }));
    });
    document.getElementById('manItensBody').addEventListener('click', (e) => {
      if (e.target.classList.contains('man-rm-item')) e.target.closest('.man-item-row').remove();
    });

    // Pré-visualização local dos arquivos recém-selecionados.
    const input = document.getElementById('manFotoInput');
    const preview = document.getElementById('manFotoPreview');
    input.addEventListener('change', () => {
      preview.innerHTML = '';
      for (const f of input.files) {
        if (!f.type.startsWith('image/')) continue;
        const url = URL.createObjectURL(f);
        preview.insertAdjacentHTML('beforeend',
          `<div style="width:72px;height:72px;border-radius:6px;overflow:hidden;border:1px dashed var(--color-border);"><img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;"></div>`);
      }
    });

    // Remoção de fotos já existentes (modo edição) — exclui no banco na hora.
    document.getElementById('manFotosGrid')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.man-foto-rm');
      if (!btn || !m) return;
      const fotoId = btn.dataset.fotoId;
      if (!confirm('Remover esta foto?')) return;
      try {
        await Store.deleteManutencaoFoto(m.id, fotoId);
        btn.closest('.man-foto-thumb')?.remove();
        window.showToast('Foto removida', 'success');
      } catch (err) {
        window.showToast(err.message, 'error');
      }
    });

    this._wire('modalManutencao', 'btnSalvarManutencao', async () => {
      const fd = new FormData(document.getElementById('formManutencao'));
      const equipamento = (fd.get('equipamento') || '').trim();
      if (!equipamento) throw new Error('Informe o equipamento');
      const itensColetados = [];
      document.querySelectorAll('#manItensBody .man-item-row').forEach((tr) => {
        const descricao = tr.querySelector('[data-f="descricao"]').value.trim();
        const patrimonio = tr.querySelector('[data-f="patrimonio"]').value.trim();
        const qtd = parseFloat(tr.querySelector('[data-f="qtd"]').value) || 0;
        if (descricao) itensColetados.push({ descricao, patrimonio, qtd });
      });
      const payload = {
        equipamento,
        problema: (fd.get('problema') || '').trim(),
        contractId: fd.get('contractId') || null,
        observacoes: (fd.get('observacoes') || '').trim(),
        itens: itensColetados,
      };
      // Fase 1: cria/atualiza a manutenção (JSON).
      const resp = await this._fetchJson(
        m ? `/api/manutencoes/${m.id}` : '/api/manutencoes',
        m ? 'PUT' : 'POST',
        payload
      );
      const novoId = m ? m.id : resp?.manutencao?.id;
      // Fase 2: se houver fotos novas selecionadas, envia para o registro (precisa existir).
      const files = input.files;
      if (novoId && files && files.length) {
        await Store.uploadManutencaoFoto(novoId, files);
      }
      window.showToast(m ? 'Solicitação atualizada' : 'Manutenção solicitada', 'success');
    });
  },

  // ── 2ª etapa: equipe de compras avalia ─────────────────────────────────────
  showModalAvaliar(id) {
    const m = (Store.state.manutencoes || []).find((x) => x.id === id);
    if (!m) return;

    const corpo = `
      <form id="formAvaliar" class="modal-content">
        <div style="background:var(--color-bg);border-radius:6px;padding:var(--sp-sm) var(--sp-md);margin-bottom:var(--sp-md);font-size:14px;">
          <strong>${escapeHtml(m.equipamento)}</strong>
          ${m.problema ? `<div style="color:var(--color-text-muted);font-size:13px;">${escapeHtml(m.problema)}</div>` : ''}
          <div style="color:var(--color-text-muted);font-size:13px;">Origem: ${this._nomeContrato(m.contractId)}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Oficina / empresa que vai reparar *</label>
          <input class="form-control" name="oficina" value="${escapeHtml(m.oficina || '')}" placeholder="Quem vai consertar" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Custo estimado (R$)</label>
            <input class="form-control" name="custoEstimado" type="number" step="0.01" min="0" value="${m.custoEstimado || ''}" placeholder="0,00">
          </div>
          <div class="form-group">
            <label class="form-label">Data de envio</label>
            <input class="form-control" name="dataEnvio" type="date" value="${m.dataEnvio ? String(m.dataEnvio).slice(0, 10) : this._hoje()}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Previsão de retorno</label>
          <input class="form-control" name="dataRetornoPrevista" type="date" value="${m.dataRetornoPrevista ? String(m.dataRetornoPrevista).slice(0, 10) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Observações da avaliação</label>
          <textarea class="form-control" name="observacoes" rows="2" placeholder="Diagnóstico, garantia, prazo combinado...">${escapeHtml(m.observacoes || '')}</textarea>
        </div>
      </form>`;

    document.body.insertAdjacentHTML(
      'beforeend',
      this._modalShell(
        'modalAvaliar',
        'Avaliar Manutenção',
        'Defina oficina, prazo e custo para a aprovação gerencial.',
        corpo,
        'btnConfirmarAvaliar',
        'Enviar para aprovação'
      )
    );

    this._wire('modalAvaliar', 'btnConfirmarAvaliar', async () => {
      const fd = new FormData(document.getElementById('formAvaliar'));
      const oficina = (fd.get('oficina') || '').trim();
      if (!oficina) throw new Error('Informe a oficina / empresa');
      await this._fetchJson(`/api/manutencoes/${id}/avaliar`, 'POST', {
        oficina,
        custoEstimado: parseFloat(fd.get('custoEstimado')) || 0,
        dataEnvio: fd.get('dataEnvio') || null,
        dataRetornoPrevista: fd.get('dataRetornoPrevista') || null,
        observacoes: (fd.get('observacoes') || '').trim(),
      });
      window.showToast('Avaliação enviada para aprovação', 'success');
    });
  },

  // ── 3ª etapa: gerência aprova / rejeita ────────────────────────────────────
  showModalAprovar(id) {
    const m = (Store.state.manutencoes || []).find((x) => x.id === id);
    if (!m) return;

    const linha = (
      rot,
      val
    ) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--color-border);font-size:14px;">
      <span style="color:var(--color-text-muted);">${rot}</span><strong>${val}</strong></div>`;

    const corpo = `
      <form id="formAprovar" class="modal-content">
        <div style="margin-bottom:var(--sp-md);">
          ${linha('Equipamento', escapeHtml(m.equipamento))}
          ${m.problema ? linha('Problema', escapeHtml(m.problema)) : ''}
          ${linha('Oficina', escapeHtml(m.oficina || '—'))}
          ${linha('Custo estimado', this._fmtBRL(m.custoEstimado))}
          ${linha('Envio', this._fmtDate(m.dataEnvio))}
          ${linha('Previsão de retorno', this._fmtDate(m.dataRetornoPrevista))}
          ${m.avaliadorNome ? linha('Avaliado por', escapeHtml(m.avaliadorNome)) : ''}
        </div>
        <div class="form-group">
          <label class="form-label">Motivo (preencha apenas se for rejeitar)</label>
          <textarea class="form-control" name="motivo" rows="2" placeholder="Motivo da rejeição..."></textarea>
        </div>
      </form>`;

    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div class="modal-overlay" id="modalAprovar">
        <div class="modal" style="width:520px;max-width:95vw;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Aprovar Manutenção</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">Pré-avaliada pela equipe de compras.</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          ${corpo}
          <div class="modal-footer">
            <button class="btn btn-secondary modal-cancel">Cancelar</button>
            <button class="btn btn-danger" id="btnRejeitar">Rejeitar</button>
            <button class="btn btn-primary" id="btnAprovar">Aprovar</button>
          </div>
        </div>
      </div>`
    );

    const overlay = document.getElementById('modalAprovar');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('.modal-cancel').addEventListener('click', close);
    const btnA = document.getElementById('btnAprovar');
    const btnR = document.getElementById('btnRejeitar');
    const trava = () => {
      btnA.disabled = true;
      btnR.disabled = true;
    };
    const destrava = () => {
      btnA.disabled = false;
      btnR.disabled = false;
    };

    btnA.addEventListener('click', async () => {
      if (btnA.disabled) return;
      trava();
      btnA.textContent = 'Aprovando…';
      try {
        await this._fetchJson(`/api/manutencoes/${id}/aprovar`, 'POST', {});
        window.showToast('Manutenção aprovada', 'success');
        close();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
        destrava();
        btnA.textContent = 'Aprovar';
      }
    });
    btnR.addEventListener('click', async () => {
      if (btnR.disabled) return;
      const motivo = (
        new FormData(document.getElementById('formAprovar')).get('motivo') || ''
      ).trim();
      if (!confirm('Rejeitar esta solicitação de manutenção?')) return;
      trava();
      btnR.textContent = 'Rejeitando…';
      try {
        await this._fetchJson(`/api/manutencoes/${id}/rejeitar`, 'POST', { motivo });
        window.showToast('Manutenção rejeitada', 'success');
        close();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
        destrava();
        btnR.textContent = 'Rejeitar';
      }
    });
  },

  // ── Encerramento: registrar retorno ────────────────────────────────────────
  showModalRetorno(id) {
    const m = (Store.state.manutencoes || []).find((x) => x.id === id);
    if (!m) return;

    const corpo = `
      <form id="formRetorno" class="modal-content">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data de retorno *</label>
            <input class="form-control" name="dataRetorno" type="date" value="${this._hoje()}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Custo final (R$)</label>
            <input class="form-control" name="custo" type="number" step="0.01" min="0" value="${m.custoEstimado || ''}" placeholder="0,00">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações do retorno</label>
          <textarea class="form-control" name="observacoes" rows="3" placeholder="O que foi feito, condição do equipamento, garantia...">${escapeHtml(m.observacoes || '')}</textarea>
        </div>
      </form>`;

    document.body.insertAdjacentHTML(
      'beforeend',
      this._modalShell(
        'modalRetorno',
        'Registrar Retorno',
        `${escapeHtml(m.equipamento)} · oficina: ${escapeHtml(m.oficina || '—')}`,
        corpo,
        'btnConfirmarRetorno',
        'Confirmar retorno'
      )
    );

    this._wire('modalRetorno', 'btnConfirmarRetorno', async () => {
      const fd = new FormData(document.getElementById('formRetorno'));
      const dataRetorno = fd.get('dataRetorno') || '';
      if (!dataRetorno) throw new Error('Informe a data de retorno');
      await this._fetchJson(`/api/manutencoes/${id}/retorno`, 'POST', {
        dataRetorno,
        custo: parseFloat(fd.get('custo')) || 0,
        observacoes: (fd.get('observacoes') || '').trim(),
      });
      window.showToast('Retorno registrado', 'success');
    });
  },

  // ── DETALHE com linha do tempo ──────────────────────────────────────────────
  _renderTimeline(m) {
    const marco = (cor, icone, titulo, sub) => `
      <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:14px;">
        <div style="width:14px;height:14px;border-radius:50%;background:${cor};margin-top:4px;flex-shrink:0;box-shadow:0 0 0 3px ${cor}33;"></div>
        <div>
          <div style="font-weight:700;font-size:14px;">${icone} ${titulo}</div>
          <div style="font-size:13px;color:var(--color-text-muted);">${sub}</div>
        </div>
      </div>`;
    const aguardando = (titulo) => `
      <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:14px;opacity:.55;">
        <div style="width:14px;height:14px;border-radius:50%;background:#D1D5DB;margin-top:4px;flex-shrink:0;border:2px dashed #6B7280;"></div>
        <div>
          <div style="font-weight:700;font-size:14px;">⏳ ${titulo}</div>
          <div style="font-size:13px;color:var(--color-text-muted);">—</div>
        </div>
      </div>`;

    let html = marco('#3B82F6', '📝', 'Solicitada', `${escapeHtml(m.solicitanteNome || '—')} · ${this._fmtDt(m.createdAt)}`);

    if (m.status === 'cancelada') {
      html += marco('#6B7280', '⛔', 'Cancelada', `${this._fmtDt(m.canceladoEm || m.updatedAt)}${m.motivoCancelamento ? '<br><em>Motivo: ' + escapeHtml(m.motivoCancelamento) + '</em>' : ''}`);
      return html;
    }

    if (m.avaliadoEm || m.oficina) {
      const det = `${escapeHtml(m.avaliadorNome || '—')} (Equipe de compras) · ${this._fmtDt(m.avaliadoEm)}` +
        (m.oficina ? `<br>Oficina: <strong>${escapeHtml(m.oficina)}</strong>` : '') +
        (m.custoEstimado ? `<br>Custo estimado: ${this._fmtBRL(m.custoEstimado)}` : '') +
        (m.dataRetornoPrevista ? `<br>Previsão de retorno: ${this._fmtDate(m.dataRetornoPrevista)}` : '');
      html += marco('#F59E0B', '💰', 'Avaliada', det);
    } else {
      html += aguardando('Aguardando avaliação da equipe de compras');
      return html;
    }

    if (m.status === 'rejeitada') {
      html += marco('#EF4444', '❌', 'Rejeitada', `${escapeHtml(m.aprovadorNome || '—')} (Gerente) · ${this._fmtDt(m.aprovadoEm)}${m.motivoRejeicao ? '<br><em>Motivo: ' + escapeHtml(m.motivoRejeicao) + '</em>' : ''}`);
      return html;
    }

    if (m.aprovadoEm || m.status === 'aprovada' || m.status === 'retornado') {
      html += marco('#3B82F6', '✅', 'Aprovada', `${escapeHtml(m.aprovadorNome || '—')} (Gerente) · ${this._fmtDt(m.aprovadoEm)}`);
    } else {
      html += aguardando('Aguardando aprovação do gerente');
      return html;
    }

    if (m.status === 'retornado') {
      const det = `${this._fmtDt(m.dataRetorno)}` +
        (m.custo ? `<br>Custo final: ${this._fmtBRL(m.custo)}` : '') +
        (m.observacoes ? `<br><em>${escapeHtml(m.observacoes)}</em>` : '');
      html += marco('#10B981', '🏭', 'Retornado', det);
    } else {
      html += aguardando('Aguardando retorno do equipamento');
    }
    return html;
  },

  showDetalhe(id) {
    const m = (Store.state.manutencoes || []).find((x) => x.id === id);
    if (!m) return;
    const fotos = this._fotos(m);

    const html = `
      <div class="modal-overlay" id="modalDetalheMan">
        <div class="modal" style="width:780px;max-width:95vw;max-height:92vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Manutenção #${m.numero || m.id.slice(-6)}</h2>
              <div style="margin-top:4px;">${this._badgeStatus(m.status)} <span style="font-size:12px;color:var(--color-text-muted);margin-left:8px;">${this._codigoRomaneio ? this._codigoRomaneio(m) : ''}</span></div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div style="display:grid;grid-template-columns:2fr 3fr;gap:var(--sp-lg);">
              <div>
                <h3 style="margin:0 0 var(--sp-sm);font-size:15px;">Linha do tempo</h3>
                ${this._renderTimeline(m)}
              </div>
              <div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:var(--sp-md);font-size:14px;">
                  <div><strong>Equipamento:</strong><br>${escapeHtml(m.equipamento || '—')}</div>
                  <div><strong>Origem:</strong><br>${this._nomeContrato(m.contractId)}</div>
                  <div><strong>Oficina:</strong><br>${escapeHtml(m.oficina || '—')}</div>
                  <div><strong>Custo:</strong><br>${m.status === 'retornado' && m.custo ? this._fmtBRL(m.custo) : (m.custoEstimado ? this._fmtBRL(m.custoEstimado) + ' (est.)' : '—')}</div>
                </div>
                ${m.problema ? `<div style="padding:10px;background:var(--color-surface-2);border-radius:6px;margin-bottom:var(--sp-md);font-size:14px;"><strong>Problema:</strong><br>${escapeHtml(m.problema)}</div>` : ''}
                ${m.observacoes ? `<div style="padding:10px;background:var(--color-surface-2);border-radius:6px;margin-bottom:var(--sp-md);font-size:14px;"><strong>Observações:</strong><br>${escapeHtml(m.observacoes)}</div>` : ''}
                ${(() => {
                  const itens = this._itens(m);
                  if (!itens.length) return '';
                  const total = itens.reduce((s, it) => s + (parseFloat(it.qtd) || 0), 0);
                  return `
                    <h3 style="margin:0 0 8px;font-size:15px;">Materiais (${itens.length})</h3>
                    <table style="width:100%;font-size:13px;margin-bottom:var(--sp-md);">
                      <thead><tr style="background:var(--color-surface-2);">
                        <th style="padding:5px;text-align:left;">Descrição</th>
                        <th style="padding:5px;text-align:left;">Patrim./Código</th>
                        <th style="padding:5px;text-align:right;">Qtd</th>
                      </tr></thead>
                      <tbody>
                        ${itens.map((it) => `<tr>
                          <td style="padding:5px;">${escapeHtml(it.descricao || '—')}</td>
                          <td style="padding:5px;">${escapeHtml(it.patrimonio || '—')}</td>
                          <td style="padding:5px;text-align:right;">${parseFloat(it.qtd) || 0}</td>
                        </tr>`).join('')}
                        <tr style="font-weight:700;border-top:2px solid var(--color-border);"><td colspan="2" style="padding:5px;text-align:right;">TOTAL</td><td style="padding:5px;text-align:right;">${total}</td></tr>
                      </tbody>
                    </table>`;
                })()}
                <h3 style="margin:0 0 8px;font-size:15px;">Fotos (${fotos.length})</h3>
                ${fotos.length
                  ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${fotos.map((f) => `<a href="${f.url}" target="_blank" rel="noopener" style="width:88px;height:88px;border-radius:6px;overflow:hidden;border:1px solid var(--color-border);display:block;"><img src="${f.url}" alt="foto" style="width:100%;height:100%;object-fit:cover;"></a>`).join('')}</div>`
                  : '<div class="text-muted" style="font-size:13px;">Nenhuma foto anexada.</div>'}
              </div>
            </div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <button class="btn btn-secondary" id="btnFecharDetMan">Fechar</button>
            ${['pendente_aprovacao', 'aprovada', 'retornado'].includes(m.status) ? `<button class="btn btn-primary" id="btnRomaneioDet">🖨️ Imprimir romaneio</button>` : ''}
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalDetalheMan');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFecharDetMan').addEventListener('click', close);
    document.getElementById('btnRomaneioDet')?.addEventListener('click', () => this.imprimirRomaneio(id));
  },

  // O romaneio (imprimirRomaneio + _carregarLogo) vive em
  // js/views/manutencao-romaneio.js, carregado depois desta view (ver app.js).

  async _cancelar(id) {
    const motivo = prompt('Motivo do cancelamento (opcional):');
    if (motivo === null) return; // usuário fechou o prompt
    try {
      await this._fetchJson(`/api/manutencoes/${id}/cancelar`, 'POST', { motivo: motivo || '' });
      window.showToast('Manutenção cancelada', 'success');
      this.render();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  },

  async _excluir(id) {
    if (!confirm('Excluir este registro de manutenção? Esta ação não pode ser desfeita.')) return;
    try {
      const res = await fetch(`/api/manutencoes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      window.showToast('Registro excluído', 'success');
      this.render();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  },
};
