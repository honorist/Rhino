window.Dashboard = {
  chart: null,
  periodo: { modo: 'recente' }, // { modo: 'recente' | 'mes' | 'ano', mes: 1-12, ano: 2024 }

  _buildParams() {
    const { modo, mes, ano } = this.periodo;
    if (modo === 'mes' && mes && ano) return { mes, ano };
    if (modo === 'ano' && ano) return { ano, modo: 'ano' };
    return null;
  },

  _periodoLabel() {
    const { modo, mes, ano } = this.periodo;
    const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    if (modo === 'mes') return `${meses[mes - 1]} ${ano}`;
    if (modo === 'ano') return `Ano ${ano}`;
    return '30 dias recentes + projeção';
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();
      await Store.loadDashboard(this._buildParams());
      const dash = Store.state.dashboard;

      const totalSaidas = Store.state.saidas.reduce((sum, s) => sum + s.value, 0);
      const taxaDespesa = dash.totalContractValue > 0
        ? ((totalSaidas / dash.totalContractValue) * 100).toFixed(1)
        : 0;
      const marginMedia = dash.contractsWithMargin.length > 0
        ? (dash.contractsWithMargin.reduce((sum, c) => sum + parseFloat(c.marginPct), 0) / dash.contractsWithMargin.length).toFixed(1)
        : 0;

      const saudeScore = this.calcularScore(parseFloat(taxaDespesa), parseFloat(marginMedia), dash.caixaBalance);

      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Dashboard</h1>
            <p class="page-subtitle">Visão geral · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div id="dash-periodo-ctrl" style="display:flex;align-items:center;gap:var(--sp-sm);">
            ${this._renderPeriodoCtrl()}
          </div>
        </div>

        <!-- KPIs principais -->
        <div class="stat-grid">
          <a href="#/contratos" class="card stat-card" style="text-decoration:none;color:inherit;cursor:pointer;">
            <div class="stat-value">${dash.activeContracts}</div>
            <div class="stat-label">Contratos Ativos →</div>
          </a>
          <a href="#/contratos" class="card stat-card" style="text-decoration:none;color:inherit;cursor:pointer;">
            <div class="stat-value">${Store.formatBRL(dash.totalContractValue)}</div>
            <div class="stat-label">Faturamento Total →</div>
          </a>
          <a href="#/caixa" class="card stat-card" style="text-decoration:none;color:inherit;cursor:pointer;">
            <div class="stat-value" style="color: ${dash.caixaBalance >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}">
              ${Store.formatBRL(dash.caixaBalance)}
            </div>
            <div class="stat-label">Saldo em Caixa → Ver Lançamentos</div>
          </a>
          <a href="#/contratos" class="card stat-card" style="text-decoration:none;color:inherit;cursor:pointer;">
            <div class="stat-value" style="color: ${parseFloat(marginMedia) > 20 ? 'var(--color-success)' : parseFloat(marginMedia) > 0 ? 'var(--color-warning)' : 'var(--color-danger)'}">
              ${marginMedia}%
            </div>
            <div class="stat-label">Margem Média →</div>
          </a>
        </div>

        <!-- Contas a Receber / Contas a Pagar (estilo Akaunting) -->
        ${this.renderReceivablesPayables()}

        <!-- Alertas -->
        ${this.renderAlertas(dash)}

        <!-- Saúde Financeira + Gráfico Histórico + Projeção -->
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Fluxo de Caixa — ${this._periodoLabel()}</h3>
            <div style="display:flex;align-items:center;gap:var(--sp-lg);">
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="width:24px;height:3px;background:#F0B429;border-radius:2px;"></div>
                <span style="font-size:15px;color:var(--color-text-muted);">Realizado</span>
              </div>
              ${this.periodo.modo === 'recente' ? `
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="width:24px;height:3px;background:#60A5FA;border-radius:2px;border-top:2px dashed #60A5FA;"></div>
                <span style="font-size:15px;color:var(--color-text-muted);">Projetado (NFs)</span>
              </div>` : ''}
              <span style="font-weight:700;color:${saudeScore.color};font-size:15px;">${saudeScore.label}</span>
            </div>
          </div>
          <div style="position:relative;height:300px;margin-bottom:var(--sp-lg);">
            <canvas id="chartSaude"></canvas>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--sp-lg);padding-top:var(--sp-lg);border-top:1px solid var(--color-border);">
            <div>
              <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:var(--sp-sm);">Saldo Atual</div>
              <div style="font-size:22px;font-weight:700;color:${dash.caixaBalance >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}">
                ${Store.formatBRL(dash.caixaBalance)}
              </div>
              <div style="font-size:15px;color:var(--color-text-muted);margin-top:4px;">Caixa hoje</div>
            </div>
            <div>
              <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:var(--sp-sm);">Entradas Previstas</div>
              <div style="font-size:22px;font-weight:700;color:var(--color-info)">
                +${Store.formatBRL(dash.projecaoFutura.reduce((s, p) => s + p.totalEntradas, 0))}
              </div>
              <div style="font-size:15px;color:var(--color-text-muted);margin-top:4px;">Via NFs (próx. 90 dias)</div>
            </div>
            <div>
              <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:var(--sp-sm);">Saídas Previstas</div>
              <div style="font-size:22px;font-weight:700;color:${dash.contasPagarStatus?.totalPendente > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'}">
                -${Store.formatBRL(dash.contasPagarStatus?.totalPendente || 0)}
              </div>
              <div style="font-size:15px;color:var(--color-text-muted);margin-top:4px;">${dash.contasPagarStatus?.pendentes || 0} conta(s) a pagar pendente(s)</div>
            </div>
            <div>
              <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:var(--sp-sm);">Margem Média</div>
              <div style="font-size:22px;font-weight:700;color:${parseFloat(marginMedia) > 30 ? 'var(--color-success)' : parseFloat(marginMedia) > 10 ? 'var(--color-warning)' : 'var(--color-danger)'}">
                ${marginMedia}%
              </div>
              <div style="font-size:15px;color:var(--color-text-muted);margin-top:4px;">Lucro esperado médio</div>
            </div>
            <div>
              <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:var(--sp-sm);">Taxa de Despesa</div>
              <div style="font-size:22px;font-weight:700;color:${parseFloat(taxaDespesa) > 80 ? 'var(--color-danger)' : parseFloat(taxaDespesa) > 60 ? 'var(--color-warning)' : 'var(--color-success)'}">
                ${taxaDespesa}%
              </div>
              <div style="font-size:15px;color:var(--color-text-muted);margin-top:4px;">Saídas ÷ Faturamento</div>
            </div>
          </div>
        </div>

        <!-- Entradas previstas das NFs -->
        ${dash.projecaoFutura.length > 0 ? `
          <div class="card mb-2xl">
            <div class="card-header">
              <h3 class="card-title">Entradas Previstas — Recebimento de NFs</h3>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data de Recebimento</th>
                    <th>NF</th>
                    <th>Contrato</th>
                    <th>Prazo</th>
                    <th style="text-align:right;">Valor Esperado</th>
                  </tr>
                </thead>
                <tbody>
                  ${dash.projecaoFutura.flatMap(p => p.entradas.map(e => {
                    const contract = Store.getContractById(e.contractId);
                    const diasAte  = Math.floor((new Date(p.data) - new Date()) / 86400000);
                    const urgCor   = diasAte <= 7 ? 'var(--color-success)' : diasAte <= 30 ? 'var(--color-info)' : 'var(--color-text-muted)';
                    return `
                      <tr>
                        <td>
                          <strong style="color:${urgCor};">${new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
                          <div style="font-size:15px;color:var(--color-text-muted);">em ${diasAte} dias</div>
                        </td>
                        <td><strong>NF ${escapeHtml(e.numero)}</strong></td>
                        <td>${escapeHtml(contract?.name || '—')}<div style="font-size:15px;color:var(--color-text-muted);">${escapeHtml(contract?.client || '')}</div></td>
                        <td>${e.prazoRecebimento}d após emissão</td>
                        <td style="text-align:right;font-weight:700;color:var(--color-success);font-size:15px;">
                          +${Store.formatBRL(e.valor)}
                        </td>
                      </tr>
                    `;
                  })).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Notas Fiscais -->
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Notas Fiscais — Situação</h3>
            <a href="#/notas-fiscais" style="color:var(--color-primary); text-decoration:none; font-size:15px; font-weight:600;">Ver todas →</a>
          </div>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:var(--sp-md);">
            <div style="text-align:center; padding:var(--sp-lg); background:rgba(229,62,62,.08); border-radius:8px; border:1px solid rgba(229,62,62,.2);">
              <div style="font-size:28px; font-weight:800; color:var(--color-danger);">${dash.nfsStatus.vencidas}</div>
              <div style="font-size:15px; color:var(--color-danger); font-weight:600; margin-top:4px;">🔴 VENCIDAS</div>
            </div>
            <div style="text-align:center; padding:var(--sp-lg); background:rgba(214,158,46,.08); border-radius:8px; border:1px solid rgba(214,158,46,.2);">
              <div style="font-size:28px; font-weight:800; color:var(--color-warning);">${dash.nfsStatus.proximasVencer}</div>
              <div style="font-size:15px; color:var(--color-warning); font-weight:600; margin-top:4px;">⚠️ PRÓX. 7 DIAS</div>
            </div>
            <div style="text-align:center; padding:var(--sp-lg); background:rgba(56,161,105,.08); border-radius:8px; border:1px solid rgba(56,161,105,.2);">
              <div style="font-size:28px; font-weight:800; color:var(--color-success);">${dash.nfsStatus.noPrazo}</div>
              <div style="font-size:15px; color:var(--color-success); font-weight:600; margin-top:4px;">🟢 NO PRAZO</div>
            </div>
            <div style="text-align:center; padding:var(--sp-lg); background:rgba(49,130,206,.08); border-radius:8px; border:1px solid rgba(49,130,206,.2);">
              <div style="font-size:28px; font-weight:800; color:var(--color-info);">${dash.nfsStatus.emitidas || 0}</div>
              <div style="font-size:15px; color:var(--color-info); font-weight:600; margin-top:4px;">📤 EMITIDAS</div>
            </div>
          </div>
        </div>

        <!-- Contas a Pagar — Situação -->
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Contas a Pagar — Situação</h3>
            <a href="#/contas-pagar" style="color:var(--color-primary); text-decoration:none; font-size:15px; font-weight:600;">Ver todas →</a>
          </div>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:var(--sp-md);">
            <div style="text-align:center; padding:var(--sp-lg); background:rgba(229,62,62,.08); border-radius:8px; border:1px solid rgba(229,62,62,.2);">
              <div style="font-size:28px; font-weight:800; color:var(--color-danger);">${dash.contasPagarStatus?.vencidas || 0}</div>
              <div style="font-size:15px; color:var(--color-danger); font-weight:600; margin-top:4px;">🔴 VENCIDAS</div>
            </div>
            <div style="text-align:center; padding:var(--sp-lg); background:rgba(214,158,46,.08); border-radius:8px; border:1px solid rgba(214,158,46,.2);">
              <div style="font-size:28px; font-weight:800; color:var(--color-warning);">${dash.contasPagarStatus?.proximasVencer || 0}</div>
              <div style="font-size:15px; color:var(--color-warning); font-weight:600; margin-top:4px;">⚠️ PRÓX. 7 DIAS</div>
            </div>
            <div style="text-align:center; padding:var(--sp-lg); background:rgba(56,161,105,.08); border-radius:8px; border:1px solid rgba(56,161,105,.2);">
              <div style="font-size:28px; font-weight:800; color:var(--color-success);">${(dash.contasPagarStatus?.pendentes || 0) - (dash.contasPagarStatus?.vencidas || 0) - (dash.contasPagarStatus?.proximasVencer || 0)}</div>
              <div style="font-size:15px; color:var(--color-success); font-weight:600; margin-top:4px;">🟢 NO PRAZO</div>
            </div>
            <div style="text-align:center; padding:var(--sp-lg); background:rgba(229,62,62,.05); border-radius:8px; border:1px solid rgba(229,62,62,.15);">
              <div style="font-size:20px; font-weight:800; color:var(--color-danger);">${Store.formatBRL(dash.contasPagarStatus?.totalPendente || 0)}</div>
              <div style="font-size:15px; color:var(--color-danger); font-weight:600; margin-top:4px;">💸 TOTAL PENDENTE</div>
            </div>
          </div>
        </div>

        <!-- Contratos a vencer + Margem -->
        <div class="grid-2">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Contratos a Vencer (30 dias)</h3>
            </div>
            ${dash.contratosAVencer.length === 0 ? `
              <p style="color:var(--color-text-muted); padding:var(--sp-md) 0;">Nenhum contrato vence nos próximos 30 dias</p>
            ` : `
              <div style="display:flex; flex-direction:column; gap:var(--sp-sm);">
                ${dash.contratosAVencer.map(c => `
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:var(--sp-md); background:${c.diasRestantes <= 7 ? 'rgba(229,62,62,.06)' : 'rgba(214,158,46,.06)'}; border-radius:6px; border-left:3px solid ${c.diasRestantes <= 7 ? 'var(--color-danger)' : 'var(--color-warning)'};">
                    <div>
                      <a href="#/contratos/${c.id}" style="font-weight:600; color:var(--color-primary); text-decoration:none;">${escapeHtml(c.name)}</a>
                      <div style="font-size:15px; color:var(--color-text-muted);">${escapeHtml(c.client)}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-weight:700; color:${c.diasRestantes <= 7 ? 'var(--color-danger)' : 'var(--color-warning)'};">${c.diasRestantes}d</div>
                      <div style="font-size:15px; color:var(--color-text-muted);">${new Date(c.endDate).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Contratos por Margem</h3>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Contrato</th>
                    <th>Gasto</th>
                    <th>Margem</th>
                  </tr>
                </thead>
                <tbody>
                  ${dash.contractsWithMargin.length === 0 ? `
                    <tr><td colspan="3" style="text-align:center; color:var(--color-text-muted); padding:var(--sp-xl);">Nenhum contrato</td></tr>
                  ` : dash.contractsWithMargin.map(c => {
                    const pct = parseFloat(c.marginPct);
                    const cor = pct < 0 ? 'var(--color-danger)' : pct < 20 ? 'var(--color-warning)' : 'var(--color-success)';
                    return `
                      <tr>
                        <td>
                          <a href="#/contratos/${c.id}" style="color:var(--color-primary); text-decoration:none; font-weight:500;">${escapeHtml(c.name)}</a>
                          <div style="font-size:15px; color:var(--color-text-muted);">${escapeHtml(c.client)}</div>
                        </td>
                        <td>${Store.formatBRL(c.totalSaidas)}</td>
                        <td>
                          <span style="font-weight:700; color:${cor};">${pct}%</span>
                          <div class="progress-bar-wrap" style="margin-top:4px; width:80px;">
                            <div class="progress-bar ${pct < 0 ? 'over-budget' : ''}" style="width:${Math.min(Math.abs(pct), 100)}%"></div>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Últimas movimentações -->
        <div class="card" style="margin-top:var(--sp-lg);">
          <div class="card-header">
            <h3 class="card-title">Últimas Movimentações — Caixa</h3>
            <a href="#/caixa" style="color:var(--color-primary); text-decoration:none; font-size:15px; font-weight:600;">Ver todos →</a>
          </div>
          ${dash.recentCaixaEntries.length === 0 ? `
            <p style="color:var(--color-text-muted);">Nenhuma movimentação registrada</p>
          ` : `
            <div style="display:flex; flex-direction:column;">
              ${dash.recentCaixaEntries.map(e => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:var(--sp-md) 0; border-bottom:1px solid var(--color-border);">
                  <div>
                    <div style="font-weight:500;">${escapeHtml(e.description)}</div>
                    <div style="font-size:15px; color:var(--color-text-muted);">${new Date(e.date).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-weight:700; font-size:15px; color:${e.type === 'entrada' ? 'var(--color-success)' : 'var(--color-danger)'};">
                      ${e.type === 'entrada' ? '+' : '-'}${Store.formatBRL(e.value)}
                    </div>
                    <span class="badge badge-${e.type}">${e.type}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `;

      app.innerHTML = html;

      this.renderChart(dash);
      this._bindPeriodoCtrl();

    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar dashboard. Tente novamente.</p></div>';
    }
  },

  _renderPeriodoCtrl() {
    const now = new Date();
    const anoAtual = now.getFullYear();
    const anos = [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1];
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const { modo, mes, ano } = this.periodo;

    return `
      <select id="dash-modo" style="background:var(--color-surface);color:var(--color-text);border:1px solid var(--color-border);border-radius:6px;padding:6px 10px;font-size:15px;cursor:pointer;">
        <option value="recente" ${modo === 'recente' ? 'selected' : ''}>Últimos 30 dias</option>
        <option value="mes" ${modo === 'mes' ? 'selected' : ''}>Mês específico</option>
        <option value="ano" ${modo === 'ano' ? 'selected' : ''}>Ano completo</option>
      </select>
      <select id="dash-mes" style="background:var(--color-surface);color:var(--color-text);border:1px solid var(--color-border);border-radius:6px;padding:6px 10px;font-size:15px;cursor:pointer;display:${modo === 'mes' ? 'block' : 'none'};">
        ${meses.map((m, i) => `<option value="${i + 1}" ${mes === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
      <select id="dash-ano" style="background:var(--color-surface);color:var(--color-text);border:1px solid var(--color-border);border-radius:6px;padding:6px 10px;font-size:15px;cursor:pointer;display:${modo !== 'recente' ? 'block' : 'none'};">
        ${anos.map(a => `<option value="${a}" ${ano === a ? 'selected' : ''}>${a}</option>`).join('')}
      </select>
    `;
  },

  _bindPeriodoCtrl() {
    const modoEl = document.getElementById('dash-modo');
    const mesEl = document.getElementById('dash-mes');
    const anoEl = document.getElementById('dash-ano');
    if (!modoEl) return;

    const updateVisibility = (modo) => {
      mesEl.style.display = modo === 'mes' ? 'block' : 'none';
      anoEl.style.display = modo !== 'recente' ? 'block' : 'none';
    };

    modoEl.addEventListener('change', () => {
      const modo = modoEl.value;
      updateVisibility(modo);
      const now = new Date();
      this.periodo = {
        modo,
        mes: parseInt(mesEl.value) || now.getMonth() + 1,
        ano: parseInt(anoEl.value) || now.getFullYear()
      };
      this.render();
    });

    mesEl.addEventListener('change', () => {
      this.periodo.mes = parseInt(mesEl.value);
      this.render();
    });

    anoEl.addEventListener('change', () => {
      this.periodo.ano = parseInt(anoEl.value);
      this.render();
    });
  },

  calcularScore(taxaDespesa, marginMedia, saldoCaixa) {
    let pontos = 100;
    if (taxaDespesa > 80) pontos -= 40;
    else if (taxaDespesa > 60) pontos -= 20;
    if (marginMedia < 0) pontos -= 30;
    else if (marginMedia < 10) pontos -= 15;
    if (saldoCaixa < 0) pontos -= 20;

    if (pontos >= 80) return { label: '🟢 Excelente', color: 'var(--color-success)' };
    if (pontos >= 60) return { label: '🟡 Atenção', color: 'var(--color-warning)' };
    return { label: '🔴 Crítico', color: 'var(--color-danger)' };
  },

  renderReceivablesPayables() {
    const hojeStr = new Date().toISOString().split('T')[0];

    // Contas a Receber — NFs ainda não emitidas/recebidas
    const nfPendentes = (Store.state.notas_fiscais || []).filter(nf => !nf.emitida);
    const recOpen    = nfPendentes.filter(nf => !nf.dataLimite || nf.dataLimite >= hojeStr);
    const recOverdue = nfPendentes.filter(nf => nf.dataLimite && nf.dataLimite <  hojeStr);
    const recOpenVal    = recOpen.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
    const recOverdueVal = recOverdue.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
    const recTotal = recOpenVal + recOverdueVal;
    const recOpenPct    = recTotal > 0 ? (recOpenVal    / recTotal) * 100 : 0;
    const recOverduePct = recTotal > 0 ? (recOverdueVal / recTotal) * 100 : 0;

    // Contas a Pagar — contas pendentes
    const cpPendentes = (Store.state.contas_pagar || []).filter(c => c.status === 'pendente');
    const payOpen    = cpPendentes.filter(c => !c.dataVencimento || c.dataVencimento >= hojeStr);
    const payOverdue = cpPendentes.filter(c => c.dataVencimento && c.dataVencimento <  hojeStr);
    const payOpenVal    = payOpen.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const payOverdueVal = payOverdue.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const payTotal = payOpenVal + payOverdueVal;
    const payOpenPct    = payTotal > 0 ? (payOpenVal    / payTotal) * 100 : 0;
    const payOverduePct = payTotal > 0 ? (payOverdueVal / payTotal) * 100 : 0;

    const card = (titulo, link, subtitulo, total, totalLabel, openVal, openPct, overdueVal, overduePct) => `
      <div class="card" style="padding:20px 22px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <h3 style="font-size:16px;font-weight:700;color:var(--color-text);margin:0;letter-spacing:-.01em;">${titulo}</h3>
          <a href="${link}" style="font-size: 15px;color:var(--color-primary);text-decoration:none;font-weight:500;">Ver Relatório</a>
        </div>
        <div style="font-size:15px;color:var(--color-text-muted);margin-bottom:16px;">${subtitulo}</div>
        <div style="font-size:15px;color:var(--color-text-muted);margin-bottom:6px;">
          ${totalLabel}: <strong style="color:var(--color-text);font-weight:700;font-size:15px;">${Store.formatBRL(total)}</strong>
        </div>
        <div style="height:8px;border-radius:99px;overflow:hidden;background:#F3F4F6;display:flex;margin:10px 0 14px;">
          <div style="background:#F98F6C;width:${openPct}%;"></div>
          <div style="background:#FFB547;width:${overduePct}%;"></div>
        </div>
        <div style="display:flex;gap:28px;">
          <div>
            <div style="color:#F98F6C;font-size:15px;font-weight:600;display:flex;align-items:center;gap:6px;">
              <span style="width:8px;height:8px;border-radius:99px;background:#F98F6C;"></span>Em aberto
            </div>
            <div style="font-size:15px;color:var(--color-text);font-weight:700;margin-top:2px;">${Store.formatBRL(openVal)}</div>
          </div>
          <div>
            <div style="color:#FFB547;font-size:15px;font-weight:600;display:flex;align-items:center;gap:6px;">
              <span style="width:8px;height:8px;border-radius:99px;background:#FFB547;"></span>Vencido
            </div>
            <div style="font-size:15px;color:var(--color-text);font-weight:700;margin-top:2px;">${Store.formatBRL(overdueVal)}</div>
          </div>
        </div>
      </div>
    `;

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-lg);margin-bottom:var(--sp-xl);">
        ${card(
          'Contas a Receber',
          '#/notas-fiscais',
          'Valor que você tem a receber dos seus clientes',
          recTotal,
          'Total de notas fiscais pendentes',
          recOpenVal, recOpenPct, recOverdueVal, recOverduePct
        )}
        ${card(
          'Contas a Pagar',
          '#/contas-pagar',
          'Valor que você tem a pagar aos seus fornecedores',
          payTotal,
          'Total de contas pendentes',
          payOpenVal, payOpenPct, payOverdueVal, payOverduePct
        )}
      </div>
    `;
  },

  renderAlertas(dash) {
    const alertas = [];
    if (dash.nfsStatus.vencidas > 0)
      alertas.push({ tipo: 'danger', msg: `🔴 ${dash.nfsStatus.vencidas} nota(s) fiscal(is) VENCIDA(S) — emita imediatamente!` });
    if (dash.nfsStatus.proximasVencer > 0)
      alertas.push({ tipo: 'warning', msg: `⚠️ ${dash.nfsStatus.proximasVencer} nota(s) fiscal(is) vence(m) em até 7 dias` });
    if (dash.contratosAVencer.some(c => c.diasRestantes <= 7))
      alertas.push({ tipo: 'warning', msg: `⚠️ Há contratos encerrando em menos de 7 dias — faça follow-up com o cliente` });
    if (dash.caixaBalance < 0)
      alertas.push({ tipo: 'danger', msg: `🔴 Saldo de caixa negativo: ${Store.formatBRL(dash.caixaBalance)}` });
    if (dash.contasPagarStatus?.vencidas > 0)
      alertas.push({ tipo: 'danger', msg: `🔴 ${dash.contasPagarStatus.vencidas} conta(s) a pagar VENCIDA(S) — <a href="#/contas-pagar" style="color:inherit;text-decoration:underline;">ver Contas a Pagar</a>` });
    if (dash.contasPagarStatus?.proximasVencer > 0)
      alertas.push({ tipo: 'warning', msg: `⚠️ ${dash.contasPagarStatus.proximasVencer} conta(s) a pagar vence(m) em até 7 dias — total ${Store.formatBRL(dash.contasPagarStatus.totalPendente)}` });

    if (alertas.length === 0) return '';
    return `
      <div style="display:flex; flex-direction:column; gap:var(--sp-sm); margin-bottom:var(--sp-lg);">
        ${alertas.map(a => `
          <div style="padding:var(--sp-md); border-radius:8px; background:rgba(${a.tipo === 'danger' ? '229,62,62' : '214,158,46'},.1); border-left:4px solid var(--color-${a.tipo});">
            <p style="margin:0; font-weight:600; color:var(--color-${a.tipo});">${a.msg}</p>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderChart(dash) {
    if (this.chart) { this.chart.destroy(); this.chart = null; }
    const canvas = document.getElementById('chartSaude');
    if (!canvas || typeof Chart === 'undefined') return;

    const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
    const hoje = new Date().toISOString().split('T')[0];

    // Passado: histórico real (últimos 30 dias)
    const labelsPassado = dash.historicoCaixa.map(d =>
      d.label || new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    );
    const saldosPassado = dash.historicoCaixa.map(d => d.saldo);

    const isHistorico = this.periodo.modo !== 'recente';

    // Futuro: projeção only in recente mode
    const labelsFuturo = isHistorico ? [] : ['Hoje', ...dash.saldoProjetado.map(d =>
      new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    )];
    const saldosFuturo = isHistorico ? [] : [dash.caixaBalance, ...dash.saldoProjetado.map(d => d.saldo)];

    const totalPassado = labelsPassado.length;
    const labels = [...labelsPassado, ...labelsFuturo.slice(1)];

    const dataPassado = [...saldosPassado, ...new Array(Math.max(0, labelsFuturo.length - 1)).fill(null)];
    const dataFuturo = isHistorico ? [] : [...new Array(totalPassado - 1).fill(null), dash.caixaBalance, ...saldosFuturo.slice(1)];

    this.chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Saldo realizado',
            data: dataPassado,
            borderColor: '#F0B429',
            backgroundColor: 'rgba(240,180,41,0.06)',
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 5,
            pointBackgroundColor: '#F0B429',
            tension: 0.4,
            fill: true,
            spanGaps: false
          },
          ...(!isHistorico ? [{
            label: 'Projeção (NFs)',
            data: dataFuturo,
            borderColor: '#60A5FA',
            backgroundColor: 'rgba(96,165,250,0.04)',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: '#60A5FA',
            pointStyle: 'rectRot',
            tension: 0.3,
            fill: true,
            spanGaps: false
          }] : [])
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { usePointStyle: true, padding: 20, color: '#4B5D7B', font: { size: 11, family: 'Nunito' } }
          },
          tooltip: {
            backgroundColor: '#0F1523',
            borderColor: '#1C2840',
            borderWidth: 1,
            titleColor: '#D8E0EE',
            bodyColor: '#4B5D7B',
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y ?? 0)}`
            }
          },
          annotation: {
            annotations: {
              linhaHoje: {
                type: 'line',
                xMin: totalPassado - 1,
                xMax: totalPassado - 1,
                borderColor: 'rgba(255,255,255,0.08)',
                borderWidth: 1,
                borderDash: [4, 4],
                label: { display: true, content: 'Hoje', position: 'start', font: { size: 10 }, color: '#4B5D7B' }
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#4B5D7B', font: { size: 10 }, maxTicksLimit: 12 }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: {
              color: '#4B5D7B',
              font: { size: 11 },
              callback: v => v >= 1000000 ? 'R$' + (v/1000000).toFixed(1) + 'M' : v >= 1000 ? 'R$' + (v/1000).toFixed(0) + 'k' : 'R$' + v
            }
          }
        }
      }
    });
  }
};
