// Solicitações de Compra — fluxo de 3 etapas:
//   1) Encarregado cria com itens (descrição + qtd) e justificativa
//   2) Equipe de compras avalia: lança cotações por item, escolhe a vencedora, define destino → ou cancela
//   3) Gerente aprova/rejeita; aprovação gera entrada de estoque + Conta a Pagar
window.SolicitacoesCompra = {
  // Persistido: filtros + modo de visualização (lista/kanban)
  _store: (window.UIKit?.persistFilter?.('sol-compra', {
    filtroStatus: '', filtroContrato: '', view: 'list',
  })) || null,
  get filtroStatus()    { return this._store?.get('filtroStatus')   ?? ''; },
  set filtroStatus(v)   { this._store?.set('filtroStatus', v); },
  get filtroContrato()  { return this._store?.get('filtroContrato') ?? ''; },
  set filtroContrato(v) { this._store?.set('filtroContrato', v); },
  get view()            { return this._store?.get('view')           ?? 'list'; },
  set view(v)           { this._store?.set('view', v); },

  _abas() { return window.perfil?.abas?.() || null; },
  _podeAvaliar() { const a = this._abas(); return !a || a.includes('solicitacoes-compra:avaliar'); },
  _podeAprovar() { const a = this._abas(); return !a || a.includes('solicitacoes-compra:aprovar'); },
  _podeReceber() { const a = this._abas(); return !a || a.includes('solicitacoes-compra:receber'); },

  // Selo do tipo do item — só aparece quando é aluguel (compra é o padrão).
  _tipoBadge(it) {
    return (it && it.tipo === 'aluguel')
      ? ' <span style="background:#EDE9FE;color:#5B21B6;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;vertical-align:middle;">🔑 ALUGUEL</span>'
      : '';
  },

  _etapaCfg(status) {
    return {
      pendente_avaliacao: { bg: '#FEF3C7', color: '#92400E', label: '🟡 Aguardando equipe de compras' },
      pendente_aprovacao: { bg: '#FED7AA', color: '#9A3412', label: '🟠 Aguardando gerente' },
      aprovada:           { bg: '#DBEAFE', color: '#1E40AF', label: '🔵 Aprovada · aguardando compra' },
      comprada:           { bg: '#E0E7FF', color: '#3730A3', label: '📦 Comprada · aguardando entrega' },
      recebida:           { bg: '#D1FAE5', color: '#065F46', label: '✅ Recebida' },
      rejeitada:          { bg: '#FEE2E2', color: '#991B1B', label: '❌ Rejeitada' },
      cancelada:          { bg: '#F3F4F6', color: '#6B7280', label: '🚫 Cancelada' },
    }[status] || { bg: '#F3F4F6', color: '#6B7280', label: status || '—' };
  },

  _badgeEtapa(status) {
    const c = this._etapaCfg(status);
    return `<span class="badge" style="background:${c.bg};color:${c.color};font-size:13px;padding:3px 10px;border-radius:12px;font-weight:700;">${c.label}</span>`;
  },

  _fmtDt(s) {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR').slice(0, 5);
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      await Store.loadAll();
      this._draw();
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="card"><p class="text-danger">Erro ao carregar: ${escapeHtml(e.message)}</p></div>`;
    }
  },

  _draw() {
    const app = document.getElementById('app');
    const todas = Store.state.solicitacoes_compra || [];
    const contratos = Store.state.contracts || [];
    const podeAvaliar = this._podeAvaliar();
    const podeAprovar = this._podeAprovar();
    const podeReceber = this._podeReceber();

    let lista = todas;
    // No modo Kanban, ignora o filtro de status (as colunas já fazem esse split).
    // No modo Lista, aplica filtroStatus + filtroContrato normalmente.
    if (this.view !== 'kanban' && this.filtroStatus) {
      lista = lista.filter(s => s.status === this.filtroStatus);
    }
    if (this.filtroContrato) lista = lista.filter(s => s.contractId === this.filtroContrato);

    const kpiAvaliacao = todas.filter(s => s.status === 'pendente_avaliacao').length;
    const kpiAprovacao = todas.filter(s => s.status === 'pendente_aprovacao').length;
    const kpiAprov = todas.filter(s => s.status === 'aprovada').length;
    const kpiComprada = todas.filter(s => s.status === 'comprada').length;
    const kpiRecebida = todas.filter(s => s.status === 'recebida').length;
    const kpiTotalAprov = todas.filter(s => s.status === 'pendente_aprovacao').reduce((sum, s) => sum + (parseFloat(s.valorTotal) || 0), 0);

    const filtroAtivo = !!(this.filtroStatus || this.filtroContrato);
    const headerHtml = window.UIKit?.pageHeader ? window.UIKit.pageHeader({
      title: 'Solicitações de Compra',
      subtitle: `${todas.length} solicitação${todas.length !== 1 ? 'ões' : ''}${podeAvaliar ? ' · você pode avaliar' : podeAprovar ? ' · você pode aprovar' : ''}`,
      actions: `
        ${window.UIKit?.viewToggle ? window.UIKit.viewToggle({ current: this.view, options: [
          { value: 'list',   label: '☰ Lista' },
          { value: 'kanban', label: '▦ Kanban' },
        ]}) : ''}
        <button class="btn btn-primary btn-lg" id="btnNovaSolicitacao">+ Nova Solicitação</button>`,
    }) : '';

    const kpisHtml = window.UIKit?.kpiGrid ? window.UIKit.kpiGrid([
      { label: '🟡 Aguard. cotação',  value: kpiAvaliacao, color: 'var(--color-warning)' },
      { label: '🟠 Aguard. gerente',  value: kpiAprovacao, color: 'var(--color-orange)',
        hint: kpiTotalAprov > 0 ? `${Store.formatBRL(kpiTotalAprov)} p/ aprovar` : '' },
      { label: '🔵 A comprar',        value: kpiAprov,     color: 'var(--color-info)' },
      { label: '📦 A receber',        value: kpiComprada,  color: 'var(--color-violet)' },
      { label: '✅ Recebidas',        value: kpiRecebida,  color: 'var(--color-success)' },
    ]) : '';

    const toolbarHtml = window.UIKit?.toolbar ? window.UIKit.toolbar({
      selects: [
        { id: 'filtroStatus', label: 'Etapa', options: [
          { value: '',                   label: 'Todas etapas',              selected: !this.filtroStatus },
          { value: 'pendente_avaliacao', label: '🟡 Aguard. cotação',        selected: this.filtroStatus === 'pendente_avaliacao' },
          { value: 'pendente_aprovacao', label: '🟠 Aguard. gerente',        selected: this.filtroStatus === 'pendente_aprovacao' },
          { value: 'aprovada',           label: '🔵 Aprovada (a comprar)',   selected: this.filtroStatus === 'aprovada' },
          { value: 'comprada',           label: '📦 Comprada (a receber)',   selected: this.filtroStatus === 'comprada' },
          { value: 'recebida',           label: '✅ Recebida',               selected: this.filtroStatus === 'recebida' },
          { value: 'rejeitada',          label: '❌ Rejeitada',              selected: this.filtroStatus === 'rejeitada' },
          { value: 'cancelada',          label: '🚫 Cancelada',              selected: this.filtroStatus === 'cancelada' },
        ]},
        { id: 'filtroContrato', label: 'Contrato', options: [
          { value: '', label: `Todos (${contratos.length})`, selected: !this.filtroContrato },
          ...contratos.map(c => ({ value: c.id, label: c.name, selected: this.filtroContrato === c.id })),
        ]},
      ],
      showClear: filtroAtivo, clearId: 'btnLimparSC',
    }) : '';

    // Card do Kanban (compartilhado pelos 2 modos)
    const renderCard = (s) => {
      const contrato = contratos.find(c => c.id === s.contractId);
      const itens = Array.isArray(s.itens) ? s.itens : (s.itens ? JSON.parse(s.itens) : []);
      const semValor = s.status === 'pendente_avaliacao';
      const data = s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '—';
      const actions = [
        `<a class="action-link btn-detalhe" data-id="${s.id}">Ver</a>`,
        s.status === 'pendente_avaliacao' && podeAvaliar ? `<a class="action-link btn-avaliar" data-id="${s.id}" style="color:#9A3412;font-weight:700;">Avaliar</a>` : '',
        s.status === 'pendente_aprovacao' && podeAprovar ? `<a class="action-link btn-aprovar" data-id="${s.id}" style="color:#065F46;font-weight:700;">Aprovar</a>` : '',
        s.status === 'aprovada' && podeAvaliar ? `<a class="action-link btn-comprar" data-id="${s.id}" style="color:#1E40AF;font-weight:700;">Comprar</a>` : '',
        s.status === 'comprada' && podeReceber ? `<a class="action-link btn-receber" data-id="${s.id}" style="color:#3730A3;font-weight:700;">Receber</a>` : '',
      ].filter(Boolean).join('');
      return `
        <div class="ui-kanban__card" data-id="${s.id}">
          <div class="ui-kanban__card-title">${escapeHtml(s.solicitanteNome || '—')}</div>
          <div class="ui-kanban__card-meta">
            <span>📅 ${data}</span>
            <span>${contrato ? '🏗️ ' + escapeHtml(contrato.name) : '🏢 Sede'}</span>
            <span>${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</span>
            ${semValor ? '' : `<span><strong>${Store.formatBRL(parseFloat(s.valorTotal) || 0)}</strong></span>`}
          </div>
          ${actions ? `<div class="ui-kanban__card-actions">${actions}</div>` : ''}
        </div>`;
    };

    // Conteúdo: Lista (tabela) ou Kanban (colunas)
    let contentHtml = '';
    if (this.view === 'kanban') {
      // Helper: equipe de compras já começou a cotar? (algum item com cotação > 0)
      const equipeJaIniciou = (s) => {
        const itens = Array.isArray(s.itens) ? s.itens : (s.itens ? JSON.parse(s.itens) : []);
        return itens.some(it => (it.cotacoes || []).some(c => parseFloat(c.precoUnit) > 0));
      };
      const pendAval = lista.filter(s => s.status === 'pendente_avaliacao');

      // Ordem do fluxo: Solicitação → Equipe de Compras → Gerente → Comprar → Receber → Recebida
      const columns = [
        { key:'solicitacao',  title:'Solicitação',     icon:'📥', variant:'info',
          items: pendAval.filter(s => !equipeJaIniciou(s)),
          emptyMsg:'Nenhuma solicitação nova' },
        { key:'compras',      title:'Equipe de Compras', icon:'💼', variant:'warning',
          items: pendAval.filter(s => equipeJaIniciou(s)),
          emptyMsg:'Nada em cotação' },
        { key:'gerente',      title:'Gerente',          icon:'👔', variant:'orange',
          items: lista.filter(s => s.status === 'pendente_aprovacao'),
          emptyMsg:'Nada aguardando aprovação' },
        { key:'aprovada',     title:'A Comprar',        icon:'🛒', variant:'blue',
          items: lista.filter(s => s.status === 'aprovada'),
          emptyMsg:'Nada aprovado pendente' },
        { key:'comprada',     title:'A Receber',        icon:'📦', variant:'violet',
          items: lista.filter(s => s.status === 'comprada'),
          emptyMsg:'Nada em trânsito' },
        { key:'recebida',     title:'Recebida',         icon:'✅', variant:'success',
          items: lista.filter(s => s.status === 'recebida'),
          emptyMsg:'Nenhuma recebida ainda' },
      ];
      contentHtml = window.UIKit?.kanban ? window.UIKit.kanban({ columns, renderCard }) : '';
    } else {
      contentHtml = `
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th><th>Solicitante</th><th>Destino</th>
                  <th>Itens</th><th>Valor</th><th>Etapa</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${lista.length === 0 ? `<tr><td colspan="7" class="text-center text-muted" style="padding:var(--sp-xl);">Nenhuma solicitação encontrada</td></tr>` : lista.map(s => {
                  const contrato = contratos.find(c => c.id === s.contractId);
                  const itens = Array.isArray(s.itens) ? s.itens : (s.itens ? JSON.parse(s.itens) : []);
                  const semValor = s.status === 'pendente_avaliacao';
                  return `
                  <tr>
                    <td>${s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>${escapeHtml(s.solicitanteNome || '—')}</td>
                    <td>${contrato ? '🏗️ ' + escapeHtml(contrato.name) : '🏢 Sede'}</td>
                    <td>${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</td>
                    <td>${semValor ? '<span class="text-muted">—</span>' : `<strong>${Store.formatBRL(parseFloat(s.valorTotal) || 0)}</strong>`}</td>
                    <td>${this._badgeEtapa(s.status)}</td>
                    <td>
                      <div class="actions-cell" style="display:flex;gap:6px;flex-wrap:wrap;">
                        <a class="action-link btn-detalhe" data-id="${s.id}">Ver</a>
                        ${s.status === 'pendente_avaliacao' && podeAvaliar ? `
                          <a class="action-link btn-avaliar"  data-id="${s.id}" style="color:#9A3412;font-weight:700;">Avaliar/Precificar</a>
                          <a class="action-link btn-cancelar" data-id="${s.id}" style="color:#6B7280;">Cancelar</a>` : ''}
                        ${s.status === 'pendente_aprovacao' && podeAprovar ? `
                          <a class="action-link btn-aprovar"  data-id="${s.id}" style="color:#065F46;font-weight:700;">Aprovar</a>
                          <a class="action-link btn-rejeitar" data-id="${s.id}" style="color:#991B1B;">Rejeitar</a>` : ''}
                        ${s.status === 'aprovada' && podeAvaliar ? `<a class="action-link btn-comprar"  data-id="${s.id}" style="color:#1E40AF;font-weight:700;">Registrar compra</a>` : ''}
                        ${s.status === 'comprada' && podeReceber ? `<a class="action-link btn-receber"  data-id="${s.id}" style="color:#3730A3;font-weight:700;">Confirmar chegada</a>` : ''}
                        ${s.status === 'pendente_avaliacao' ? `<a class="action-link btn-editar"  data-id="${s.id}">Editar</a>` : ''}
                        ${s.status === 'pendente_avaliacao' ? `<a class="action-link danger btn-excluir" data-id="${s.id}">Excluir</a>` : ''}
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    const html = `
      ${headerHtml}
      ${kpisHtml}
      ${toolbarHtml}
      ${contentHtml}
    `;

    app.innerHTML = html;

    document.getElementById('btnNovaSolicitacao').addEventListener('click', () => this.showModalCriar());
    document.getElementById('filtroStatus')?.addEventListener('change', e => { this.filtroStatus = e.target.value; this._draw(); });
    document.getElementById('filtroContrato')?.addEventListener('change', e => { this.filtroContrato = e.target.value; this._draw(); });
    document.getElementById('btnLimparSC')?.addEventListener('click', () => {
      this.filtroStatus = ''; this.filtroContrato = ''; this._draw();
    });
    // Toggle Lista / Kanban
    document.querySelectorAll('.ui-view-toggle button[data-view]').forEach(b => {
      b.addEventListener('click', () => { this.view = b.dataset.view; this._draw(); });
    });

    document.querySelectorAll('.btn-detalhe').forEach(b => b.addEventListener('click', e => this.showDetalhe(e.target.dataset.id)));
    document.querySelectorAll('.btn-editar').forEach(b => b.addEventListener('click', e => this.showModalCriar(e.target.dataset.id)));
    document.querySelectorAll('.btn-excluir').forEach(b => b.addEventListener('click', e => this.excluir(e.target.dataset.id)));
    document.querySelectorAll('.btn-avaliar').forEach(b => b.addEventListener('click', e => this.showModalAvaliar(e.target.dataset.id)));
    document.querySelectorAll('.btn-cancelar').forEach(b => b.addEventListener('click', e => this.cancelar(e.target.dataset.id)));
    document.querySelectorAll('.btn-aprovar').forEach(b => b.addEventListener('click', e => this.showModalAprovar(e.target.dataset.id)));
    document.querySelectorAll('.btn-rejeitar').forEach(b => b.addEventListener('click', e => this.rejeitar(e.target.dataset.id)));
    document.querySelectorAll('.btn-comprar').forEach(b => b.addEventListener('click', e => this.showModalComprar(e.target.dataset.id)));
    document.querySelectorAll('.btn-receber').forEach(b => b.addEventListener('click', e => this.showModalReceber(e.target.dataset.id)));
  },

  // ── 1ª etapa: ENCARREGADO cria/edita ───────────────────────────────────
  showModalCriar(id) {
    const s = id ? (Store.state.solicitacoes_compra || []).find(x => x.id === id) : null;
    const itensIniciais = s ? (Array.isArray(s.itens) ? s.itens : JSON.parse(s.itens || '[]')) : [{ descricao: '', qtd: 1, observacoes: '' }];
    const contratos = (Store.state.contracts || []).filter(c => c.status === 'ativo' || c.status === 'pausado');
    const destinoAtual = s?.contractId ? `obra:${s.contractId}` : 'sede';

    const renderLinha = (it, idx) => `
      <tr data-i="${idx}" class="item-row">
        <td><input class="form-control" data-f="descricao" placeholder="Descrição do material" value="${escapeHtml(it.descricao || '')}"></td>
        <td>
          <select class="form-control" data-f="tipo" style="width:120px;">
            <option value="compra" ${it.tipo !== 'aluguel' ? 'selected' : ''}>🛒 Compra</option>
            <option value="aluguel" ${it.tipo === 'aluguel' ? 'selected' : ''}>🔑 Aluguel</option>
          </select>
        </td>
        <td><input class="form-control" data-f="qtd" type="number" step="0.01" min="0" value="${it.qtd || 1}" style="width:90px;"></td>
        <td><input class="form-control" data-f="observacoes" placeholder="Notas (opcional)" value="${escapeHtml(it.observacoes || '')}"></td>
        <td><button type="button" class="btn btn-sm btn-ghost btn-rm-item" style="color:#DC2626;">✕</button></td>
      </tr>
    `;

    const html = `
      <div class="modal-overlay" id="modalSolicitacao">
        <div class="modal" style="width:760px;max-width:95vw;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${s ? 'Editar Solicitação' : 'Nova Solicitação de Compra'}</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">Informe o que precisa, a quantidade e onde será usado. A equipe de compras vai precificar e o Gerente aprovar.</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <form id="formSolicitacao" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Destino *</label>
                <select class="form-control" name="destino" required>
                  <option value="sede" ${destinoAtual==='sede'?'selected':''}>🏢 Sede / Almoxarifado Central</option>
                  ${contratos.map(c => `<option value="obra:${c.id}" ${destinoAtual===`obra:${c.id}`?'selected':''}>🏗️ Obra · ${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Justificativa *</label>
              <textarea class="form-control" name="justificativa" rows="2" required placeholder="Por que esses materiais são necessários?">${escapeHtml(s?.justificativa || '')}</textarea>
            </div>
            <div style="margin-top:var(--sp-lg);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
                <h3 style="margin:0;font-size:16px;font-weight:700;">Itens solicitados</h3>
                <button type="button" class="btn btn-sm btn-secondary" id="btnAddItem">+ Adicionar item</button>
              </div>
              <table style="width:100%;">
                <thead><tr style="background:var(--color-surface-2);">
                  <th style="padding:8px;text-align:left;">Descrição *</th>
                  <th style="padding:8px;text-align:left;">Tipo</th>
                  <th style="padding:8px;text-align:left;">Qtd *</th>
                  <th style="padding:8px;text-align:left;">Observações</th>
                  <th style="padding:8px;width:40px;"></th>
                </tr></thead>
                <tbody id="tbodyItens">${itensIniciais.map((it, i) => renderLinha(it, i)).join('')}</tbody>
              </table>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${s ? 'Salvar' : 'Enviar para compras'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalSolicitacao');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelar').addEventListener('click', close);

    document.getElementById('btnAddItem').addEventListener('click', () => {
      const tbody = document.getElementById('tbodyItens');
      const idx = tbody.querySelectorAll('.item-row').length;
      tbody.insertAdjacentHTML('beforeend', renderLinha({ descricao: '', qtd: 1 }, idx));
    });
    overlay.addEventListener('click', e => {
      if (e.target.classList.contains('btn-rm-item')) e.target.closest('.item-row').remove();
    });

    const btnSalvar = document.getElementById('btnSalvar');
    btnSalvar.addEventListener('click', async () => {
      // Guarda anti-duplo-clique: sem isso, clicar 2x antes da resposta cria
      // 2 solicitações (cada POST gera um registro novo no servidor).
      if (btnSalvar.disabled) return;

      const fd = new FormData(document.getElementById('formSolicitacao'));
      const itens = [];
      document.querySelectorAll('.item-row').forEach(tr => {
        const desc = tr.querySelector('[data-f="descricao"]').value.trim();
        const qtd = parseFloat(tr.querySelector('[data-f="qtd"]').value) || 0;
        const obs = tr.querySelector('[data-f="observacoes"]').value.trim();
        const tipo = tr.querySelector('[data-f="tipo"]').value === 'aluguel' ? 'aluguel' : 'compra';
        if (desc && qtd > 0) itens.push({ descricao: desc, qtd, observacoes: obs, tipo });
      });
      if (!itens.length) { window.showToast('Adicione pelo menos um item válido', 'error'); return; }
      const justificativa = (fd.get('justificativa') || '').trim();
      if (!justificativa) { window.showToast('Justificativa obrigatória', 'error'); return; }
      const destino = fd.get('destino') || 'sede';
      let contractId = null, almoxarifadoDestinoId = 'auto-central';
      if (destino.startsWith('obra:')) {
        contractId = destino.slice(5);
        almoxarifadoDestinoId = `auto-obra:${contractId}`;
      }

      // Desabilita só depois de validar — se o envio falhar, reabilita p/ nova tentativa.
      const txtOrig = btnSalvar.textContent;
      btnSalvar.disabled = true;
      btnSalvar.textContent = 'Enviando…';
      try {
        const url = s ? `/api/solicitacoes-compra/${s.id}` : '/api/solicitacoes-compra';
        const method = s ? 'PUT' : 'POST';
        const payload = { itens, justificativa, contractId, almoxarifadoDestinoId };
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        window.showToast(s ? 'Solicitação atualizada' : 'Solicitação enviada para avaliação', 'success');
        close();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
        btnSalvar.disabled = false;
        btnSalvar.textContent = txtOrig;
      }
    });
  },

  // ── 2ª etapa: EQUIPE DE COMPRAS avalia ───────────────────────────────────────
  showModalAvaliar(id) {
    const s = (Store.state.solicitacoes_compra || []).find(x => x.id === id);
    if (!s) return;
    const itensBase = Array.isArray(s.itens) ? s.itens : JSON.parse(s.itens || '[]');
    const contratos = (Store.state.contracts || []).filter(c => c.status === 'ativo' || c.status === 'pausado');
    const fornecedores = Store.state.fornecedores || [];
    // Estado mutável local com cotações
    const estado = itensBase.map(it => ({
      ...it,
      cotacoes: Array.isArray(it.cotacoes) && it.cotacoes.length
        ? it.cotacoes.map(c => ({ ...c }))
        : [{ fornecedorId: '', fornecedorNome: '', precoUnit: 0, link: '', observacoes: '' }],
      cotacaoEscolhidaIdx: it.cotacaoEscolhidaIdx ?? 0,
    }));

    const renderItens = () => estado.map((it, i) => `
      <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-md);" data-i="${i}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div>
            <strong style="font-size:15px;">${escapeHtml(it.descricao)}</strong>${this._tipoBadge(it)}
            <span style="margin-left:8px;color:var(--color-text-muted);font-size:13px;">qtd: ${it.qtd}</span>
            ${it.observacoes ? `<div style="font-size:12px;color:var(--color-text-muted);">${escapeHtml(it.observacoes)}</div>` : ''}
          </div>
          <button type="button" class="btn btn-sm btn-secondary btn-add-cot" data-i="${i}">+ Cotação</button>
        </div>
        <table style="width:100%;font-size:14px;">
          <thead><tr style="background:var(--color-surface-2);">
            <th style="padding:6px;width:30px;">✓</th>
            <th style="padding:6px;text-align:left;">Fornecedor</th>
            <th style="padding:6px;text-align:right;">Preço unit.</th>
            <th style="padding:6px;text-align:left;">Link / observação</th>
            <th style="padding:6px;text-align:right;">Subtotal</th>
            <th style="padding:6px;width:30px;"></th>
          </tr></thead>
          <tbody>
            ${it.cotacoes.map((c, j) => `
              <tr data-j="${j}">
                <td style="padding:6px;text-align:center;"><input type="radio" name="esc-${i}" ${it.cotacaoEscolhidaIdx === j ? 'checked' : ''} class="rd-esc" data-i="${i}" data-j="${j}"></td>
                <td style="padding:6px;">
                  <select class="form-control input-cot-forn" data-i="${i}" data-j="${j}" style="font-size:13px;">
                    <option value="">— Selecionar —</option>
                    ${fornecedores.map(f => `<option value="${f.id}" data-nome="${escapeHtml(f.nome || f.razaoSocial)}" ${c.fornecedorId===f.id?'selected':''}>${escapeHtml(f.nome || f.razaoSocial)}</option>`).join('')}
                  </select>
                </td>
                <td style="padding:6px;text-align:right;"><input class="form-control input-cot-preco" type="number" step="0.01" min="0" value="${c.precoUnit || 0}" data-i="${i}" data-j="${j}" style="width:110px;font-size:13px;text-align:right;"></td>
                <td style="padding:6px;"><input class="form-control input-cot-obs" placeholder="link, condições, prazo..." value="${escapeHtml(c.link || c.observacoes || '')}" data-i="${i}" data-j="${j}" style="font-size:13px;"></td>
                <td style="padding:6px;text-align:right;font-weight:700;" class="cell-subtotal" data-i="${i}" data-j="${j}">${Store.formatBRL((parseFloat(c.precoUnit) || 0) * it.qtd)}</td>
                <td style="padding:6px;text-align:center;"><button type="button" class="btn btn-sm btn-ghost btn-rm-cot" data-i="${i}" data-j="${j}" style="color:#DC2626;padding:0 6px;">✕</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('');

    const calcTotal = () => estado.reduce((sum, it) => {
      const c = it.cotacoes[it.cotacaoEscolhidaIdx];
      return sum + (it.qtd * (parseFloat(c?.precoUnit) || 0));
    }, 0);

    const html = `
      <div class="modal-overlay" id="modalAvaliar">
        <div class="modal" style="width:920px;max-width:95vw;max-height:92vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Avaliar / Precificar</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">Solicitante: ${escapeHtml(s.solicitanteNome || '—')} · ${this._fmtDt(s.createdAt)}</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            ${s.justificativa ? `<div style="padding:10px;background:var(--color-surface-2);border-radius:6px;margin-bottom:var(--sp-md);"><strong>Justificativa:</strong><br>${escapeHtml(s.justificativa)}</div>` : ''}
            <div style="padding:10px;background:#EFF6FF;border-left:3px solid #3B82F6;border-radius:4px;margin-bottom:var(--sp-md);font-size:14px;">
              <strong>Destino definido pelo solicitante:</strong> ${(() => { const c = contratos.find(x => x.id === s.contractId); return c ? '🏗️ ' + escapeHtml(c.name) : '🏢 Sede / Almoxarifado Central'; })()}
            </div>

            <h3 style="margin:var(--sp-lg) 0 var(--sp-sm);font-size:16px;">Cotações por item</h3>
            <div id="boxItens">${renderItens()}</div>

            <div style="margin-top:var(--sp-md);text-align:right;font-size:18px;font-weight:800;background:var(--color-surface-2);padding:12px;border-radius:6px;">
              Total estimado: <span id="totalGeral">${Store.formatBRL(calcTotal())}</span>
            </div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <button class="btn btn-secondary" id="btnFechar">Fechar</button>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-danger" id="btnCancelarSol">Cancelar solicitação</button>
              <button class="btn btn-primary" id="btnEnviarAprov">Enviar para aprovação →</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalAvaliar');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFechar').addEventListener('click', close);

    const recalc = () => {
      // Atualiza subtotais e total
      estado.forEach((it, i) => {
        it.cotacoes.forEach((c, j) => {
          const cell = overlay.querySelector(`.cell-subtotal[data-i="${i}"][data-j="${j}"]`);
          if (cell) cell.textContent = Store.formatBRL(it.qtd * (parseFloat(c.precoUnit) || 0));
        });
      });
      document.getElementById('totalGeral').textContent = Store.formatBRL(calcTotal());
    };

    const reRender = () => {
      document.getElementById('boxItens').innerHTML = renderItens();
      bindHandlers();
      recalc();
    };

    const bindHandlers = () => {
      overlay.querySelectorAll('.input-cot-forn').forEach(el => el.addEventListener('change', () => {
        const i = +el.dataset.i, j = +el.dataset.j;
        estado[i].cotacoes[j].fornecedorId = el.value;
        const opt = el.options[el.selectedIndex];
        estado[i].cotacoes[j].fornecedorNome = opt?.dataset?.nome || '';
      }));
      overlay.querySelectorAll('.input-cot-preco').forEach(el => el.addEventListener('input', () => {
        const i = +el.dataset.i, j = +el.dataset.j;
        estado[i].cotacoes[j].precoUnit = parseFloat(el.value) || 0;
        recalc();
      }));
      overlay.querySelectorAll('.input-cot-obs').forEach(el => el.addEventListener('input', () => {
        const i = +el.dataset.i, j = +el.dataset.j;
        estado[i].cotacoes[j].link = el.value;
      }));
      overlay.querySelectorAll('.rd-esc').forEach(el => el.addEventListener('change', () => {
        const i = +el.dataset.i, j = +el.dataset.j;
        estado[i].cotacaoEscolhidaIdx = j;
        recalc();
      }));
      overlay.querySelectorAll('.btn-add-cot').forEach(el => el.addEventListener('click', () => {
        const i = +el.dataset.i;
        estado[i].cotacoes.push({ fornecedorId: '', fornecedorNome: '', precoUnit: 0, link: '', observacoes: '' });
        reRender();
      }));
      overlay.querySelectorAll('.btn-rm-cot').forEach(el => el.addEventListener('click', () => {
        const i = +el.dataset.i, j = +el.dataset.j;
        if (estado[i].cotacoes.length === 1) { window.showToast('Item precisa de ao menos uma cotação', 'error'); return; }
        estado[i].cotacoes.splice(j, 1);
        if (estado[i].cotacaoEscolhidaIdx >= estado[i].cotacoes.length) estado[i].cotacaoEscolhidaIdx = 0;
        reRender();
      }));
    };
    bindHandlers();

    document.getElementById('btnCancelarSol').addEventListener('click', async () => {
      const motivo = prompt('Motivo do cancelamento:');
      if (!motivo || !motivo.trim()) return;
      try {
        const res = await fetch(`/api/solicitacoes-compra/${s.id}/cancelar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo })
        });
        if (!res.ok) throw new Error(await res.text());
        window.showToast('Solicitação cancelada', 'success');
        close();
        this.render();
      } catch (e) { window.showToast(e.message, 'error'); }
    });

    document.getElementById('btnEnviarAprov').addEventListener('click', async () => {
      // Valida: cada item tem ao menos uma cotação com fornecedor + preço > 0
      for (let i = 0; i < estado.length; i++) {
        const it = estado[i];
        if (!it.cotacoes.length) { window.showToast(`Item "${it.descricao}" sem cotações`, 'error'); return; }
        const esc = it.cotacoes[it.cotacaoEscolhidaIdx];
        if (!esc || !esc.fornecedorId || !(parseFloat(esc.precoUnit) > 0)) {
          window.showToast(`Escolha uma cotação válida para "${it.descricao}"`, 'error'); return;
        }
      }
      try {
        const res = await fetch(`/api/solicitacoes-compra/${s.id}/avaliar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itens: estado })
        });
        if (!res.ok) throw new Error(await res.text());
        window.showToast('Enviada para aprovação do gerente', 'success');
        close();
        this.render();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  async cancelar(id) {
    const motivo = prompt('Motivo do cancelamento:');
    if (!motivo || !motivo.trim()) return;
    try {
      const res = await fetch(`/api/solicitacoes-compra/${id}/cancelar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      });
      if (!res.ok) throw new Error(await res.text());
      window.showToast('Solicitação cancelada', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  },

  // ── 3ª etapa: GERENTE aprova/rejeita ──────────────────────────────────
  showModalAprovar(id) {
    const s = (Store.state.solicitacoes_compra || []).find(x => x.id === id);
    if (!s) return;
    const itens = Array.isArray(s.itens) ? s.itens : JSON.parse(s.itens || '[]');
    const contrato = (Store.state.contracts || []).find(c => c.id === s.contractId);
    const destino = contrato ? '🏗️ ' + escapeHtml(contrato.name) : '🏢 Sede / Almoxarifado Central';

    const html = `
      <div class="modal-overlay" id="modalAprovar">
        <div class="modal" style="width:760px;max-width:95vw;max-height:92vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Aprovar Solicitação</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">Pré-aprovada pela equipe de compras · Total: <strong>${Store.formatBRL(parseFloat(s.valorTotal) || 0)}</strong></div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:var(--sp-md);">
              <div><strong>Solicitante:</strong> ${escapeHtml(s.solicitanteNome || '—')}</div>
              <div><strong>Avaliado por:</strong> ${escapeHtml(s.avaliadorNome || '—')}</div>
              <div><strong>Destino:</strong> ${destino}</div>
              <div><strong>Avaliado em:</strong> ${this._fmtDt(s.avaliadoEm)}</div>
            </div>
            ${s.justificativa ? `<div style="padding:10px;background:var(--color-surface-2);border-radius:6px;margin-bottom:var(--sp-md);"><strong>Justificativa:</strong><br>${escapeHtml(s.justificativa)}</div>` : ''}

            <h3 style="margin:var(--sp-md) 0 8px;font-size:15px;">Itens precificados</h3>
            ${itens.map(it => {
              const esc = (it.cotacoes || [])[it.cotacaoEscolhidaIdx];
              return `
                <div class="card" style="padding:10px;margin-bottom:8px;">
                  <div style="display:flex;justify-content:space-between;">
                    <div>
                      <strong>${escapeHtml(it.descricao)}</strong>${this._tipoBadge(it)}
                      <span style="color:var(--color-text-muted);">qtd ${it.qtd} × ${Store.formatBRL(parseFloat(it.precoUnit) || 0)}</span>
                    </div>
                    <strong>${Store.formatBRL(it.qtd * (parseFloat(it.precoUnit) || 0))}</strong>
                  </div>
                  ${esc ? `<div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">Fornecedor escolhido: <strong>${escapeHtml(esc.fornecedorNome || '—')}</strong>${(it.cotacoes || []).length > 1 ? ` · ${it.cotacoes.length} cotações comparadas` : ''}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <button class="btn btn-secondary" id="btnFechar">Fechar</button>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-danger" id="btnRejeitar">Rejeitar</button>
              <button class="btn btn-primary" id="btnAprovar">✅ Aprovar (autorizar compra)</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalAprovar');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFechar').addEventListener('click', close);
    document.getElementById('btnAprovar').addEventListener('click', async () => {
      if (!confirm('Aprovar? A equipe de compras poderá então registrar a compra junto ao fornecedor.')) return;
      try {
        const res = await fetch(`/api/solicitacoes-compra/${id}/aprovar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!res.ok) throw new Error(await res.text());
        window.showToast('Solicitação aprovada', 'success');
        close();
        this.render();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
    document.getElementById('btnRejeitar').addEventListener('click', () => { close(); this.rejeitar(id); });
  },

  async rejeitar(id) {
    const motivo = prompt('Motivo da rejeição (opcional):') ?? null;
    if (motivo === null) return;
    try {
      const res = await fetch(`/api/solicitacoes-compra/${id}/rejeitar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      });
      if (!res.ok) throw new Error(await res.text());
      window.showToast('Solicitação rejeitada', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  },

  async excluir(id) {
    if (!confirm('Excluir esta solicitação?')) return;
    try {
      const res = await fetch(`/api/solicitacoes-compra/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      window.showToast('Solicitação excluída', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  },

  // ── 4ª etapa: EQUIPE DE COMPRAS registra compra (gera CP) ────────────────────
  showModalComprar(id) {
    const s = (Store.state.solicitacoes_compra || []).find(x => x.id === id);
    if (!s) return;
    const fornecedores = Store.state.fornecedores || [];
    const itens = Array.isArray(s.itens) ? s.itens : JSON.parse(s.itens || '[]');
    // Fornecedor padrão = o da cotação escolhida do primeiro item
    const fornecedorPadrao = s.fornecedorId || (itens[0]?.cotacoes?.[itens[0]?.cotacaoEscolhidaIdx]?.fornecedorId) || '';
    const hoje = new Date();
    const venc30 = new Date(hoje.getTime() + 30 * 86400000).toISOString().split('T')[0];
    const html = `
      <div class="modal-overlay" id="modalComprar">
        <div class="modal" style="width:560px;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Registrar compra</h2>
              <div style="font-size:13px;color:var(--color-text-muted);">Vai gerar a Conta a Pagar de ${Store.formatBRL(parseFloat(s.valorTotal) || 0)}</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <form id="formComprar" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Nº do pedido junto ao fornecedor</label>
                <input class="form-control" name="numeroPedido" placeholder="Ex: 12345 / OC-2026-007">
              </div>
              <div class="form-group">
                <label class="form-label">Previsão de entrega</label>
                <input class="form-control" name="dataPrevistaEntrega" type="date">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Fornecedor</label>
                <select class="form-control" name="fornecedorId">
                  <option value="">— Selecionar —</option>
                  ${fornecedores.map(f => `<option value="${f.id}" ${fornecedorPadrao===f.id?'selected':''}>${escapeHtml(f.nome || f.razaoSocial)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Vencimento da CP *</label>
                <input class="form-control" name="dataVencimento" type="date" value="${venc30}" required>
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancC">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvC">Registrar compra (gera CP)</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalComprar');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancC').addEventListener('click', close);

    document.getElementById('btnSalvC').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formComprar'));
      const data = Object.fromEntries(fd);
      try {
        const res = await fetch(`/api/solicitacoes-compra/${id}/comprar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(await res.text());
        window.showToast('Compra registrada — Conta a Pagar gerada', 'success');
        close();
        this.render();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  // ── 5ª etapa: ALMOXARIFE/EQUIPE DE COMPRAS confirma chegada (gera entrada) ───
  showModalReceber(id) {
    const s = (Store.state.solicitacoes_compra || []).find(x => x.id === id);
    if (!s) return;
    const hoje = new Date().toISOString().split('T')[0];
    const itens = Array.isArray(s.itens) ? s.itens : JSON.parse(s.itens || '[]');
    const html = `
      <div class="modal-overlay" id="modalReceber">
        <div class="modal" style="width:560px;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Confirmar chegada do material</h2>
              <div style="font-size:13px;color:var(--color-text-muted);">${itens.length} ${itens.length === 1 ? 'item' : 'itens'} entram no estoque ao confirmar</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <form id="formReceber" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data de recebimento *</label>
                <input class="form-control" name="dataRecebimento" type="date" value="${hoje}" required>
              </div>
              <div class="form-group">
                <label class="form-label">Nº da NF do fornecedor</label>
                <input class="form-control" name="nfRecebimento" placeholder="Opcional">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="obsRecebimento" rows="2" placeholder="Ex: 1 caixa amassada, conferido por ..."></textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancR">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvR">Confirmar chegada (gera entrada)</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalReceber');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancR').addEventListener('click', close);

    document.getElementById('btnSalvR').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formReceber'));
      const data = Object.fromEntries(fd);
      try {
        const res = await fetch(`/api/solicitacoes-compra/${id}/receber`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(await res.text());
        window.showToast('Recebimento confirmado — entrada de estoque gerada', 'success');
        close();
        this.render();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  // ── DETALHE com timeline ──────────────────────────────────────────────
  _renderTimeline(s) {
    const marco = (cor, icone, titulo, sub) => `
      <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:14px;">
        <div style="width:14px;height:14px;border-radius:50%;background:${cor};margin-top:4px;flex-shrink:0;box-shadow:0 0 0 3px ${cor}33;"></div>
        <div>
          <div style="font-weight:700;font-size:14px;">${icone} ${titulo}</div>
          <div style="font-size:13px;color:var(--color-text-muted);">${sub}</div>
        </div>
      </div>
    `;
    const aguardando = (titulo) => `
      <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:14px;opacity:.55;">
        <div style="width:14px;height:14px;border-radius:50%;background:#D1D5DB;margin-top:4px;flex-shrink:0;border:2px dashed #6B7280;"></div>
        <div>
          <div style="font-weight:700;font-size:14px;">⏳ ${titulo}</div>
          <div style="font-size:13px;color:var(--color-text-muted);">—</div>
        </div>
      </div>
    `;

    let html = marco('#3B82F6', '📝', 'Solicitada', `${escapeHtml(s.solicitanteNome || '—')} · ${this._fmtDt(s.createdAt)}`);

    if (s.status === 'cancelada') {
      html += marco('#6B7280', '🚫', 'Cancelada', `${escapeHtml(s.avaliadorNome || '—')} (Equipe de compras) · ${this._fmtDt(s.canceladoEm)}${s.motivoCancelamento ? '<br><em>Motivo: ' + escapeHtml(s.motivoCancelamento) + '</em>' : ''}`);
      return html;
    }

    if (s.avaliadoEm) {
      html += marco('#F59E0B', '💰', `Avaliada (${Store.formatBRL(parseFloat(s.valorTotal) || 0)})`, `${escapeHtml(s.avaliadorNome || '—')} (Equipe de compras) · ${this._fmtDt(s.avaliadoEm)}`);
    } else {
      html += aguardando('Aguardando avaliação da equipe de compras');
      return html;
    }

    if (s.status === 'rejeitada') {
      html += marco('#EF4444', '❌', 'Rejeitada', `${escapeHtml(s.aprovadorNome || '—')} (Gerente) · ${this._fmtDt(s.aprovadoEm)}${s.motivoRejeicao ? '<br><em>Motivo: ' + escapeHtml(s.motivoRejeicao) + '</em>' : ''}`);
      return html;
    }

    if (s.aprovadoEm) {
      html += marco('#3B82F6', '✅', 'Aprovada', `${escapeHtml(s.aprovadorNome || '—')} (Gerente) · ${this._fmtDt(s.aprovadoEm)}`);
    } else {
      html += aguardando('Aguardando aprovação do gerente');
      return html;
    }

    if (s.compradoEm) {
      const det = `${escapeHtml(s.compradorNome || '—')} (Equipe de compras) · ${this._fmtDt(s.compradoEm)}` +
        (s.numeroPedido ? `<br>Pedido: <code>${escapeHtml(s.numeroPedido)}</code>` : '') +
        (s.contaPagarId ? `<br>Conta a Pagar: <code>${s.contaPagarId.slice(-8)}</code>` : '') +
        (s.dataPrevistaEntrega ? `<br>Previsão de entrega: ${new Date(s.dataPrevistaEntrega + 'T12:00:00').toLocaleDateString('pt-BR')}` : '');
      html += marco('#6366F1', '📦', 'Comprada', det);
    } else {
      html += aguardando('Aguardando compra pela equipe de compras');
      return html;
    }

    if (s.recebidoEm) {
      const det = `${escapeHtml(s.recebedorNome || '—')} · ${this._fmtDt(s.recebidoEm)}` +
        (s.dataRecebimento ? `<br>Data: ${new Date(s.dataRecebimento + 'T12:00:00').toLocaleDateString('pt-BR')}` : '') +
        (s.nfRecebimento ? `<br>NF: <code>${escapeHtml(s.nfRecebimento)}</code>` : '') +
        (s.obsRecebimento ? `<br><em>${escapeHtml(s.obsRecebimento)}</em>` : '');
      html += marco('#10B981', '🏭', 'Recebida (estoque atualizado)', det);
    } else {
      html += aguardando('Aguardando chegada do material');
    }
    return html;
  },

  showDetalhe(id) {
    const s = (Store.state.solicitacoes_compra || []).find(x => x.id === id);
    if (!s) return;
    const itens = Array.isArray(s.itens) ? s.itens : JSON.parse(s.itens || '[]');
    const contrato = (Store.state.contracts || []).find(c => c.id === s.contractId);

    const html = `
      <div class="modal-overlay" id="modalDetalheSol">
        <div class="modal" style="width:780px;max-width:95vw;max-height:92vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Solicitação #${s.numero || s.id.slice(-6)}</h2>
              <div style="margin-top:4px;">${this._badgeEtapa(s.status)}</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div style="display:grid;grid-template-columns:2fr 3fr;gap:var(--sp-lg);">
              <div>
                <h3 style="margin:0 0 var(--sp-sm);font-size:15px;">Linha do tempo</h3>
                ${this._renderTimeline(s)}
              </div>
              <div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:var(--sp-md);font-size:14px;">
                  <div><strong>Destino:</strong><br>${s.status === 'pendente_avaliacao' ? '<em>(a definir)</em>' : (contrato ? '🏗️ ' + escapeHtml(contrato.name) : '🏢 Sede')}</div>
                  <div><strong>Valor total:</strong><br>${s.status === 'pendente_avaliacao' ? '—' : Store.formatBRL(parseFloat(s.valorTotal) || 0)}</div>
                </div>
                ${s.justificativa ? `<div style="padding:10px;background:var(--color-surface-2);border-radius:6px;margin-bottom:var(--sp-md);font-size:14px;"><strong>Justificativa:</strong><br>${escapeHtml(s.justificativa)}</div>` : ''}
                <h3 style="margin:0 0 8px;font-size:15px;">Itens (${itens.length})</h3>
                ${itens.map(it => {
                  const esc = (it.cotacoes || [])[it.cotacaoEscolhidaIdx];
                  return `
                    <div style="padding:8px 10px;border:1px solid var(--color-border);border-radius:6px;margin-bottom:6px;font-size:13px;">
                      <div style="display:flex;justify-content:space-between;">
                        <strong>${escapeHtml(it.descricao)}${this._tipoBadge(it)}</strong>
                        <span>qtd ${it.qtd}${(it.precoUnit) ? ` · ${Store.formatBRL(it.precoUnit)} = ${Store.formatBRL(it.qtd * it.precoUnit)}` : ''}</span>
                      </div>
                      ${it.observacoes ? `<div style="color:var(--color-text-muted);font-size:12px;">${escapeHtml(it.observacoes)}</div>` : ''}
                      ${esc ? `<div style="color:var(--color-text-muted);font-size:12px;margin-top:2px;">Fornecedor: <strong>${escapeHtml(esc.fornecedorNome || '—')}</strong>${(it.cotacoes || []).length > 1 ? ` · ${it.cotacoes.length} cotações` : ''}</div>` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
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
  },
};
