window.Caixa = {
  filters: { mes: '', dateFrom: '', dateTo: '', type: 'todos', contractId: '' },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();

      const num = v => parseFloat(v) || 0;
      const hojeStr = new Date().toISOString().split('T')[0];

      // Separar lançamentos passados/hoje dos futuros
      const caixaPassado = Store.state.caixa.filter(e => (e.date || '') <= hojeStr);
      const caixaFuturo  = Store.state.caixa.filter(e => (e.date || '') > hojeStr);

      // Aplicar filtros apenas nos lançamentos reais (passado + hoje)
      let filtered = caixaPassado;

      if (this.filters.mes) {
        filtered = filtered.filter(e => (e.date || '').slice(0, 7) === this.filters.mes);
      }
      if (this.filters.dateFrom) filtered = filtered.filter(e => e.date >= this.filters.dateFrom);
      if (this.filters.dateTo)   filtered = filtered.filter(e => e.date <= this.filters.dateTo);
      if (this.filters.type !== 'todos') filtered = filtered.filter(e => e.type === this.filters.type);
      if (this.filters.contractId) filtered = filtered.filter(e => e.contractId === this.filters.contractId);

      // Cálculos (parseFloat garante que strings viram números)
      const totalEntradas = filtered.filter(e => e.type === 'entrada').reduce((s, e) => s + num(e.value), 0);
      const totalSaidas   = filtered.filter(e => e.type === 'saida').reduce((s, e) => s + num(e.value), 0);
      const saldo         = totalEntradas - totalSaidas;

      // Saldo geral real (transações até hoje)
      const saldoGeral = caixaPassado.reduce((s, e) => e.type === 'entrada' ? s + num(e.value) : s - num(e.value), 0);

      // Lançamentos futuros: caixa com data futura + contas a pagar pendentes + NFs previstas
      const contasFuturas = (Store.state.contas_pagar || []).filter(c => c.status === 'pendente');
      const futEntradas = caixaFuturo.filter(e => e.type === 'entrada');
      const futSaidas   = caixaFuturo.filter(e => e.type === 'saida');

      // NFs pendentes de emissão → entrada prevista em dataLimite + prazoRecebimento dias
      const nfsFuturas = (Store.state.notas_fiscais || [])
        .filter(nf => !nf.emitida && nf.valor > 0)
        .map(nf => {
          const prazo = parseInt(nf.prazoRecebimento) || 30;
          const dtBase = new Date(nf.dataLimite + 'T12:00:00');
          dtBase.setDate(dtBase.getDate() + prazo);
          const expectedDate = dtBase.toISOString().split('T')[0];
          const contrato = (Store.state.contracts || []).find(c => c.id === nf.contractId);
          return {
            date: expectedDate,
            desc: `NF ${nf.numero || ''}${contrato ? ` — ${contrato.name}` : ''}`.trim(),
            tipo: 'entrada',
            origem: `NF prevista · emissão até ${new Date(nf.dataLimite + 'T12:00:00').toLocaleDateString('pt-BR')} +${prazo}d`,
            valor: num(nf.valor)
          };
        });

      const totalFutEntradas = futEntradas.reduce((s, e) => s + num(e.value), 0)
                             + nfsFuturas.reduce((s, e) => s + e.valor, 0);
      const totalFutSaidas   = futSaidas.reduce((s, e) => s + num(e.value), 0)
                             + contasFuturas.reduce((s, c) => s + num(c.valor), 0);
      const saldoProjetado   = saldoGeral + totalFutEntradas - totalFutSaidas;

      // Lista de meses disponíveis (somente passado/hoje)
      const mesesDisponiveis = [...new Set(caixaPassado.map(e => (e.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();

      // Agrupar por mês para a visão mensal
      const porMes = {};
      filtered.forEach(e => {
        const ym = (e.date || '').slice(0, 7);
        if (!porMes[ym]) porMes[ym] = { entradas: 0, saidas: 0, count: 0 };
        if (e.type === 'entrada') porMes[ym].entradas += num(e.value);
        else porMes[ym].saidas += num(e.value);
        porMes[ym].count++;
      });
      const mesesAgrupados = Object.entries(porMes).sort(([a], [b]) => b.localeCompare(a));

      const filtrosAtivos = this.filters.mes || this.filters.dateFrom || this.filters.dateTo ||
                            this.filters.type !== 'todos' || this.filters.contractId;

      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Caixa — Lançamentos</h1>
            <p class="page-subtitle">
              Saldo atual da empresa: <strong style="color:${saldoGeral >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${Store.formatBRL(saldoGeral)}</strong>
            </p>
          </div>
        </div>

        <!-- KPIs do período filtrado -->
        <div class="stat-grid">
          <div class="card stat-card">
            <div class="stat-value" style="color:var(--color-success);">+${Store.formatBRL(totalEntradas)}</div>
            <div class="stat-label">Total Entradas ${filtrosAtivos ? '(filtrado)' : ''}</div>
          </div>
          <div class="card stat-card">
            <div class="stat-value" style="color:var(--color-danger);">-${Store.formatBRL(totalSaidas)}</div>
            <div class="stat-label">Total Saídas ${filtrosAtivos ? '(filtrado)' : ''}</div>
          </div>
          <div class="card stat-card">
            <div class="stat-value" style="color:${saldo >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${Store.formatBRL(saldo)}</div>
            <div class="stat-label">Saldo ${filtrosAtivos ? '(filtrado)' : 'Realizado'}</div>
          </div>
          <div class="card stat-card" style="border:1px dashed var(--color-border);">
            <div class="stat-value" style="color:${saldoProjetado >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${Store.formatBRL(saldoProjetado)}</div>
            <div class="stat-label">Saldo Projetado</div>
          </div>
        </div>

        <!-- Lançamentos Futuros -->
        ${(futEntradas.length > 0 || futSaidas.length > 0 || contasFuturas.length > 0 || nfsFuturas.length > 0) ? `
        <div class="card" style="margin-bottom:var(--sp-lg);border:1px dashed var(--color-border);">
          <div class="card-header" style="background:transparent;">
            <h3 class="card-title" style="color:var(--color-text-muted);">⏳ Lançamentos Futuros</h3>
            <div style="font-size:15px;color:var(--color-text-muted);">
              +${Store.formatBRL(totalFutEntradas)} entradas · -${Store.formatBRL(totalFutSaidas)} saídas
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Origem</th>
                  <th style="text-align:right;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${[
                  ...futEntradas.map(e => ({ date: e.date, desc: e.description, tipo: 'entrada', origem: 'Caixa agendado', valor: num(e.value) })),
                  ...futSaidas.map(e => ({ date: e.date, desc: e.description, tipo: 'saida', origem: 'Caixa agendado', valor: num(e.value) })),
                  ...nfsFuturas,
                  ...contasFuturas.map(c => {
                    const dias = Math.floor((new Date(c.dataVencimento) - new Date()) / 86400000);
                    const label = dias < 0 ? `${Math.abs(dias)}d vencida` : dias === 0 ? 'vence hoje' : `em ${dias}d`;
                    return { date: c.dataVencimento || '9999-99-99', desc: c.descricao + (c.numeroNF ? ` — NF ${c.numeroNF}` : ''), tipo: 'saida', origem: `Conta a Pagar · ${label}`, valor: num(c.valor) };
                  })
                ].sort((a, b) => a.date.localeCompare(b.date)).map(item => `
                  <tr style="opacity:0.8;">
                    <td style="color:var(--color-text-muted);font-style:italic;">${item.date && item.date !== '9999-99-99' ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    <td style="color:var(--color-text-muted);">${escapeHtml(item.desc)}</td>
                    <td><span class="badge" style="background:${item.tipo === 'entrada' ? 'rgba(56,161,105,.12)' : 'rgba(229,62,62,.12)'};color:${item.tipo === 'entrada' ? 'var(--color-success)' : 'var(--color-danger)'};border:1px dashed ${item.tipo === 'entrada' ? 'var(--color-success)' : 'var(--color-danger)'};">${item.tipo}</span></td>
                    <td style="font-size:15px;color:var(--color-text-muted);">${item.origem}</td>
                    <td style="text-align:right;font-weight:700;color:${item.tipo === 'entrada' ? 'var(--color-success)' : 'var(--color-danger)'};">
                      ${item.tipo === 'entrada' ? '+' : '-'}${Store.formatBRL(item.valor)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}

        <!-- Filtros -->
        <div class="card" style="margin-bottom:var(--sp-lg);padding:var(--sp-md);">
          <div style="display:flex;gap:var(--sp-md);flex-wrap:wrap;align-items:flex-end;">
            <div style="flex:1;min-width:160px;">
              <label style="display:block;font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Mês</label>
              <select class="form-control" id="filterMes">
                <option value="">Todos os meses</option>
                ${mesesDisponiveis.map(m => `
                  <option value="${m}" ${this.filters.mes === m ? 'selected' : ''}>${this.formatarMes(m)}</option>
                `).join('')}
              </select>
            </div>
            <div style="flex:1;min-width:160px;">
              <label style="display:block;font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Projeto/Contrato</label>
              <select class="form-control" id="filterContract">
                <option value="">Todos os contratos</option>
                ${Store.state.contracts.map(c => `
                  <option value="${c.id}" ${this.filters.contractId === c.id ? 'selected' : ''}>${escapeHtml(c.name)} — ${escapeHtml(c.client)}</option>
                `).join('')}
              </select>
            </div>
            <div style="flex:0 0 140px;">
              <label style="display:block;font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Tipo</label>
              <select class="form-control" id="filterType">
                <option value="todos">Todos</option>
                <option value="entrada" ${this.filters.type === 'entrada' ? 'selected' : ''}>Entrada</option>
                <option value="saida"   ${this.filters.type === 'saida'   ? 'selected' : ''}>Saída</option>
              </select>
            </div>
            <div style="flex:1;min-width:140px;">
              <label style="display:block;font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">De</label>
              <input class="form-control" type="date" id="filterFrom" value="${this.filters.dateFrom}">
            </div>
            <div style="flex:1;min-width:140px;">
              <label style="display:block;font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Até</label>
              <input class="form-control" type="date" id="filterTo" value="${this.filters.dateTo}">
            </div>
            <button class="btn btn-secondary" id="btnLimparFiltros">Limpar</button>
          </div>
          ${filtrosAtivos ? `
            <div style="margin-top:var(--sp-sm);padding-top:var(--sp-sm);border-top:1px solid var(--color-border);font-size:15px;color:var(--color-primary);">
              ✓ Filtros ativos · ${filtered.length} de ${caixaPassado.length} lançamento${caixaPassado.length !== 1 ? 's' : ''}
            </div>
          ` : ''}
        </div>

        <!-- Resumo por mês (quando não há filtro de mês específico) -->
        ${!this.filters.mes && mesesAgrupados.length > 1 ? `
          <div class="card mb-2xl">
            <div class="card-header">
              <h3 class="card-title">Resumo por Mês</h3>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th style="text-align:right;">Entradas</th>
                    <th style="text-align:right;">Saídas</th>
                    <th style="text-align:right;">Saldo</th>
                    <th style="text-align:right;">Lançamentos</th>
                  </tr>
                </thead>
                <tbody>
                  ${mesesAgrupados.map(([ym, dados]) => {
                    const saldoMes = dados.entradas - dados.saidas;
                    return `
                      <tr style="cursor:pointer;" class="row-filtrar-mes" data-mes="${ym}">
                        <td><strong>${this.formatarMes(ym)}</strong></td>
                        <td style="text-align:right;color:var(--color-success);font-weight:600;">+${Store.formatBRL(dados.entradas)}</td>
                        <td style="text-align:right;color:var(--color-danger);font-weight:600;">-${Store.formatBRL(dados.saidas)}</td>
                        <td style="text-align:right;font-weight:700;color:${saldoMes >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${Store.formatBRL(saldoMes)}</td>
                        <td style="text-align:right;">${dados.count}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
            <div style="margin-top:var(--sp-sm);font-size:15px;color:var(--color-text-muted);text-align:center;">Clique em um mês para filtrar</div>
          </div>
        ` : ''}

        <!-- Tabela de lançamentos -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Lançamentos ${this.filters.mes ? `· ${this.formatarMes(this.filters.mes)}` : ''}</h3>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Projeto/Contrato</th>
                  <th>Categoria</th>
                  <th style="text-align:right;">Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="7" class="text-center text-muted" style="padding:var(--sp-xl);">Nenhum lançamento encontrado</td>
                  </tr>
                ` : [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => {
                  const contract = e.contractId ? Store.getContractById(e.contractId) : null;
                  return `
                    <tr>
                      <td>${new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                      <td><strong>${escapeHtml(e.description)}</strong></td>
                      <td><span class="badge badge-${e.type}">${e.type}</span></td>
                      <td>${contract
                        ? `<a href="#/contratos/${contract.id}" style="color:var(--color-primary);text-decoration:none;font-weight:500;">${escapeHtml(contract.name)}</a><div style="font-size:15px;color:var(--color-text-muted);">${escapeHtml(contract.client)}</div>`
                        : (e.baseItemId ? '<span style="color:var(--color-info);">BASE</span>' : '<span style="color:var(--color-text-muted);">—</span>')}</td>
                      <td>${(() => {
                        if (e.contaPagarId || e.category === 'conta_pagar') return `<span style="font-size:15px;font-weight:600;color:var(--color-danger);background:rgba(229,62,62,.1);padding:2px 7px;border-radius:4px;">Conta a Pagar</span>`;
                        if (e.nfId || e.category === 'nota_fiscal') return `<span style="font-size:15px;font-weight:600;color:var(--color-success);background:rgba(56,161,105,.1);padding:2px 7px;border-radius:4px;">Conta a Receber</span>`;
                        if (e.baseItemId) return `<span style="font-size:15px;font-weight:600;color:var(--color-info);background:rgba(49,130,206,.1);padding:2px 7px;border-radius:4px;">BASE</span>`;
                        return `<span style="font-size:15px;color:var(--color-text-muted);">Manual</span>`;
                      })()}</td>
                      <td style="text-align:right;font-weight:700;color:${e.type === 'entrada' ? 'var(--color-success)' : 'var(--color-danger)'};">
                        ${e.type === 'entrada' ? '+' : '-'}${Store.formatBRL(num(e.value))}
                      </td>
                      <td>
                        <div class="actions-cell">
                          <a class="action-link btn-editar" data-id="${e.id}">Editar</a>
                          <a class="action-link danger btn-excluir" data-id="${e.id}">Excluir</a>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              ${filtered.length > 0 ? `
                <tfoot>
                  <tr style="background:var(--color-bg);font-weight:700;">
                    <td colspan="5" style="padding:var(--sp-md);">Total</td>
                    <td style="text-align:right;padding:var(--sp-md);color:${saldo >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${Store.formatBRL(saldo)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              ` : ''}
            </table>
          </div>
        </div>
      `;

      app.innerHTML = html;

      // Listeners de filtros
      document.getElementById('filterMes').addEventListener('change', e => {
        this.filters.mes = e.target.value;
        this.filters.dateFrom = '';
        this.filters.dateTo = '';
        this.render();
      });
      document.getElementById('filterContract').addEventListener('change', e => {
        this.filters.contractId = e.target.value; this.render();
      });
      document.getElementById('filterType').addEventListener('change', e => {
        this.filters.type = e.target.value; this.render();
      });
      document.getElementById('filterFrom').addEventListener('change', e => {
        this.filters.dateFrom = e.target.value; this.filters.mes = ''; this.render();
      });
      document.getElementById('filterTo').addEventListener('change', e => {
        this.filters.dateTo = e.target.value; this.filters.mes = ''; this.render();
      });
      document.getElementById('btnLimparFiltros').addEventListener('click', () => {
        this.filters = { mes: '', dateFrom: '', dateTo: '', type: 'todos', contractId: '' };
        this.render();
      });

      // Clicar em linha do resumo mensal filtra
      document.querySelectorAll('.row-filtrar-mes').forEach(row => {
        row.addEventListener('click', e => {
          this.filters.mes = e.currentTarget.dataset.mes;
          this.render();
        });
      });

      document.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', e => this.showModal(e.target.dataset.id));
      });
      document.querySelectorAll('.btn-excluir').forEach(btn => {
        btn.addEventListener('click', e => this.deleteEntry(e.target.dataset.id));
      });
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar caixa. Tente novamente.</p></div>';
    }
  },

  formatarMes(ym) {
    if (!ym) return '';
    const [ano, mes] = ym.split('-').map(Number);
    const d = new Date(ano, mes - 1, 1);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
  },

  showModal(entryId) {
    const entry = entryId ? Store.state.caixa.find(e => e.id === entryId) : null;
    const title = entry ? 'Editar Lançamento' : 'Novo Lançamento';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formEntrada" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tipo *</label>
                <select class="form-control" name="type" id="selectType" required>
                  <option value="entrada" ${entry?.type === 'entrada' ? 'selected' : ''}>Entrada</option>
                  <option value="saida"   ${entry?.type === 'saida'   ? 'selected' : ''}>Saída</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Data *</label>
                <input class="form-control" name="date" type="date" value="${entry?.date || new Date().toISOString().split('T')[0]}" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input class="form-control" name="description" value="${entry?.description || ''}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Valor (BRL) *</label>
                <input class="form-control" name="value" type="text" data-currency inputmode="numeric" value="${entry?.value ? window.BRLInput.toDisplay(entry.value) : ''}" placeholder="0,00" required>
              </div>
              <div class="form-group">
                <label class="form-label">Categoria</label>
                <input class="form-control" name="category" value="${entry?.category || ''}" placeholder="Ex: Adiantamento, Pagamento...">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Vincular a Contrato</label>
              <select class="form-control" name="contractId">
                <option value="">Nenhum</option>
                ${Store.state.contracts.map(c => `
                  <option value="${c.id}" ${entry?.contractId === c.id ? 'selected' : ''}>${escapeHtml(c.name)} — ${escapeHtml(c.client)}</option>
                `).join('')}
              </select>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${entry ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => overlay.remove();

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelar').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formEntrada'));
      const data = Object.fromEntries(fd);
      data.value = window.BRLInput.parse(data.value);
      data.contractId = data.contractId || null;

      try {
        if (entry) {
          await Store.updateCaixaEntry(entryId, data);
          window.showToast('Lançamento atualizado', 'success');
        } else {
          await Store.createCaixaEntry(data);
          window.showToast('Lançamento criado', 'success');
        }
        closeModal();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  async deleteEntry(id) {
    if (!confirm('Excluir este lançamento?')) return;
    try {
      await Store.deleteCaixaEntry(id);
      window.showToast('Lançamento excluído', 'success');
      this.render();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  }
};
