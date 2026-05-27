/**
 * View: Propostas Comerciais (#/proposta)
 *
 * Lista todas as propostas com filtros por status (chips), busca livre e
 * modal "+ Nova Proposta" que reusa o <select> de clientes (padrão Contratos.js).
 * Ao criar, o backend já cria automaticamente um contrato em prospecção
 * vinculado via metadata.propostaId.
 */
window.Propostas = {
  currentFilter: 'todos',
  busca: '',

  STATUS_LABELS: {
    rascunho:  'Rascunho',
    enviada:   'Enviada',
    aceita:    'Aceita',
    rejeitada: 'Rejeitada',
    expirada:  'Expirada',
  },

  STATUS_COLORS: {
    rascunho:  { bg: 'rgba(148,163,184,.18)', fg: '#64748b', border: 'rgba(148,163,184,.40)' },
    enviada:   { bg: 'rgba(59,130,246,.18)',  fg: '#3b82f6', border: 'rgba(59,130,246,.40)' },
    aceita:    { bg: 'rgba(16,185,129,.18)',  fg: '#10b981', border: 'rgba(16,185,129,.40)' },
    rejeitada: { bg: 'rgba(220,38,38,.18)',   fg: '#dc2626', border: 'rgba(220,38,38,.40)' },
    expirada:  { bg: 'rgba(245,158,11,.18)',  fg: '#f59e0b', border: 'rgba(245,158,11,.40)' },
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando propostas...</div>';

    try {
      await Store.loadFor(['propostas', 'clientes']);

      let propostas = Store.state.propostas || [];

      // Filtro de status
      if (this.currentFilter !== 'todos') {
        propostas = propostas.filter(p => p.status === this.currentFilter);
      }

      // Busca livre
      const termo = (this.busca || '').toLowerCase().trim();
      if (termo) {
        propostas = propostas.filter(p =>
          (p.numero || '').toLowerCase().includes(termo) ||
          (p.titulo || '').toLowerCase().includes(termo) ||
          (p.clienteEmpresa || '').toLowerCase().includes(termo) ||
          (p.clienteNome || '').toLowerCase().includes(termo) ||
          (p.referencia || '').toLowerCase().includes(termo)
        );
      }

      const totalGeral = Store.state.propostas.length;
      const contagemPorStatus = (Store.state.propostas || []).reduce((acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {});

      const valorTotal = (Store.state.propostas || [])
        .filter(p => ['aceita','enviada'].includes(p.status))
        .reduce((s, p) => s + (parseFloat(p.valorTotal) || 0), 0);
      const filtroAtivo = !!(termo || this.currentFilter !== 'todos');

      const headerHtml = window.UIKit?.pageHeader ? window.UIKit.pageHeader({
        title: 'Propostas Comerciais',
        subtitle: filtroAtivo
          ? `${propostas.length} de ${totalGeral} proposta${totalGeral !== 1 ? 's' : ''}`
          : `${totalGeral} proposta${totalGeral !== 1 ? 's' : ''} no total`,
        actions: `
          <a class="btn btn-secondary" href="#/apresentacao" title="Apresentação da empresa">🏢 Apresentação</a>
          <a class="btn btn-secondary" href="#/clausulas" title="Biblioteca de cláusulas">📖 Cláusulas</a>
          <button class="btn btn-primary btn-lg" id="btnNovaProposta">+ Nova Proposta</button>`,
      }) : '';

      const kpisHtml = window.UIKit?.kpiGrid ? window.UIKit.kpiGrid([
        { label: 'Total',            value: totalGeral,                       color: 'var(--color-primary)' },
        { label: 'Enviadas',         value: contagemPorStatus.enviada || 0,   color: 'var(--color-info)' },
        { label: 'Aceitas',          value: contagemPorStatus.aceita || 0,    color: 'var(--color-success)',
          hint: `${Math.round((contagemPorStatus.aceita||0)/Math.max(totalGeral,1)*100)}% de conversão` },
        { label: 'Pipeline (aceitas+enviadas)', value: Store.formatBRL(valorTotal), color: 'var(--color-violet)' },
      ]) : '';

      const toolbarHtml = window.UIKit?.toolbar ? window.UIKit.toolbar({
        search: { id: 'inputBusca', value: this.busca, label: 'Buscar',
                  placeholder: 'Número, título, cliente ou referência...' },
        showClear: filtroAtivo, clearId: 'btnLimparPropostas',
      }) : '';

      const chipsHtml = window.UIKit?.chips ? window.UIKit.chips([
        { value:'todos',     label:'Todos',     count: totalGeral, active: this.currentFilter === 'todos' },
        { value:'rascunho',  label:'Rascunho',  count: contagemPorStatus.rascunho  || 0, active: this.currentFilter === 'rascunho' },
        { value:'enviada',   label:'Enviada',   count: contagemPorStatus.enviada   || 0, active: this.currentFilter === 'enviada' },
        { value:'aceita',    label:'Aceita',    count: contagemPorStatus.aceita    || 0, active: this.currentFilter === 'aceita' },
        { value:'rejeitada', label:'Rejeitada', count: contagemPorStatus.rejeitada || 0, active: this.currentFilter === 'rejeitada' },
        { value:'expirada',  label:'Expirada',  count: contagemPorStatus.expirada  || 0, active: this.currentFilter === 'expirada' },
      ], { name: 'propostas-status', inCard: true }) : '';

      const html = `
        ${headerHtml}
        ${kpisHtml}
        ${toolbarHtml}

        <div class="card">
          ${chipsHtml}
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Título</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Emissão</th>
                  <th>Status</th>
                  <th>Contrato</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${propostas.length === 0 ? `
                  <tr><td colspan="9" style="padding:0;">${window.UIKit?.empty ? window.UIKit.empty(
                    (termo || this.currentFilter !== 'todos')
                      ? { icon:'🔎', title:'Nenhuma proposta nesse filtro', desc:'Tente limpar os filtros ou ajustar a busca.' }
                      : { icon:'📝', title:'Nenhuma proposta cadastrada',
                          desc:'Comece criando sua primeira proposta — gere PDF/DOCX em timbrado, anexe portfolio e envie ao cliente.',
                          cta:'<button class="btn btn-primary" onclick="document.getElementById(\'btnNovaProposta\')?.click()">+ Criar primeira proposta</button>' }
                  ) : 'Nenhuma proposta'}</td></tr>
                ` : propostas.map(p => this._renderRow(p)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      app.innerHTML = html;
      this._attachEvents();
    } catch (e) {
      console.error('[Propostas] erro ao renderizar:', e);
      app.innerHTML = `<div class="error-banner">Erro ao carregar propostas: ${escapeHtml(e.message)}</div>`;
    }
  },

  _renderRow(p) {
    const tipoLabel = { hh: 'HH', material: 'Material', ambos: 'HH + Material' }[p.tipo] || p.tipo;
    const valor = Store.formatBRL(parseFloat(p.valorTotal) || 0);
    const numeroCompleto = `PC_${p.numero}-${String(p.ano).padStart(2,'0')}${p.revisao > 0 ? ` Rev.${String(p.revisao).padStart(2,'0')}` : ''}`;
    const cliente = p.clienteEmpresa || p.clienteNome || '—';
    const status = p.status || 'rascunho';
    const cor = this.STATUS_COLORS[status] || this.STATUS_COLORS.rascunho;

    return `
      <tr class="row-proposta" data-id="${p.id}" style="cursor:pointer;" title="Clique para abrir o editor">
        <td><strong>${escapeHtml(numeroCompleto)}</strong></td>
        <td>${escapeHtml(p.titulo) || '—'}</td>
        <td>${escapeHtml(cliente)}</td>
        <td><span class="badge" style="background:rgba(31,73,125,.12);color:#1F497D;">${tipoLabel}</span></td>
        <td><strong>${valor}</strong></td>
        <td>${this._fmtDate(p.dataEmissao)}</td>
        <td>
          <span class="badge" style="background:${cor.bg};color:${cor.fg};border:1px solid ${cor.border};padding:3px 10px;border-radius:12px;font-size:12px;">
            ${this.STATUS_LABELS[status] || status}
          </span>
        </td>
        <td>
          ${p.contratoId
            ? `<a href="#/contratos/${p.contratoId}" class="action-link js-stop" title="Ver contrato vinculado">🔗 Ver</a>`
            : '<span class="text-muted">—</span>'}
        </td>
        <td>
          <div class="actions-cell js-stop">
            <a class="action-link" href="#/proposta/${p.id}">Editar</a>
            <a class="action-link btn-duplicar" data-id="${p.id}" title="Nova revisão">Rev.+1</a>
            <a class="action-link danger btn-excluir" data-id="${p.id}">Excluir</a>
          </div>
        </td>
      </tr>
    `;
  },

  _fmtDate(d) {
    if (!d) return '—';
    try {
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return d; }
  },

  _attachEvents() {
    // Chips de status (novo padrão UIKit usa data-value dentro de [data-chips])
    document.querySelectorAll('[data-chips="propostas-status"] .rh-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentFilter = btn.dataset.value || 'todos';
        this.render();
      });
    });
    // Botão limpar
    document.getElementById('btnLimparPropostas')?.addEventListener('click', () => {
      this.busca = ''; this.currentFilter = 'todos'; this.render();
    });

    // Busca (debounce)
    const inputBusca = document.getElementById('inputBusca');
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

    // Linha da tabela → abre editor
    document.querySelectorAll('.row-proposta').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.id;
        location.hash = `#/proposta/${id}`;
      });
    });

    // Duplicar (nova revisão)
    document.querySelectorAll('.btn-duplicar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('Criar nova revisão dessa proposta? A revisão atual ficará arquivada para histórico.')) return;
        try {
          const j = await Store.duplicarProposta(id);
          if (window.showToast) showToast('Nova revisão criada', 'success');
          if (j.proposta) location.hash = `#/proposta/${j.proposta.id}`;
          else this.render();
        } catch (e) {
          if (window.showToast) showToast('Erro: ' + e.message, 'error');
        }
      });
    });

    // Excluir
    document.querySelectorAll('.btn-excluir').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const p = (Store.state.propostas || []).find(x => x.id === id);
        const numero = p ? `PC_${p.numero}-${String(p.ano).padStart(2,'0')}` : 'esta proposta';
        if (!confirm(`Excluir ${numero}? O contrato em prospecção vinculado NÃO será apagado, apenas desvinculado.`)) return;
        try {
          await Store.deletarProposta(id);
          if (window.showToast) showToast('Proposta excluída', 'success');
          this.render();
        } catch (e) {
          if (window.showToast) showToast('Erro: ' + e.message, 'error');
        }
      });
    });

    // + Nova Proposta
    const btnNova = document.getElementById('btnNovaProposta');
    if (btnNova) btnNova.addEventListener('click', () => this.showModalNova());
  },

  showModalNova(prefill = {}) {
    const clientes = Store.state.clientes || [];
    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:640px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">Nova Proposta Comercial</h2>
            <button class="modal-close" id="btnFecharModal">✕</button>
          </div>
          <form id="formNovaProposta" class="modal-content">
            <div class="form-group">
              <label class="form-label">Cliente *</label>
              <select class="form-control" name="clienteId" id="selectCliente" required>
                <option value="">— Selecione um cliente —</option>
                ${clientes.map(c => `
                  <option value="${c.id}" ${prefill.clienteId === c.id ? 'selected' : ''}>
                    ${escapeHtml(c.empresa || c.nome)}${c.nome && c.empresa && c.nome !== c.empresa ? ' (' + escapeHtml(c.nome) + ')' : ''}
                  </option>
                `).join('')}
              </select>
              <small class="form-hint">Os dados do cliente (nome, contato, email, telefone, endereço) serão preenchidos automaticamente.</small>
            </div>

            <div class="form-group">
              <label class="form-label">Título da Proposta *</label>
              <input type="text" class="form-control" name="titulo" required placeholder="Ex: Fabricação e montagem de tubulação industrial">
            </div>

            <div class="form-group">
              <label class="form-label">Referência / Identificação da Obra</label>
              <input type="text" class="form-control" name="referencia" placeholder="Ex: Linha L-202 — Tanque T-401">
            </div>

            <div class="form-group">
              <label class="form-label">Tipo *</label>
              <div style="display:flex;gap:8px;">
                <label class="radio-card" style="flex:1;cursor:pointer;border:1.5px solid var(--color-border, #ccc);border-radius:8px;padding:10px;text-align:center;">
                  <input type="radio" name="tipo" value="hh" style="display:none;">
                  <div style="font-weight:600;">Mão de Obra (HH)</div>
                  <small class="text-muted">Apenas serviço/horas</small>
                </label>
                <label class="radio-card" style="flex:1;cursor:pointer;border:1.5px solid var(--color-border, #ccc);border-radius:8px;padding:10px;text-align:center;">
                  <input type="radio" name="tipo" value="material" style="display:none;">
                  <div style="font-weight:600;">Material</div>
                  <small class="text-muted">Apenas fornecimento</small>
                </label>
                <label class="radio-card is-selected" style="flex:1;cursor:pointer;border:1.5px solid var(--color-primary, #1F497D);background:rgba(31,73,125,.06);border-radius:8px;padding:10px;text-align:center;">
                  <input type="radio" name="tipo" value="ambos" style="display:none;" checked>
                  <div style="font-weight:600;">HH + Material</div>
                  <small class="text-muted">Completo</small>
                </label>
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">Criar Proposta</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => {
      const ov = document.getElementById('modalOverlay');
      if (ov) ov.remove();
    };
    document.getElementById('btnFecharModal').addEventListener('click', close);
    document.getElementById('btnCancelar').addEventListener('click', close);

    // Radio cards
    document.querySelectorAll('.radio-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.radio-card').forEach(c => {
          c.classList.remove('is-selected');
          c.style.border = '1.5px solid var(--color-border, #ccc)';
          c.style.background = '';
        });
        card.classList.add('is-selected');
        card.style.border = '1.5px solid var(--color-primary, #1F497D)';
        card.style.background = 'rgba(31,73,125,.06)';
        const radio = card.querySelector('input[type=radio]');
        if (radio) radio.checked = true;
      });
    });

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const form = document.getElementById('formNovaProposta');
      const fd = new FormData(form);
      const data = Object.fromEntries(fd);

      if (!data.titulo || !data.titulo.trim()) {
        if (window.showToast) showToast('Título é obrigatório', 'warning');
        return;
      }
      if (!data.clienteId) {
        if (window.showToast) showToast('Selecione um cliente', 'warning');
        return;
      }

      try {
        const j = await Store.criarProposta({
          clienteId: data.clienteId,
          titulo: data.titulo.trim(),
          referencia: data.referencia ? data.referencia.trim() : null,
          tipo: data.tipo || 'ambos',
        });
        close();
        if (window.showToast) {
          showToast(`Proposta PC_${j.proposta.numero}-${String(j.proposta.ano).padStart(2,'0')} criada — contrato em prospecção gerado`, 'success');
        }
        if (j.proposta) location.hash = `#/proposta/${j.proposta.id}`;
      } catch (e) {
        console.error('[Propostas] erro ao criar:', e);
        if (window.showToast) showToast('Erro: ' + e.message, 'error');
      }
    });
  },
};
