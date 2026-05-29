window.Base = {
  currentMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
  currentTypeFilter: 'todos',

  // Getter dinâmico dos tipos (vêm do Store, gerenciados em Configuração)
  get TIPOS() {
    const map = {};
    (Store.state.tipos_base || []).forEach(t => {
      map[t.key] = { label: t.label, icon: t.icon, cor: t.cor };
    });
    if (Object.keys(map).length === 0) {
      map.outros = { label: 'Outros', icon: '🔹', cor: '#718096' };
    }
    return map;
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();

      // Itens do mês selecionado
      const itensMes = Store.state.base.filter(item => {
        const ym = (item.date || '').slice(0, 7);
        return ym === this.currentMonth;
      });

      // Totais por tipo (do mês)
      const totaisPorTipo = {};
      Object.keys(this.TIPOS).forEach(t => { totaisPorTipo[t] = 0; });
      itensMes.forEach(item => {
        const tipo = this.TIPOS[item.type] ? item.type : 'outros';
        if (!(tipo in totaisPorTipo)) totaisPorTipo[tipo] = 0;
        totaisPorTipo[tipo] += item.value;
      });

      const totalMes       = itensMes.reduce((s, i) => s + i.value, 0);
      const totalGeral     = Store.state.base.reduce((s, i) => s + i.value, 0);
      const totalAlocado   = Store.state.base.reduce((s, i) => s + i.allocations.reduce((a, b) => a + b.value, 0), 0);
      const totalDisponivel = totalGeral - totalAlocado;

      // Lista de meses disponíveis (para o seletor)
      const mesesDisponiveis = [...new Set(Store.state.base.map(i => (i.date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
      if (!mesesDisponiveis.includes(this.currentMonth)) mesesDisponiveis.unshift(this.currentMonth);

      // Aplicar filtro de tipo na listagem
      const itensFiltrados = this.currentTypeFilter === 'todos'
        ? itensMes
        : itensMes.filter(i => (this.TIPOS[i.type] ? i.type : 'outros') === this.currentTypeFilter);

      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title">BASE — Centro de Custo</h1>
            <p class="page-subtitle">Controle mensal por tipo de custo administrativo</p>
          </div>
          <button class="btn btn-primary btn-lg" id="btnNovoItem">+ Novo Item</button>
        </div>

        <!-- Controle mensal + KPIs globais -->
        <div style="display:grid;grid-template-columns:auto 1fr;gap:var(--sp-lg);margin-bottom:var(--sp-xl);align-items:center;">
          <div style="display:flex;align-items:center;gap:var(--sp-sm);">
            <button class="btn btn-sm" id="btnMesAnterior" style="background:transparent;color:var(--color-text);border:1px solid var(--color-border);font-size:16px;font-weight:700;padding:6px 12px;">←</button>
            <select class="form-control" id="selectMes" style="min-width:180px;font-weight:600;">
              ${mesesDisponiveis.map(m => `<option value="${m}" ${m === this.currentMonth ? 'selected' : ''}>${this.formatarMes(m)}</option>`).join('')}
            </select>
            <button class="btn btn-sm" id="btnProximoMes" style="background:transparent;color:var(--color-text);border:1px solid var(--color-border);font-size:16px;font-weight:700;padding:6px 12px;">→</button>
          </div>
          <div style="display:flex;gap:var(--sp-lg);justify-content:flex-end;flex-wrap:wrap;">
            <div style="text-align:right;">
              <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;">Total Geral (histórico)</div>
              <div style="font-size:16px;font-weight:700;">${Store.formatBRL(totalGeral)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;">Alocado</div>
              <div style="font-size:16px;font-weight:700;color:var(--color-info);">${Store.formatBRL(totalAlocado)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;">Não Alocado</div>
              <div style="font-size:16px;font-weight:700;color:${totalDisponivel >= 0 ? 'var(--color-warning)' : 'var(--color-danger)'};">${Store.formatBRL(totalDisponivel)}</div>
            </div>
          </div>
        </div>

        <!-- Total do mês -->
        <div class="card mb-2xl" style="background:linear-gradient(135deg, rgba(46,125,82,.05), rgba(46,125,82,.02));border-left:4px solid var(--color-primary);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">Total do Mês — ${this.formatarMes(this.currentMonth)}</div>
              <div style="font-size:32px;font-weight:800;color:var(--color-primary);margin-top:4px;">${Store.formatBRL(totalMes)}</div>
              <div style="font-size:15px;color:var(--color-text-muted);margin-top:4px;">${itensMes.length} lançamento${itensMes.length !== 1 ? 's' : ''}</div>
            </div>
            ${totalMes > 0 ? `
              <div style="display:flex;flex-direction:column;gap:4px;min-width:280px;">
                ${Object.entries(totaisPorTipo)
                  .filter(([_, v]) => v > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([tipo, valor]) => {
                    const pct = ((valor / totalMes) * 100).toFixed(1);
                    const info = this.TIPOS[tipo];
                    return `
                      <div style="display:flex;align-items:center;gap:var(--sp-sm);">
                        <span style="font-size:15px;">${info.icon}</span>
                        <span style="font-size:15px;min-width:80px;">${info.label}</span>
                        <div style="flex:1;height:8px;background:rgba(0,0,0,.06);border-radius:99px;overflow:hidden;">
                          <div style="height:100%;width:${pct}%;background:${info.cor};border-radius:99px;"></div>
                        </div>
                        <span style="font-size:15px;color:var(--color-text-muted);min-width:42px;text-align:right;">${pct}%</span>
                        <span style="font-size:15px;font-weight:700;min-width:80px;text-align:right;">${Store.formatBRL(valor)}</span>
                      </div>
                    `;
                  }).join('')}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Cards por tipo (top 3 por valor) -->
        ${(() => {
          const topTipos = Object.entries(totaisPorTipo)
            .filter(([k, v]) => v > 0 || ['homem_hora', 'material_base', 'veiculo'].includes(k))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
          if (topTipos.length === 0) return '';
          return `
            <div style="display:grid;grid-template-columns:repeat(${topTipos.length},1fr);gap:var(--sp-md);margin-bottom:var(--sp-xl);">
              ${topTipos.map(([tipo]) => {
                const info = this.TIPOS[tipo] || { label: tipo, icon: '🔹', cor: '#718096' };
                const valor = totaisPorTipo[tipo] || 0;
                const count = itensMes.filter(i => i.type === tipo).length;
                const ativo = this.currentTypeFilter === tipo;
                return `
                  <div class="card btn-filtro-tipo" data-tipo="${tipo}" style="cursor:pointer;border-left:4px solid ${info.cor};${ativo ? `background:${info.cor}10;` : ''}transition:all .2s;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                      <div>
                        <div style="font-size:24px;">${info.icon}</div>
                        <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-top:6px;">${info.label}</div>
                        <div style="font-size:22px;font-weight:800;color:${info.cor};margin-top:4px;">${Store.formatBRL(valor)}</div>
                        <div style="font-size:15px;color:var(--color-text-muted);margin-top:2px;">${count} lançamento${count !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        })()}

        <!-- Filtros -->
        <div style="display:flex;gap:var(--sp-sm);margin-bottom:var(--sp-lg);flex-wrap:wrap;align-items:center;">
          <span style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;font-weight:600;margin-right:4px;">Filtrar por tipo:</span>
          <button class="btn btn-sm btn-filtro" data-filtro="todos" style="${this.currentTypeFilter === 'todos' ? 'background:var(--color-primary);color:#fff;' : 'background:transparent;color:var(--color-text-muted);border:1px solid var(--color-border);'}">Todos</button>
          ${Object.entries(this.TIPOS).map(([tipo, info]) => `
            <button class="btn btn-sm btn-filtro" data-filtro="${tipo}" style="${this.currentTypeFilter === tipo ? `background:${info.cor};color:#fff;` : 'background:transparent;color:var(--color-text-muted);border:1px solid var(--color-border);'}">${info.icon} ${info.label}</button>
          `).join('')}
        </div>

        <!-- Tabela de itens -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Itens da BASE — ${this.currentTypeFilter === 'todos' ? 'Todos os tipos' : this.TIPOS[this.currentTypeFilter]?.label || this.currentTypeFilter}</h3>
            <span style="font-size:15px;color:var(--color-text-muted);">${itensFiltrados.length} item${itensFiltrados.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Descrição</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Data</th>
                  <th scope="col" style="text-align:right;">Valor</th>
                  <th scope="col">Contratos Alocados</th>
                  <th scope="col" style="text-align:right;">Saldo</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${itensFiltrados.length === 0 ? `
                  <tr>
                    <td colspan="7" class="text-center text-muted" style="padding:var(--sp-xl);">Nenhum item neste período/filtro</td>
                  </tr>
                ` : itensFiltrados.map(item => {
                  const allocated = item.allocations.reduce((sum, a) => sum + a.value, 0);
                  const saldo = item.value - allocated;
                  const tipoKey = this.TIPOS[item.type] ? item.type : 'outros';
                  const info = this.TIPOS[tipoKey];
                  return `
                    <tr>
                      <td>
                        <strong>${escapeHtml(item.description)}</strong>
                        ${(() => {
                          const r = item?.metadata?.recurrence;
                          if (!r || !r.active) return '';
                          const fmap = { weekly: 'semanal', monthly: 'mensal', quarterly: 'trimestral', yearly: 'anual' };
                          return `<div style="margin-top:4px;"><span class="rh-pill rh-pill-info"><span class="rh-pill-dot"></span>recorrente · ${fmap[r.frequency] || r.frequency}</span></div>`;
                        })()}
                      </td>
                      <td><span class="badge badge-${tipoKey}">${info.icon} ${info.label}</span></td>
                      <td>
                        ${item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        ${(() => {
                          const r = item?.metadata?.recurrence;
                          if (!r || !r.active) return '';
                          const fmt = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                          return `<div class="rh-meta-xs" style="margin-top:2px;">${fmt(r.startDate)} → ${fmt(r.endDate)}</div>`;
                        })()}
                      </td>
                      <td style="text-align:right;font-weight:600;">${Store.formatBRL(item.value)}</td>
                      <td style="min-width:260px;">
                        ${(item.allocations || []).length === 0 ? `
                          <span style="font-size:15px;color:var(--color-text-muted);font-style:italic;">Nenhuma alocação</span>
                        ` : `
                          <div style="display:flex;flex-direction:column;gap:4px;">
                            ${(item.allocations || []).map(a => {
                              const contract = Store.getContractById(a.contractId);
                              return `
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--sp-sm);padding:4px 8px;background:rgba(49,130,206,.08);border-left:3px solid var(--color-info);border-radius:3px;font-size:15px;">
                                  <a href="#/contratos/${a.contractId}" style="color:var(--color-primary);text-decoration:none;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;" title="${escapeHtml(contract?.name || 'Contrato removido')}${contract?.client ? ' — ' + escapeHtml(contract.client) : ''}">
                                    ${escapeHtml(contract?.name) || '⚠️ Removido'}
                                  </a>
                                  <span style="font-weight:700;color:var(--color-info);white-space:nowrap;">${Store.formatBRL(a.value)}</span>
                                </div>
                              `;
                            }).join('')}
                            <div style="text-align:right;font-size:15px;color:var(--color-text-muted);font-weight:600;margin-top:2px;">
                              Total: ${Store.formatBRL(allocated)}
                            </div>
                          </div>
                        `}
                      </td>
                      <td style="text-align:right;font-weight:700;color:${saldo > 0 ? 'var(--color-warning)' : saldo === 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${Store.formatBRL(saldo)}</td>
                      <td>
                        <div class="actions-cell">
                          ${saldo > 0 ? `<button type="button" class="action-link btn-alocar" data-id="${item.id}">Alocar</button>` : `<button type="button" class="action-link btn-alocar" data-id="${item.id}">Ver Alocações</button>`}
                          <button type="button" class="action-link btn-editar" data-id="${item.id}">Editar</button>
                          <button type="button" class="action-link danger btn-excluir" data-id="${item.id}">Excluir</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              ${itensFiltrados.length > 0 ? `
                <tfoot>
                  <tr style="background:var(--color-bg);font-weight:700;">
                    <td colspan="3" style="padding:var(--sp-md);">Total filtrado</td>
                    <td style="text-align:right;padding:var(--sp-md);">${Store.formatBRL(itensFiltrados.reduce((s, i) => s + i.value, 0))}</td>
                    <td style="text-align:right;padding:var(--sp-md);color:var(--color-info);">Alocado: ${Store.formatBRL(itensFiltrados.reduce((s, i) => s + i.allocations.reduce((a, al) => a + al.value, 0), 0))}</td>
                    <td style="text-align:right;padding:var(--sp-md);color:var(--color-warning);">${Store.formatBRL(itensFiltrados.reduce((s, i) => s + (i.value - i.allocations.reduce((a, al) => a + al.value, 0)), 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              ` : ''}
            </table>
          </div>
        </div>
      `;

      app.innerHTML = html;

      // Listeners
      document.getElementById('btnNovoItem').addEventListener('click', () => this.showModal());

      document.getElementById('selectMes').addEventListener('change', e => {
        this.currentMonth = e.target.value;
        this.render();
      });

      document.getElementById('btnMesAnterior').addEventListener('click', () => {
        const [ano, mes] = this.currentMonth.split('-').map(Number);
        const d = new Date(ano, mes - 2, 1);
        this.currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        this.render();
      });

      document.getElementById('btnProximoMes').addEventListener('click', () => {
        const [ano, mes] = this.currentMonth.split('-').map(Number);
        const d = new Date(ano, mes, 1);
        this.currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        this.render();
      });

      let _filterTimer = null;
      document.querySelectorAll('.btn-filtro').forEach(btn => {
        btn.addEventListener('click', e => {
          this.currentTypeFilter = e.currentTarget.dataset.filtro;
          clearTimeout(_filterTimer);
          _filterTimer = setTimeout(() => this.render(), 150);
        });
      });

      document.querySelectorAll('.btn-filtro-tipo').forEach(btn => {
        btn.addEventListener('click', e => {
          const tipo = e.currentTarget.dataset.tipo;
          this.currentTypeFilter = this.currentTypeFilter === tipo ? 'todos' : tipo;
          clearTimeout(_filterTimer);
          _filterTimer = setTimeout(() => this.render(), 150);
        });
      });

      document.querySelectorAll('.btn-alocar').forEach(btn => {
        btn.addEventListener('click', e => this.showModalAlocar(e.target.dataset.id));
      });
      document.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', e => this.showModal(e.target.dataset.id));
      });
      document.querySelectorAll('.btn-excluir').forEach(btn => {
        btn.addEventListener('click', e => this.deleteItem(e.target.dataset.id));
      });
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar BASE. Tente novamente.</p></div>';
    }
  },

  formatarMes(ym) {
    if (!ym) return '';
    const [ano, mes] = ym.split('-').map(Number);
    const d = new Date(ano, mes - 1, 1);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
  },

  showModal(itemId) {
    const item = itemId ? Store.getBaseItemById(itemId) : null;
    const title = item ? 'Editar Item BASE' : 'Novo Item BASE';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formItem" class="modal-content">
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input class="form-control" name="description" value="${item?.description || ''}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tipo *</label>
                <select class="form-control" name="type" required>
                  ${(Store.state.tipos_base || []).map(t =>
                    `<option value="${t.key}" ${item?.type === t.key ? 'selected' : ''}>${t.icon} ${t.label}</option>`
                  ).join('')}
                </select>
                <div class="form-helper">Não encontrou? Cadastre em <a href="#/configuracao" style="color:var(--color-primary);">Configuração → Tipos de Custo</a>.</div>
              </div>
              <div class="form-group">
                <label class="form-label">Valor (BRL) *</label>
                <input class="form-control" name="value" type="text" data-currency inputmode="numeric" value="${item?.value ? window.BRLInput.toDisplay(item.value) : ''}" placeholder="0,00" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Data *</label>
              <input class="form-control" name="date" type="date" value="${item?.date || new Date().toISOString().split('T')[0]}" required>
            </div>

            <!-- Recorrência -->
            ${(() => {
              const rec = item?.metadata?.recurrence || {};
              const isRec = !!rec.active;
              return `
              <div class="form-group" style="border-top:1px solid var(--color-border);padding-top:var(--sp-md);">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;">
                  <input type="checkbox" id="recAtivo" name="recAtivo" ${isRec ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
                  <span>Item recorrente</span>
                  <span class="rh-meta" style="font-weight:400;">(repete automaticamente até a data final)</span>
                </label>
              </div>
              <div id="recCampos" style="display:${isRec ? 'block' : 'none'};">
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Início *</label>
                    <input class="form-control" name="recInicio" type="date" value="${rec.startDate || ''}">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Fim *</label>
                    <input class="form-control" name="recFim" type="date" value="${rec.endDate || ''}">
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Frequência *</label>
                  <select class="form-control" name="recFreq">
                    <option value="weekly"     ${rec.frequency === 'weekly'     ? 'selected' : ''}>Semanal</option>
                    <option value="monthly"    ${rec.frequency === 'monthly' || !rec.frequency ? 'selected' : ''}>Mensal</option>
                    <option value="quarterly"  ${rec.frequency === 'quarterly'  ? 'selected' : ''}>Trimestral</option>
                    <option value="yearly"     ${rec.frequency === 'yearly'     ? 'selected' : ''}>Anual</option>
                  </select>
                  <div class="form-helper">O valor informado acima é aplicado a cada ocorrência.</div>
                </div>
              </div>
              `;
            })()}

            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="notes">${window.escapeHtml(item?.notes || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${item ? 'Atualizar' : 'Criar'}</button>
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

    // Toggle dos campos de recorrência
    const recAtivo = document.getElementById('recAtivo');
    const recCampos = document.getElementById('recCampos');
    if (recAtivo && recCampos) {
      recAtivo.addEventListener('change', () => {
        recCampos.style.display = recAtivo.checked ? 'block' : 'none';
      });
    }

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formItem'));
      const data = Object.fromEntries(fd);
      data.value = window.BRLInput.parse(data.value);

      // Monta metadata.recurrence se ativo
      const recurrenceActive = !!data.recAtivo;
      const meta = (item && item.metadata) ? { ...item.metadata } : {};
      if (recurrenceActive) {
        if (!data.recInicio || !data.recFim) {
          window.showToast('Informe as datas de início e fim da recorrência', 'error');
          return;
        }
        if (data.recFim < data.recInicio) {
          window.showToast('Data final deve ser igual ou posterior à inicial', 'error');
          return;
        }
        meta.recurrence = {
          active: true,
          startDate: data.recInicio,
          endDate: data.recFim,
          frequency: data.recFreq || 'monthly',
        };
      } else {
        delete meta.recurrence;
      }
      data.metadata = meta;
      // Limpa campos auxiliares (não vão para o backend)
      delete data.recAtivo; delete data.recInicio; delete data.recFim; delete data.recFreq;

      try {
        if (item) {
          await Store.updateBaseItem(itemId, data);
          window.showToast('Item atualizado', 'success');
        } else {
          await Store.createBaseItem(data);
          window.showToast('Item criado', 'success');
        }
        closeModal();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  showModalAlocar(itemId) {
    const item = Store.getBaseItemById(itemId);
    if (!item) return;

    const allocated = item.allocations.reduce((sum, a) => sum + a.value, 0);
    const disponivel = item.value - allocated;
    const tipoKey = this.TIPOS[item.type] ? item.type : 'outros';
    const info = this.TIPOS[tipoKey];

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:640px;">
          <div class="modal-header">
            <h2 class="modal-title">${info.icon} Alocar "${escapeHtml(item.description)}"</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <!-- Resumo do item -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-sm);margin-bottom:var(--sp-lg);padding:var(--sp-md);background:var(--color-bg);border-radius:8px;">
              <div>
                <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;">Valor Total</div>
                <div style="font-size:15px;font-weight:700;">${Store.formatBRL(item.value)}</div>
              </div>
              <div>
                <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;">Alocado</div>
                <div style="font-size:15px;font-weight:700;color:var(--color-info);">${Store.formatBRL(allocated)}</div>
              </div>
              <div>
                <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;">Disponível</div>
                <div style="font-size:15px;font-weight:700;color:var(--color-success);">${Store.formatBRL(disponivel)}</div>
              </div>
            </div>

            <!-- Alocações existentes -->
            ${item.allocations.length > 0 ? `
              <div style="margin-bottom:var(--sp-lg);">
                <div style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:var(--sp-sm);">Alocações existentes</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  ${item.allocations.map(a => {
                    const contract = Store.getContractById(a.contractId);
                    return `
                      <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--sp-sm) var(--sp-md);background:rgba(49,130,206,.06);border-left:3px solid var(--color-info);border-radius:4px;font-size:15px;">
                        <div>
                          <strong>${escapeHtml(contract?.name || 'Contrato removido')}</strong>
                          ${contract?.client ? `<span style="color:var(--color-text-muted);"> · ${escapeHtml(contract.client)}</span>` : ''}
                        </div>
                        <div style="font-weight:700;color:var(--color-info);">${Store.formatBRL(a.value)}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Nova alocação -->
            <form id="formAlocar">
              <div style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:var(--sp-sm);">Nova alocação</div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Contrato *</label>
                  <select class="form-control" name="contractId" required>
                    <option value="">Selecionar...</option>
                    ${Store.state.contracts.filter(c => c.status === 'ativo').map(c => `
                      <option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.client)}</option>
                    `).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Valor a Alocar *</label>
                  <input class="form-control" name="value" type="text" data-currency inputmode="numeric" placeholder="0,00" required>
                  <div class="form-helper">Máximo: ${Store.formatBRL(disponivel)}</div>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Fechar</button>
            ${disponivel > 0 ? `<button class="btn btn-success" id="btnAlocar">+ Adicionar Alocação</button>` : ''}
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

    const btnAlocar = document.getElementById('btnAlocar');
    if (btnAlocar) {
      btnAlocar.addEventListener('click', async () => {
        const fd = new FormData(document.getElementById('formAlocar'));
        const data = { contractId: fd.get('contractId'), value: window.BRLInput.parse(fd.get('value')) };

        if (!data.contractId) { window.showToast('Selecione um contrato', 'error'); return; }
        if (!data.value || data.value <= 0) { window.showToast('Informe um valor válido', 'error'); return; }
        if (data.value > disponivel) { window.showToast('Valor excede o disponível', 'error'); return; }

        btnAlocar.disabled = true;
        btnAlocar.textContent = 'Alocando...';

        try {
          await Store.allocateBaseItem(itemId, data);
          window.showToast('Alocação criada. Você pode alocar mais contratos.', 'success');

          // Atualiza a tabela de fundo mas mantém modal aberto re-abrindo-o
          closeModal();
          this.render();

          // Re-abre o modal com dados atualizados para permitir nova alocação
          const itemAtualizado = Store.getBaseItemById(itemId);
          if (itemAtualizado) {
            const novaDisponivel = itemAtualizado.value - itemAtualizado.allocations.reduce((s, a) => s + a.value, 0);
            if (novaDisponivel > 0) {
              setTimeout(() => this.showModalAlocar(itemId), 100);
            }
          }
        } catch (e) {
          window.showToast(e.message, 'error');
          btnAlocar.disabled = false;
          btnAlocar.textContent = '+ Adicionar Alocação';
        }
      });
    }
  },

  async deleteItem(id) {
    if (!confirm('Excluir este item e todas as suas alocações?')) return;
    try {
      await Store.deleteBaseItem(id);
      window.showToast('Item excluído', 'success');
      this.render();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  }
};
