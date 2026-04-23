window.ContratoDetail = {
  chart: null,

  async render(params) {
    const app = document.getElementById('app');
    const contractId = params?.id;

    if (!contractId) {
      app.innerHTML = '<div class="card"><p class="text-danger">Contrato não encontrado</p></div>';
      return;
    }

    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();

      const contract = Store.getContractById(contractId);
      if (!contract) {
        app.innerHTML = '<div class="card"><p class="text-danger">Contrato não encontrado</p></div>';
        return;
      }

      const saidas = Store.getSaidasByContract(contractId);
      const saidasByType = Store.getSaidasByType(contractId);
      const baseAllocations = Store.getBaseAllocationsForContract(contractId);
      const totalSaidas = Store.getTotalSaidasByContract(contractId);
      const totalBase = baseAllocations.reduce((sum, a) => sum + a.value, 0);
      const margin = contract.value - totalSaidas - totalBase;
      const spentPct = (totalSaidas / contract.value * 100).toFixed(1);

      // Orçamento
      const budget = contract.budget || [];
      const totalOrcado = budget.reduce((s, b) => s + b.value, 0);
      const TIPOS_LABEL = {
        mao_de_obra: 'Mão de Obra', material: 'Material',
        hospedagem: 'Hospedagem',   transporte: 'Transporte',
        base: 'Custo BASE',         outros: 'Outros'
      };
      const TIPOS_COLOR = {
        mao_de_obra: '#A78BFA', material: '#FB923C',
        hospedagem: '#22D3EE',  transporte: '#34D399',
        base: '#60A5FA',        outros: '#9CA3AF'
      };
      // Realizado por tipo (inclui BASE)
      const realizadoPorTipo = {
        mao_de_obra: saidasByType.mao_de_obra,
        material:    saidasByType.material,
        hospedagem:  saidasByType.hospedagem,
        transporte:  saidasByType.transporte,
        base:        totalBase,
        outros:      0
      };
      // Orçado por tipo
      const orcadoPorTipo = {};
      budget.forEach(b => { orcadoPorTipo[b.type] = (orcadoPorTipo[b.type] || 0) + b.value; });
      // Tipos que aparecem na comparação = union de orçado e realizado > 0
      const tiposComparar = [...new Set([
        ...Object.keys(orcadoPorTipo),
        ...Object.keys(realizadoPorTipo).filter(t => realizadoPorTipo[t] > 0)
      ])];

      const html = `
        <div style="margin-bottom: var(--sp-xl);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-lg);">
            <div>
              <h1 class="page-title">${contract.name}</h1>
              <p class="page-subtitle">${contract.client}</p>
              ${contract.contractNumber ? `<p class="text-muted font-sm">Contrato #${contract.contractNumber}</p>` : ''}
            </div>
            <div class="btn-group">
              <button class="btn btn-primary" id="btnEditarDados">✏️ Editar Dados</button>
              <a href="#/contratos" class="btn btn-secondary">← Voltar</a>
            </div>
          </div>

          <!-- Status Badge -->
          <div style="margin-bottom: var(--sp-lg);">
            <span class="badge badge-${contract.status}" style="font-size: 13px; padding: 6px 12px;">${contract.status.toUpperCase()}</span>
            <span class="text-muted font-sm" style="margin-left: var(--sp-md);">
              ${new Date(contract.startDate).toLocaleDateString('pt-BR')} até ${new Date(contract.endDate).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>

        <!-- Resumo Principal em 3 Cartões -->
        <div class="grid-3 mb-2xl">
          <div class="card">
            <div class="text-muted font-sm mb-md" style="text-transform: uppercase; letter-spacing: 0.04em;">Valor Total do Contrato</div>
            <div class="font-xl font-bold">${Store.formatBRL(contract.value)}</div>
          </div>
          <div class="card">
            <div class="text-muted font-sm mb-md" style="text-transform: uppercase; letter-spacing: 0.04em;">Total Gasto</div>
            <div style="font-size: 20px; font-weight: 700; color: var(--color-danger);">${Store.formatBRL(totalSaidas + totalBase)}</div>
            <div class="text-muted font-sm mt-sm">${spentPct}% utilizado</div>
          </div>
          <div class="card">
            <div class="text-muted font-sm mb-md" style="text-transform: uppercase; letter-spacing: 0.04em;">Saldo Disponível</div>
            <div style="font-size: 20px; font-weight: 700; color: ${margin >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
              ${Store.formatBRL(Math.max(0, margin))}
            </div>
            <div class="text-muted font-sm mt-sm">${((margin / contract.value) * 100).toFixed(1)}% margem</div>
          </div>
        </div>

        <!-- ─── Orçamento ─── -->
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Orçamento — Composição de Custo Planejado</h3>
            <button class="btn btn-primary btn-sm" id="btnNovoItemOrcamento">+ Adicionar Item</button>
          </div>

          ${budget.length === 0 ? `
            <div style="padding:var(--sp-lg);text-align:center;color:var(--color-text-muted);">
              <div style="font-size:28px;margin-bottom:var(--sp-sm);">📋</div>
              <div style="font-weight:600;margin-bottom:4px;">Nenhum orçamento cadastrado</div>
              <div style="font-size:12px;">Adicione os custos planejados para confrontar com os gastos reais</div>
            </div>
          ` : `
            <!-- Comparativo por tipo -->
            <div style="margin-bottom:var(--sp-lg);">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-muted);margin-bottom:var(--sp-sm);">Comparativo Orçado × Realizado</div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                ${tiposComparar.map(tipo => {
                  const orc = orcadoPorTipo[tipo] || 0;
                  const real = realizadoPorTipo[tipo] || 0;
                  const delta = orc - real;
                  const pct = orc > 0 ? Math.min((real / orc) * 100, 999) : (real > 0 ? 999 : 0);
                  const cor = TIPOS_COLOR[tipo] || '#9CA3AF';
                  const statusCor = real > orc && orc > 0 ? 'var(--color-danger)' : real > 0 && orc === 0 ? 'var(--color-warning)' : 'var(--color-success)';
                  const statusIcon = real > orc && orc > 0 ? '▼' : real > 0 && orc === 0 ? '⚠' : '▲';
                  return `
                    <div style="display:grid;grid-template-columns:140px 1fr 110px 110px 90px;gap:var(--sp-md);align-items:center;padding:10px var(--sp-md);border-radius:6px;background:var(--color-surface-2) ;border-left:3px solid ${cor};">
                      <div style="font-size:12.5px;font-weight:600;">${TIPOS_LABEL[tipo] || tipo}</div>
                      <div>
                        <div style="display:flex;align-items:center;gap:6px;">
                          <div style="flex:1;background:rgba(255,255,255,.06);border-radius:99px;height:6px;overflow:hidden;">
                            <div style="height:100%;width:${Math.min(pct,100)}%;background:${pct>100?'var(--color-danger)':cor};border-radius:99px;transition:width .4s;"></div>
                          </div>
                          <span style="font-size:10px;color:var(--color-text-muted);min-width:32px;">${pct > 999 ? '—' : pct.toFixed(0)+'%'}</span>
                        </div>
                      </div>
                      <div style="text-align:right;">
                        <div style="font-size:10px;color:var(--color-text-muted);margin-bottom:2px;">Orçado</div>
                        <div style="font-size:13px;font-weight:600;font-family:'JetBrains Mono',monospace;">${orc > 0 ? Store.formatBRL(orc) : '<span style="color:var(--color-text-muted)">—</span>'}</div>
                      </div>
                      <div style="text-align:right;">
                        <div style="font-size:10px;color:var(--color-text-muted);margin-bottom:2px;">Realizado</div>
                        <div style="font-size:13px;font-weight:600;font-family:'JetBrains Mono',monospace;color:${real>0?'var(--color-text)':'var(--color-text-muted)'};">${real > 0 ? Store.formatBRL(real) : '—'}</div>
                      </div>
                      <div style="text-align:right;">
                        <div style="font-size:10px;color:var(--color-text-muted);margin-bottom:2px;">Delta</div>
                        <div style="font-size:12px;font-weight:700;color:${orc===0?'var(--color-text-muted)':statusCor};">
                          ${orc === 0 ? '—' : `${statusIcon} ${Store.formatBRL(Math.abs(delta))}`}
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}

                <!-- Total -->
                <div style="display:grid;grid-template-columns:140px 1fr 110px 110px 90px;gap:var(--sp-md);align-items:center;padding:10px var(--sp-md);border-radius:6px;border:1px solid var(--color-border);margin-top:4px;">
                  <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Total</div>
                  <div></div>
                  <div style="text-align:right;font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;">${Store.formatBRL(totalOrcado)}</div>
                  <div style="text-align:right;font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;color:${(totalSaidas+totalBase)>totalOrcado?'var(--color-danger)':'var(--color-text)'};">${Store.formatBRL(totalSaidas + totalBase)}</div>
                  <div style="text-align:right;font-size:12px;font-weight:700;color:${(totalSaidas+totalBase)>totalOrcado?'var(--color-danger)':'var(--color-success)'};">
                    ${(totalSaidas+totalBase) > totalOrcado ? '▼' : '▲'} ${Store.formatBRL(Math.abs(totalOrcado - totalSaidas - totalBase))}
                  </div>
                </div>
              </div>
            </div>

            <!-- Itens do orçamento -->
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-muted);margin-bottom:var(--sp-sm);">Itens do Orçamento</div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th style="text-align:right;">Valor Orçado</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${budget.map(b => {
                      const cor = TIPOS_COLOR[b.type] || '#9CA3AF';
                      return `
                        <tr>
                          <td><strong>${b.description}</strong>${b.notes ? `<div style="font-size:11px;color:var(--color-text-muted);">${b.notes}</div>` : ''}</td>
                          <td><span class="badge" style="background:${cor}18;color:${cor};">${TIPOS_LABEL[b.type] || b.type}</span></td>
                          <td style="text-align:right;font-weight:600;font-family:'JetBrains Mono',monospace;">${Store.formatBRL(b.value)}</td>
                          <td>
                            <div class="actions-cell">
                              <a class="action-link btn-editar-orc" data-id="${b.id}">Editar</a>
                              <a class="action-link danger btn-excluir-orc" data-id="${b.id}">Excluir</a>
                            </div>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `}
        </div>

        <!-- Composição do Gasto - Gráfico em Pizza -->
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Composição do Gasto</h3>
            <span style="font-size:11px;color:var(--color-text-muted);">Passe o mouse sobre a pizza para ver os valores</span>
          </div>
          <div style="display:grid;grid-template-columns:320px 1fr;gap:var(--sp-xl);align-items:center;">
            <!-- Canvas da pizza -->
            <div style="position:relative;height:320px;">
              <canvas id="chartPizzaContrato"></canvas>
            </div>
            <!-- Legenda com valores -->
            <div style="display:flex;flex-direction:column;gap:var(--sp-sm);">
              ${[
                { label: 'Mão de Obra',   value: saidasByType.mao_de_obra, color: '#7C3AED' },
                { label: 'Material',      value: saidasByType.material,    color: '#D97706' },
                { label: 'Hospedagem',    value: saidasByType.hospedagem,  color: '#0891B2' },
                { label: 'Transporte',    value: saidasByType.transporte,  color: '#059669' },
                { label: 'BASE Alocada',  value: totalBase,                 color: '#3182CE' },
                { label: 'Saldo Restante',value: Math.max(0, margin),       color: '#2E7D52' }
              ].map(seg => {
                const pct = contract.value > 0 ? ((seg.value / contract.value) * 100).toFixed(1) : 0;
                return `
                  <div style="display:flex;align-items:center;gap:var(--sp-md);padding:var(--sp-sm) var(--sp-md);border-radius:6px;${seg.value > 0 ? `background:${seg.color}08;border-left:3px solid ${seg.color};` : 'opacity:0.5;'}">
                    <div style="width:14px;height:14px;border-radius:3px;background:${seg.color};flex-shrink:0;"></div>
                    <div style="flex:1;">
                      <div style="font-size:13px;font-weight:600;">${seg.label}</div>
                      <div style="font-size:11px;color:var(--color-text-muted);">${pct}% do contrato</div>
                    </div>
                    <div style="text-align:right;font-weight:700;font-size:14px;color:${seg.color};">
                      ${Store.formatBRL(seg.value)}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Saídas Classificadas (inclui saídas diretas + alocações BASE) -->
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Saídas Classificadas</h3>
            <button class="btn btn-primary btn-sm" id="btnNovaSaida">+ Adicionar Saída</button>
          </div>

          ${saidas.length === 0 && baseAllocations.length === 0 ? `
            <p class="text-muted" style="padding: var(--sp-lg);">Nenhuma saída registrada</p>
          ` : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Tipo</th>
                    <th>Origem</th>
                    <th style="text-align: right;">Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${[
                    // Saídas diretas do contrato
                    ...saidas.map(s => ({
                      kind: 'saida',
                      date: s.date,
                      description: s.description,
                      type: s.type,
                      value: parseFloat(s.value) || 0,
                      id: s.id
                    })),
                    // Alocações BASE viradas em linha
                    ...baseAllocations.map(a => ({
                      kind: 'base',
                      date: a.date,
                      description: a.baseDescription,
                      type: 'base',
                      value: parseFloat(a.value) || 0,
                      id: a.id
                    }))
                  ].sort((a, b) => new Date(b.date) - new Date(a.date)).map(linha => {
                    const isBase = linha.kind === 'base';
                    const tipoBadge = isBase
                      ? `<span class="badge" style="background:rgba(49,130,206,.15);color:#3182CE;">⚙️ BASE</span>`
                      : `<span class="badge badge-${linha.type}">${linha.type.replace(/_/g, ' ')}</span>`;
                    const origemBadge = isBase
                      ? `<span style="font-size:11px;color:var(--color-info);font-weight:600;">Rateio BASE</span>`
                      : `<span style="font-size:11px;color:var(--color-text-muted);">Saída direta</span>`;
                    const acoes = isBase
                      ? `<span style="font-size:11px;color:var(--color-text-muted);">Gerenciar em <a href="#/base" style="color:var(--color-primary);">BASE</a></span>`
                      : `<div class="actions-cell">
                          <a class="action-link btn-editar-saida" data-id="${linha.id}">Editar</a>
                          <a class="action-link danger btn-excluir-saida" data-id="${linha.id}">Excluir</a>
                        </div>`;

                    return `
                      <tr ${isBase ? 'style="background:rgba(49,130,206,.03);"' : ''}>
                        <td>${new Date(linha.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td><strong>${linha.description}</strong></td>
                        <td>${tipoBadge}</td>
                        <td>${origemBadge}</td>
                        <td style="text-align: right; font-weight: 600; ${isBase ? 'color:var(--color-info);' : ''}">${Store.formatBRL(linha.value)}</td>
                        <td>${acoes}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
                <tfoot>
                  <tr style="background:var(--color-bg);font-weight:700;">
                    <td colspan="4" style="padding:var(--sp-md);">Total (saídas + BASE alocada)</td>
                    <td style="text-align:right;padding:var(--sp-md);color:var(--color-danger);">${Store.formatBRL(totalSaidas + totalBase)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `}
        </div>
      `;

      app.innerHTML = html;

      // Renderiza gráfico de pizza APÓS innerHTML
      this.renderPizza({
        maoDeObra:  saidasByType.mao_de_obra,
        material:   saidasByType.material,
        hospedagem: saidasByType.hospedagem,
        transporte: saidasByType.transporte,
        base:       totalBase,
        saldo:      Math.max(0, margin)
      });

      // Event listeners
      document.getElementById('btnEditarDados').addEventListener('click', () => this.showModalEditarDados(contract));
      document.getElementById('btnNovaSaida').addEventListener('click', () => this.showModalSaida(contractId));
      document.getElementById('btnNovoItemOrcamento').addEventListener('click', () => this.showModalOrcamento(contractId));
      document.querySelectorAll('.btn-editar-saida').forEach(btn => {
        btn.addEventListener('click', (e) => this.showModalSaida(contractId, e.target.dataset.id));
      });
      document.querySelectorAll('.btn-excluir-saida').forEach(btn => {
        btn.addEventListener('click', (e) => this.deleteSaida(e.target.dataset.id));
      });
      document.querySelectorAll('.btn-editar-orc').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const item = (contract.budget || []).find(b => b.id === e.target.dataset.id);
          this.showModalOrcamento(contractId, item);
        });
      });
      document.querySelectorAll('.btn-excluir-orc').forEach(btn => {
        btn.addEventListener('click', (e) => this.deleteBudgetItem(contractId, e.target.dataset.id));
      });
    } catch (e) {
      app.innerHTML = `<div class="card"><p class="text-danger">Erro: ${e.message}</p></div>`;
    }
  },

  renderPizza(dados) {
    if (this.chart) { this.chart.destroy(); this.chart = null; }
    const canvas = document.getElementById('chartPizzaContrato');
    if (!canvas || typeof Chart === 'undefined') return;

    const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    const segments = [
      { label: 'Mão de Obra',    value: dados.maoDeObra,  color: '#7C3AED' },
      { label: 'Material',       value: dados.material,   color: '#D97706' },
      { label: 'Hospedagem',     value: dados.hospedagem, color: '#0891B2' },
      { label: 'Transporte',     value: dados.transporte, color: '#059669' },
      { label: 'BASE Alocada',   value: dados.base,       color: '#3182CE' },
      { label: 'Saldo Restante', value: dados.saldo,      color: '#2E7D52' }
    ].filter(s => s.value > 0);

    if (segments.length === 0) {
      canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhum dado para exibir</p>';
      return;
    }

    const total = segments.reduce((s, seg) => s + seg.value, 0);

    this.chart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: segments.map(s => s.label),
        datasets: [{
          data: segments.map(s => s.value),
          backgroundColor: segments.map(s => s.color),
          borderColor: '#fff',
          borderWidth: 3,
          hoverBorderWidth: 4,
          hoverOffset: 12
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(26,32,46,0.95)',
            padding: 14,
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 13 },
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            displayColors: true,
            boxWidth: 12,
            boxHeight: 12,
            callbacks: {
              title: items => items[0].label,
              label: ctx => {
                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                return `  ${fmt(ctx.parsed)}  (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  showModalEditarDados(contract) {
    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width: 680px;">
          <div class="modal-header">
            <h2 class="modal-title">Editar Dados do Contrato</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formEditarDados" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Número do Contrato</label>
                <input class="form-control" name="contractNumber" value="${contract.contractNumber || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Status *</label>
                <select class="form-control" name="status" required>
                  <option value="prospeccao" ${contract.status === 'prospeccao' ? 'selected' : ''}>Prospecção</option>
                  <option value="ativo" ${contract.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                  <option value="pausado" ${contract.status === 'pausado' ? 'selected' : ''}>Pausado</option>
                  <option value="concluido" ${contract.status === 'concluido' ? 'selected' : ''}>Concluído</option>
                  <option value="cancelado" ${contract.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Nome do Contrato *</label>
              <input class="form-control" name="name" value="${contract.name}" required>
            </div>

            <div style="border-top: 1px solid var(--color-border); padding-top: var(--sp-lg); margin-top: var(--sp-lg);">
              <h3 class="card-title mb-md">Dados do Cliente</h3>
              <div class="form-group">
                <label class="form-label">Cliente *</label>
                <select class="form-control" id="selectClienteDetail" name="clientId" required>
                  <option value="">Selecione um cliente...</option>
                  ${Store.state.clientes.map(c => {
                    const selected = (contract.clientId && contract.clientId === c.id) ||
                                     (!contract.clientId && contract.client === c.nome);
                    return `<option value="${c.id}" ${selected ? 'selected' : ''}>${c.nome}${c.empresa ? ' — ' + c.empresa : ''}</option>`;
                  }).join('')}
                  <option value="__outro__" ${!contract.clientId && contract.client && !Store.state.clientes.find(c => c.nome === contract.client) ? 'selected' : ''}>Outro (digitar manualmente)</option>
                </select>
              </div>
              <div class="form-group" id="clienteManualWrapDetail" style="${!contract.clientId && contract.client && !Store.state.clientes.find(c => c.nome === contract.client) ? '' : 'display:none;'}">
                <label class="form-label">Nome/Razão Social *</label>
                <input class="form-control" id="clienteManualDetail" name="client" value="${contract.client || ''}">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">CPF/CNPJ</label>
                  <input class="form-control" name="clientDocument" value="${contract.clientDocument || ''}">
                </div>
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input class="form-control" name="clientEmail" type="email" value="${contract.clientEmail || ''}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Telefone</label>
                  <input class="form-control" name="clientPhone" value="${contract.clientPhone || ''}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Endereço/Local da Obra</label>
                <div style="position:relative;" id="enderecoWrapDetail">
                  <input class="form-control" id="enderecoInputDetail" name="endereco"
                    value="${contract.endereco || contract.clientAddress || ''}"
                    placeholder="Buscar endereço no mapa..."
                    autocomplete="off"
                    style="padding-right:36px;">
                  <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none;">📍</span>
                  <div id="nominatimDropdownDetail" class="nominatim-dropdown" style="display:none;top:calc(100% + 4px);left:0;"></div>
                </div>
                <input type="hidden" id="enderecoLatDetail" name="lat" value="${contract.lat || ''}">
                <input type="hidden" id="enderecoLngDetail" name="lng" value="${contract.lng || ''}">
                <div id="miniMapaDetail" style="height:160px;border-radius:6px;margin-top:8px;overflow:hidden;border:1px solid var(--color-border);${contract.lat ? '' : 'display:none;'}"></div>
              </div>
            </div>

            <div style="border-top: 1px solid var(--color-border); padding-top: var(--sp-lg); margin-top: var(--sp-lg);">
              <h3 class="card-title mb-md">Dados do Contrato</h3>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Valor Total (BRL) *</label>
                  <input class="form-control" name="value" type="text" data-currency inputmode="numeric" value="${window.BRLInput.toDisplay(contract.value)}" placeholder="0,00" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Moeda/Referência</label>
                  <input class="form-control" name="currency" value="${contract.currency || 'BRL'}" placeholder="BRL">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Data de Início</label>
                  <input class="form-control" name="startDate" type="date" value="${contract.startDate}">
                </div>
                <div class="form-group">
                  <label class="form-label">Data de Término</label>
                  <input class="form-control" name="endDate" type="date" value="${contract.endDate}">
                </div>
              </div>
            </div>

            <div style="border-top: 1px solid var(--color-border); padding-top: var(--sp-lg); margin-top: var(--sp-lg);">
              <div class="form-group">
                <label class="form-label">Notas/Observações</label>
                <textarea class="form-control" name="notes" style="min-height: 80px;">${contract.notes || ''}</textarea>
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarDados">Salvar Alterações</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => {
      if (this._miniMapDetail) { this._miniMapDetail.remove(); this._miniMapDetail = null; }
      overlay.remove();
    };

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelar').addEventListener('click', closeModal);

    // Cliente select logic
    const selectCliente = document.getElementById('selectClienteDetail');
    const manualWrap = document.getElementById('clienteManualWrapDetail');
    const manualInput = document.getElementById('clienteManualDetail');

    const preencherEnderecoDoCliente = (clienteId) => {
      const endInput = document.getElementById('enderecoInputDetail');
      const latInput = document.getElementById('enderecoLatDetail');
      const lngInput = document.getElementById('enderecoLngDetail');
      if (!endInput || endInput.value.trim()) return;
      const cl = Store.state.clientes.find(c => c.id === clienteId);
      if (cl && cl.endereco) {
        endInput.value = cl.endereco;
        latInput.value = cl.lat || '';
        lngInput.value = cl.lng || '';
        if (cl.lat && cl.lng) this._mostrarMiniMapaDetail(parseFloat(cl.lat), parseFloat(cl.lng), cl.endereco);
      }
    };

    selectCliente.addEventListener('change', () => {
      const val = selectCliente.value;
      if (val === '__outro__') {
        manualWrap.style.display = '';
        manualInput.required = true;
      } else {
        manualWrap.style.display = 'none';
        manualInput.required = false;
        preencherEnderecoDoCliente(val);
      }
    });

    this._initEnderecoSearchDetail(
      contract.lat || '',
      contract.lng || '',
      contract.endereco || contract.clientAddress || ''
    );

    document.getElementById('btnSalvarDados').addEventListener('click', async () => {
      const formData = new FormData(document.getElementById('formEditarDados'));
      const data = Object.fromEntries(formData);
      data.value = window.BRLInput.parse(data.value);

      // Resolve client name from select
      const clientId = data.clientId;
      if (clientId && clientId !== '__outro__') {
        const cl = Store.state.clientes.find(c => c.id === clientId);
        if (cl) data.client = cl.nome;
      } else if (clientId === '__outro__') {
        data.clientId = '';
      }
      if (!data.client || !data.client.trim()) { window.showToast('Cliente é obrigatório', 'error'); return; }

      try {
        await Store.updateContract(contract.id, data);
        window.showToast('Contrato atualizado com sucesso', 'success');
        closeModal();
        this.render({ id: contract.id });
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  },

  _miniMapDetail: null,

  _mostrarMiniMapaDetail(la, lo, label) {
    const mapaDiv = document.getElementById('miniMapaDetail');
    if (!mapaDiv) return;
    mapaDiv.style.display = 'block';
    setTimeout(() => {
      if (this._miniMapDetail) { this._miniMapDetail.remove(); this._miniMapDetail = null; }
      this._miniMapDetail = L.map(mapaDiv, { zoomControl: true, scrollWheelZoom: false })
        .setView([la, lo], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(this._miniMapDetail);
      L.marker([la, lo]).addTo(this._miniMapDetail).bindPopup(label).openPopup();
    }, 50);
  },

  _initEnderecoSearchDetail(lat, lng, enderecoSalvo) {
    const input    = document.getElementById('enderecoInputDetail');
    const dropdown = document.getElementById('nominatimDropdownDetail');
    const latInput = document.getElementById('enderecoLatDetail');
    const lngInput = document.getElementById('enderecoLngDetail');
    if (!input) return;

    if (lat && lng) this._mostrarMiniMapaDetail(parseFloat(lat), parseFloat(lng), enderecoSalvo || 'Local');

    let debounce = null;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      if (q.length < 4) { dropdown.style.display = 'none'; return; }
      debounce = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`,
            { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
          );
          const results = await res.json();
          if (!results.length) { dropdown.style.display = 'none'; return; }

          dropdown.innerHTML = results.map(r => {
            const name   = r.display_name.split(',').slice(0, 3).join(',');
            const detail = r.display_name.split(',').slice(3).join(',').trim();
            return `<div class="nominatim-item" data-lat="${r.lat}" data-lng="${r.lon}" data-name="${r.display_name.replace(/"/g, '&quot;')}">
              <strong>${name}</strong><span>${detail}</span>
            </div>`;
          }).join('');
          dropdown.style.display = 'block';

          dropdown.querySelectorAll('.nominatim-item').forEach(el => {
            el.addEventListener('click', () => {
              const la = parseFloat(el.dataset.lat);
              const lo = parseFloat(el.dataset.lng);
              const nome = el.dataset.name;
              input.value = nome;
              latInput.value = la;
              lngInput.value = lo;
              dropdown.style.display = 'none';
              this._mostrarMiniMapaDetail(la, lo, nome);
            });
          });
        } catch { dropdown.style.display = 'none'; }
      }, 450);
    });

    document.addEventListener('click', e => {
      if (!document.getElementById('enderecoWrapDetail')?.contains(e.target))
        dropdown.style.display = 'none';
    });
  },

  showModalSaida(contractId, saidaId) {
    const saida = saidaId ? Store.state.saidas.find(s => s.id === saidaId) : null;
    const title = saida ? 'Editar Saída' : 'Nova Saída';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formSaida" class="modal-content">
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input class="form-control" name="description" value="${saida?.description || ''}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tipo *</label>
                <select class="form-control" name="type" required>
                  <option value="mao_de_obra" ${saida?.type === 'mao_de_obra' ? 'selected' : ''}>Mão de Obra</option>
                  <option value="material" ${saida?.type === 'material' ? 'selected' : ''}>Material</option>
                  <option value="hospedagem" ${saida?.type === 'hospedagem' ? 'selected' : ''}>Hospedagem</option>
                  <option value="transporte" ${saida?.type === 'transporte' ? 'selected' : ''}>Transporte</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Valor (BRL) *</label>
                <input class="form-control" name="value" type="text" data-currency inputmode="numeric" value="${saida?.value ? window.BRLInput.toDisplay(saida.value) : ''}" placeholder="0,00" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Data</label>
              <input class="form-control" name="date" type="date" value="${saida?.date || new Date().toISOString().split('T')[0]}">
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${saida ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => overlay.remove();

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelar').addEventListener('click', closeModal);

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const formData = new FormData(document.getElementById('formSaida'));
      const data = Object.fromEntries(formData);
      data.value = window.BRLInput.parse(data.value);

      try {
        if (saida) {
          await Store.updateSaida(saidaId, data);
          window.showToast('Saída atualizada', 'success');
        } else {
          await Store.createSaida(contractId, data);
          window.showToast('Saída adicionada', 'success');
        }
        closeModal();
        this.render({ id: contractId });
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  },

  showModalOrcamento(contractId, item) {
    const TIPOS = [
      { key: 'mao_de_obra', label: 'Mão de Obra' },
      { key: 'material',    label: 'Material' },
      { key: 'hospedagem',  label: 'Hospedagem' },
      { key: 'transporte',  label: 'Transporte' },
      { key: 'base',        label: 'Custo BASE' },
      { key: 'outros',      label: 'Outros' }
    ];
    const title = item ? 'Editar Item do Orçamento' : 'Novo Item do Orçamento';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formOrcamento" class="modal-content">
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input class="form-control" name="description" value="${item?.description || ''}" placeholder="Ex: Equipe de campo, aço, diárias..." required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Categoria *</label>
                <select class="form-control" name="type" required>
                  ${TIPOS.map(t => `<option value="${t.key}" ${item?.type === t.key ? 'selected' : ''}>${t.label}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Valor Orçado (BRL) *</label>
                <input class="form-control" name="value" type="text" data-currency inputmode="numeric" value="${item?.value ? window.BRLInput.toDisplay(item.value) : ''}" placeholder="0,00" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="notes" style="min-height:60px;" placeholder="Detalhes adicionais...">${item?.notes || ''}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${item ? 'Atualizar' : 'Adicionar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelar').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formOrcamento'));
      const data = Object.fromEntries(fd);
      data.value = window.BRLInput.parse(data.value);
      if (!data.description.trim()) { window.showToast('Descrição obrigatória', 'error'); return; }
      if (!data.value || data.value <= 0) { window.showToast('Informe um valor válido', 'error'); return; }

      try {
        if (item) {
          await Store.updateBudgetItem(contractId, item.id, data);
          window.showToast('Item atualizado', 'success');
        } else {
          await Store.createBudgetItem(contractId, data);
          window.showToast('Item adicionado ao orçamento', 'success');
        }
        close();
        this.render({ id: contractId });
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  async deleteBudgetItem(contractId, itemId) {
    if (!confirm('Excluir este item do orçamento?')) return;
    try {
      await Store.deleteBudgetItem(contractId, itemId);
      window.showToast('Item removido', 'success');
      this.render({ id: contractId });
    } catch (e) { window.showToast(e.message, 'error'); }
  },

  async deleteSaida(id) {
    if (!confirm('Excluir esta saída?')) return;
    try {
      const saida = Store.state.saidas.find(s => s.id === id);
      const contractId = saida?.contractId;
      await Store.deleteSaida(id);
      window.showToast('Saída excluída', 'success');
      if (contractId) this.render({ id: contractId });
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  }
};
