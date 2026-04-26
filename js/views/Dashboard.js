window.Dashboard = {
  chart: null,
  periodo: { modo: 'recente' },
  projDays: 60,
  movFiltro: 'ambos', // 'entrada' | 'saida' | 'ambos'

  _buildParams() {
    const { modo, mes, ano } = this.periodo;
    const base = { projDays: this.projDays };
    if (modo === 'mes' && mes && ano) return { ...base, mes, ano };
    if (modo === 'ano' && ano) return { ...base, ano, modo: 'ano' };
    return base;
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

      // Compliance de RDOs (não bloqueia se falhar)
      let rdoStats = null;
      try {
        const r = await fetch('/api/rdos');
        if (r.ok) rdoStats = (await r.json()).stats || null;
      } catch (_) {}
      this._rdoStats = rdoStats;

      // Dados extra para novas seções (não bloqueia se falhar)
      let nfsList = [], saidasList = [], cpList = [], sociosList = [], investList = [];
      try {
        const [nfR, cpR, socR, invR] = await Promise.all([
          fetch('/api/notas-fiscais').then(r => r.ok ? r.json() : { notasFiscais: [] }).catch(() => ({ notasFiscais: [] })),
          fetch('/api/contas-pagar').then(r => r.ok ? r.json() : { contasPagar: [] }).catch(() => ({ contasPagar: [] })),
          fetch('/api/socios').then(r => r.ok ? r.json() : { socios: [] }).catch(() => ({ socios: [] })),
          fetch('/api/investimentos').then(r => r.ok ? r.json() : { investimentos: [] }).catch(() => ({ investimentos: [] })),
        ]);
        nfsList = nfR.notasFiscais || nfR.notas_fiscais || [];
        cpList = cpR.contasPagar || cpR.contas || [];
        sociosList = socR.socios || [];
        investList = invR.investimentos || [];
        saidasList = Store.state.saidas || [];
      } catch (_) {}

      // Pipeline de medições (mês corrente)
      const pipeline = this._calcPipeline(nfsList, saidasList);

      // Aportes acumulados (sócios + investimentos com origem 'empresa')
      const aportesSocios = sociosList.reduce((s, x) => s + (parseFloat(x.aporteTotal || x.aporte_total || x.aporte) || 0), 0);
      const aportesEmpresa = investList
        .filter(i => (i.origem || '').toLowerCase() === 'empresa')
        .reduce((s, i) => s + (parseFloat(i.value || i.valor) || 0), 0);
      const aportesTotal = aportesSocios + aportesEmpresa;

      // A receber (NFs emitidas, valor + contagens)
      const nfsEmitidas = nfsList.filter(n => n.emitida || n.status === 'emitida');
      const nfsPendentes = nfsList.filter(n => !n.emitida && n.status !== 'emitida');
      const totalAReceber = nfsEmitidas
        .filter(n => !n.caixaEntryId && !n.caixa_entry_id) // emitidas mas ainda não recebidas
        .reduce((s, n) => s + (parseFloat(n.valor || n.totalLiquido || n.valorTotal) || 0), 0);

      // A pagar próximos 30 dias
      const hojeStr2 = new Date().toISOString().split('T')[0];
      const em30str = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
      const cpPendentes = cpList.filter(c => c.status === 'pendente' || c.status === 'aberto');
      const cp30d = cpPendentes.filter(c => {
        const v = c.dataVencimento || c.data_vencimento;
        return v && v <= em30str;
      });
      const totalAPagar30d = cp30d.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);

      // Faturado mês corrente (entradas no caixa) e mês anterior para delta
      const hojeD = new Date();
      const mesIni = new Date(hojeD.getFullYear(), hojeD.getMonth(), 1).toISOString().split('T')[0];
      const mesAntIni = new Date(hojeD.getFullYear(), hojeD.getMonth() - 1, 1).toISOString().split('T')[0];
      const mesAntFim = new Date(hojeD.getFullYear(), hojeD.getMonth(), 0).toISOString().split('T')[0];
      const caixaEntries = Array.isArray(Store.state.caixa) ? Store.state.caixa : (Store.state.caixa?.entries || []);
      const faturadoMes = caixaEntries
        .filter(e => e.type === 'entrada' && e.date >= mesIni)
        .reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
      const faturadoMesAnt = caixaEntries
        .filter(e => e.type === 'entrada' && e.date >= mesAntIni && e.date <= mesAntFim)
        .reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
      const deltaFaturadoPct = faturadoMesAnt > 0 ? (((faturadoMes - faturadoMesAnt) / faturadoMesAnt) * 100) : 0;

      // Cobertura de caixa (saldo / saídas médias mensais últimos 3 meses)
      const tres30 = new Date(); tres30.setDate(tres30.getDate() - 90);
      const tres30str = tres30.toISOString().split('T')[0];
      const saidasUlt90 = caixaEntries
        .filter(e => e.type === 'saida' && e.date >= tres30str)
        .reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
      const saidaMediaMensal = saidasUlt90 / 3;
      const coberturaMeses = saidaMediaMensal > 0 ? (dash.caixaBalance / saidaMediaMensal) : 0;

      // Saudação dinâmica
      const horaH = hojeD.getHours();
      const saudacaoTxt = horaH < 12 ? 'Bom dia' : horaH < 18 ? 'Boa tarde' : 'Boa noite';
      const userObj = (window.auth && window.auth.user && window.auth.user()) || null;
      const primeiroNome = ((userObj?.name || userObj?.email || '').split(/[\s@]/)[0]) || 'visitante';
      const subParts = [];
      subParts.push(dash.caixaBalance >= 0 ? 'Caixa positivo' : 'Caixa negativo');
      const bmsAguard = pipeline.aguardEmissao.count;
      if (bmsAguard > 0) subParts.push(`${bmsAguard} BM${bmsAguard !== 1 ? 's' : ''} aguardando emissão`);
      const semRdoCount = (rdoStats?.obrasSemRdoOntem || []).length;
      if (semRdoCount > 0) subParts.push(`${semRdoCount} RDO${semRdoCount !== 1 ? 's' : ''} sem lançamento ontem`);

      const totalSaidas = Store.state.saidas.reduce((sum, s) => sum + s.value, 0);
      const taxaDespesa = dash.totalContractValue > 0
        ? ((totalSaidas / dash.totalContractValue) * 100).toFixed(1)
        : 0;
      const marginMedia = dash.contractsWithMargin.length > 0
        ? (dash.contractsWithMargin.reduce((sum, c) => sum + parseFloat(c.marginPct), 0) / dash.contractsWithMargin.length).toFixed(1)
        : 0;

      const saudeScore = this.calcularScore(parseFloat(taxaDespesa), parseFloat(marginMedia), dash.caixaBalance);

      const _icon = (name, size) => (window.rhIcon ? window.rhIcon(name, size || 16) : '');
      const _kpi = (opts) => {
        const tone = opts.tone || '';
        const valueColor = tone === 'pos' ? 'var(--rh-pos-strong)'
                         : tone === 'neg' ? 'var(--rh-neg-strong)'
                         : tone === 'warn' ? 'var(--rh-warn-strong)'
                         : 'var(--rh-ink-900)';
        const deltaCls = opts.deltaTone === 'pos' ? 'rh-kpi-delta-pos'
                       : opts.deltaTone === 'neg' ? 'rh-kpi-delta-neg' : '';
        return `
          <a href="${opts.href || '#'}" class="rh-kpi" style="text-decoration:none;color:inherit;cursor:pointer;" aria-label="${escapeHtml(opts.label + ': ' + opts.value)}">
            <div class="rh-kpi-label">${escapeHtml(opts.label)}</div>
            <div class="rh-kpi-value" style="color:${valueColor};">${opts.value}</div>
            <div class="rh-kpi-meta">
              ${opts.deltaIcon ? `<span class="${deltaCls}">${_icon(opts.deltaIcon, 12)}</span>` : ''}
              <span>${opts.meta || ''}</span>
            </div>
          </a>
        `;
      };

      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title rh-h1">${saudacaoTxt}, ${escapeHtml(primeiroNome)}</h1>
            <p class="page-subtitle">${subParts.join(' · ')}</p>
          </div>
          <div id="dash-periodo-ctrl" style="display:flex;align-items:center;gap:var(--sp-sm);">
            ${this._renderPeriodoCtrl()}
          </div>
        </div>

        <!-- Camada 1: KPIs principais -->
        <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));">
          ${_kpi({
            href: '#/caixa',
            label: 'Saldo em caixa',
            value: Store.formatBRL(dash.caixaBalance),
            tone: dash.caixaBalance >= 0 ? 'pos' : 'neg',
            meta: dash.caixaBalance >= 0 ? 'caixa positivo' : 'caixa negativo',
          })}
          ${_kpi({
            href: '#/notas-fiscais',
            label: 'A receber (NFs)',
            value: Store.formatBRL(totalAReceber),
            meta: `${nfsEmitidas.length} emitidas · ${nfsPendentes.length} pendentes`,
          })}
          ${_kpi({
            href: '#/contas-pagar',
            label: 'A pagar (30d)',
            value: Store.formatBRL(totalAPagar30d),
            tone: totalAPagar30d > 0 ? 'warn' : '',
            meta: `${cp30d.length} lançamento${cp30d.length !== 1 ? 's' : ''}`,
          })}
          ${_kpi({
            href: '#/caixa',
            label: 'Faturado (mês)',
            value: Store.formatBRL(faturadoMes),
            deltaIcon: faturadoMesAnt > 0 ? (deltaFaturadoPct >= 0 ? 'arrow-up' : 'arrow-down') : '',
            deltaTone: deltaFaturadoPct >= 0 ? 'pos' : 'neg',
            meta: faturadoMesAnt > 0 ? `${Math.abs(deltaFaturadoPct).toFixed(1)}% vs mês ant.` : 'sem comparativo',
          })}
        </div>

        <!-- Camada 2: KPIs operacionais -->
        <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-bottom:var(--sp-xl);">
          ${_kpi({
            href: '#/contratos',
            label: 'Margem média',
            value: marginMedia + '%',
            tone: parseFloat(marginMedia) > 20 ? 'pos' : parseFloat(marginMedia) > 0 ? 'warn' : 'neg',
            meta: `${dash.activeContracts} contrato${dash.activeContracts !== 1 ? 's' : ''} ativo${dash.activeContracts !== 1 ? 's' : ''}`,
          })}
          ${_kpi({
            href: '#/socios',
            label: 'Aportes acumulados',
            value: Store.formatBRL(aportesTotal),
            meta: `sócios ${Store.formatBRL(aportesSocios)} + empresa ${Store.formatBRL(aportesEmpresa)}`,
          })}
          ${_kpi({
            href: '#/caixa',
            label: 'Cobertura de caixa',
            value: coberturaMeses > 0 ? coberturaMeses.toFixed(1) + ' meses' : '—',
            tone: coberturaMeses >= 3 ? 'pos' : coberturaMeses >= 1 ? 'warn' : 'neg',
            meta: 'saldo ÷ saída média',
          })}
          ${rdoStats ? _kpi({
            href: '#/rdos',
            label: `Aderência RDO ${rdoStats.diasUteisAvaliados}d`,
            value: rdoStats.aderencia7d + '%',
            tone: rdoStats.aderencia7d >= 80 ? 'pos' : rdoStats.aderencia7d >= 50 ? 'warn' : 'neg',
            meta: rdoStats.obrasSemRdoOntem.length > 0 ? `${rdoStats.obrasSemRdoOntem.length} sem RDO ontem` : 'tudo em dia',
          }) : ''}
        </div>

        <!-- Contas a Receber / Contas a Pagar (estilo Akaunting) -->
        ${this.renderReceivablesPayables()}

        <!-- Pipeline de Medições -->
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title rh-h2">Pipeline de medições — ${hojeD.toLocaleDateString('pt-BR', { month: 'long' })}</h3>
            <a href="#/contratos" class="rh-muted" style="text-decoration:none;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;color:var(--rh-brand-500);">Ver saídas ${_icon('arrow-right', 14)}</a>
          </div>
          <div class="rh-muted" style="font-size:13px;margin-bottom:var(--sp-md);">Do trabalho executado ao recebimento</div>
          <div class="rh-pipeline" role="list" aria-label="Estágios do pipeline de medições">
            ${[
              { l: 'Rascunho',        d: pipeline.rascunho,      active: false },
              { l: 'Aguard. emissão', d: pipeline.aguardEmissao, active: true },
              { l: 'NF emitida',      d: pipeline.nfEmitida,     active: false },
              { l: 'Recebida',        d: pipeline.recebida,      active: false },
            ].map(s => `
              <div class="rh-pipeline-stage ${s.active ? 'is-active' : ''}" role="listitem">
                <div class="rh-pipeline-stage-label">${s.l}</div>
                <div class="rh-pipeline-stage-count">${s.d.count}</div>
                <div class="rh-pipeline-stage-value">${Store.formatBRL(s.d.valor)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Aderência RDO (estilo compacto vertical) -->
        ${rdoStats ? (() => {
          const ativas = rdoStats.obrasAtivas || 0;
          const sem = (rdoStats.obrasSemRdoOntem || []).length;
          const lancados = Math.max(0, ativas - sem);
          const atrasadas = rdoStats.obrasAtrasadas || [];
          const aderColor = rdoStats.aderencia7d >= 80 ? 'var(--rh-pos-strong)'
                          : rdoStats.aderencia7d >= 50 ? 'var(--rh-warn-strong)'
                          : 'var(--rh-neg-strong)';
          const semList = rdoStats.obrasSemRdoOntem || [];
          return `
          <div class="card mb-2xl" style="max-width:560px;">
            <div class="rh-between" style="margin-bottom:var(--sp-md);">
              <div>
                <h3 class="rh-h2" style="margin:0;">RDOs</h3>
                <div class="rh-meta">Aderência mensal</div>
              </div>
              ${atrasadas.length > 0
                ? `<span class="rh-pill rh-pill-warn"><span class="rh-pill-dot"></span>${atrasadas.length} atrasado${atrasadas.length !== 1 ? 's' : ''}</span>`
                : `<span class="rh-pill rh-pill-pos"><span class="rh-pill-dot"></span>em dia</span>`}
            </div>
            <div style="display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:8px 0;">
              <div class="rh-display" style="font-size:42px;font-weight:800;color:${aderColor};line-height:1;grid-row:span 3;align-self:center;">${rdoStats.aderencia7d}%<div style="font-size:11px;font-weight:600;color:var(--rh-ink-500);text-transform:uppercase;letter-spacing:.06em;margin-top:6px;">aderência mês</div></div>
              <div style="border-top:1px solid var(--rh-ink-200);padding-top:8px;font-size:14px;color:var(--rh-ink-700);">Lançados ontem</div>
              <div style="border-top:1px solid var(--rh-ink-200);padding-top:8px;font-size:14px;font-weight:700;text-align:right;">${lancados}<span style="color:var(--rh-ink-500);">/${ativas}</span></div>
              <div style="font-size:14px;color:var(--rh-ink-700);">Sem RDO ontem</div>
              <div style="text-align:right;"><span class="rh-pill ${sem > 0 ? 'rh-pill-warn' : 'rh-pill-pos'}">${sem}</span></div>
              <div style="font-size:14px;color:var(--rh-ink-700);">Atrasados &gt;2du</div>
              <div style="text-align:right;"><span class="rh-pill ${atrasadas.length > 0 ? 'rh-pill-neg' : 'rh-pill-pos'}">${atrasadas.length}</span></div>
            </div>
            ${semList.length > 0 ? `
              <div style="border-top:1px solid var(--rh-ink-200);margin-top:var(--sp-md);padding-top:var(--sp-md);">
                <div class="rh-label" style="margin-bottom:8px;">Obras sem RDO ontem</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${semList.slice(0, 6).map(o => {
                    // Tenta achar diasUteisSemRdo na lista de atrasadas
                    const a = atrasadas.find(x => x.contractId === o.contractId);
                    const dias = a ? (a.nuncaFezRdo ? null : a.diasUteisSemRdo) : null;
                    const sub = dias != null ? `sem lançamento há ${dias} dia${dias !== 1 ? 's' : ''} úteis` : 'sem lançamento ontem';
                    const ctCode = o.contractNumber || (o.name ? o.name.slice(0, 8) : '');
                    return `
                      <div class="rh-row" style="justify-content:space-between;">
                        <div class="rh-row-sm" style="min-width:0;">
                          <span class="rh-pill-dot" style="background:var(--rh-neg-strong);"></span>
                          <div style="min-width:0;">
                            <div style="font-weight:700;font-size:14px;color:var(--rh-ink-900);">
                              ${escapeHtml(o.client || o.name)}
                              ${ctCode ? `<span class="rh-meta-xs" style="margin-left:6px;font-family:monospace;">${escapeHtml(ctCode)}</span>` : ''}
                            </div>
                            <div class="rh-meta-xs">${sub}</div>
                          </div>
                        </div>
                        <a href="#/contratos/${o.contractId}" class="btn btn-secondary btn-sm" style="white-space:nowrap;">Cobrar</a>
                      </div>
                    `;
                  }).join('')}
                  ${semList.length > 6 ? `<div class="rh-meta" style="text-align:center;padding-top:4px;">+ ${semList.length - 6} — <a href="#/rdos" class="rh-link">ver todas</a></div>` : ''}
                </div>
              </div>
            ` : ''}
          </div>
          `;
        })() : ''}

        <!-- Alertas -->
        ${this.renderAlertas(dash)}

        <!-- Saúde Financeira + Gráfico Histórico + Projeção -->
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Fluxo de Caixa — ${this._periodoLabel()}</h3>
            <div style="display:flex;align-items:center;gap:var(--sp-lg);flex-wrap:wrap;">
              <div class="rh-row-sm">
                <div style="width:24px;height:3px;background:#F0B429;border-radius:2px;"></div>
                <span class="rh-meta">Realizado</span>
              </div>
              ${this.periodo.modo === 'recente' ? `
              <div class="rh-row-sm">
                <div style="width:24px;height:3px;background:#60A5FA;border-radius:2px;border-top:2px dashed #60A5FA;"></div>
                <span class="rh-meta">Projetado (NFs)</span>
              </div>
              <div id="projDaysCtrl" style="display:inline-flex;border:1px solid var(--color-border);border-radius:6px;overflow:hidden;">
                ${[30, 60, 90].map(d => `
                  <button data-days="${d}" style="
                    padding:6px 12px;border:0;cursor:pointer;font-size:13px;font-weight:600;
                    background:${this.projDays === d ? '#60A5FA' : 'transparent'};
                    color:${this.projDays === d ? '#fff' : 'var(--color-text-muted)'};
                    border-right:${d !== 90 ? '1px solid var(--color-border)' : '0'};
                  ">${d}d</button>
                `).join('')}
              </div>
              ` : ''}
              <span style="font-weight:700;color:${saudeScore.color};font-size:15px;">${saudeScore.label}</span>
            </div>
          </div>
          <div style="position:relative;height:300px;margin-bottom:var(--sp-lg);">
            <canvas id="chartSaude"></canvas>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--sp-lg);padding-top:var(--sp-lg);border-top:1px solid var(--color-border);">
            <div>
              <div class="rh-label" style="margin-bottom:var(--sp-sm);">Saldo Atual</div>
              <div style="font-size:22px;font-weight:700;color:${dash.caixaBalance >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}">
                ${Store.formatBRL(dash.caixaBalance)}
              </div>
              <div class="rh-meta" style="margin-top:4px;">Caixa hoje</div>
            </div>
            <div>
              <div class="rh-label" style="margin-bottom:var(--sp-sm);">Entradas Previstas</div>
              <div style="font-size:22px;font-weight:700;color:var(--color-info)">
                +${Store.formatBRL(dash.projecaoFutura.reduce((s, p) => s + p.totalEntradas, 0))}
              </div>
              <div class="rh-meta" style="margin-top:4px;">Via NFs (próx. ${this.projDays} dias)</div>
            </div>
            <div>
              <div class="rh-label" style="margin-bottom:var(--sp-sm);">Saídas Previstas</div>
              <div style="font-size:22px;font-weight:700;color:${dash.contasPagarStatus?.totalPendente > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'}">
                -${Store.formatBRL(dash.contasPagarStatus?.totalPendente || 0)}
              </div>
              <div class="rh-meta" style="margin-top:4px;">${dash.contasPagarStatus?.pendentes || 0} conta(s) a pagar pendente(s)</div>
            </div>
            <div>
              <div class="rh-label" style="margin-bottom:var(--sp-sm);">Margem Média</div>
              <div style="font-size:22px;font-weight:700;color:${parseFloat(marginMedia) > 30 ? 'var(--color-success)' : parseFloat(marginMedia) > 10 ? 'var(--color-warning)' : 'var(--color-danger)'}">
                ${marginMedia}%
              </div>
              <div class="rh-meta" style="margin-top:4px;">Lucro esperado médio</div>
            </div>
            <div>
              <div class="rh-label" style="margin-bottom:var(--sp-sm);">Taxa de Despesa</div>
              <div style="font-size:22px;font-weight:700;color:${parseFloat(taxaDespesa) > 80 ? 'var(--color-danger)' : parseFloat(taxaDespesa) > 60 ? 'var(--color-warning)' : 'var(--color-success)'}">
                ${taxaDespesa}%
              </div>
              <div class="rh-meta" style="margin-top:4px;">Saídas ÷ Faturamento</div>
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
                      <tr class="row-dash-fut" data-nf-id="${e.nfId}" style="cursor:pointer;">
                        <td>
                          <strong style="color:${urgCor};">${new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
                          <div class="rh-meta">em ${diasAte} dias</div>
                        </td>
                        <td><strong>NF ${escapeHtml(e.numero)}</strong></td>
                        <td>${escapeHtml(contract?.name || '—')}<div class="rh-meta">${escapeHtml(contract?.client || '')}</div></td>
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
            <a href="#/notas-fiscais" class="rh-link">Ver todas →</a>
          </div>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:var(--sp-md);">
            ${[
              { tone: 'neg',  label: 'Vencidas',     value: dash.nfsStatus.vencidas },
              { tone: 'warn', label: 'Próx. 7 dias', value: dash.nfsStatus.proximasVencer },
              { tone: 'pos',  label: 'No prazo',     value: dash.nfsStatus.noPrazo },
              { tone: 'info', label: 'Emitidas',     value: dash.nfsStatus.emitidas || 0 },
            ].map(s => `
              <div class="rh-pipeline-stage ${s.value > 0 && s.tone === 'neg' ? 'is-active' : ''}" style="text-align:left;">
                <div class="rh-pipeline-stage-label rh-row-sm">${window.rhStatusPill ? window.rhStatusPill(s.tone, s.label) : s.label}</div>
                <div class="rh-pipeline-stage-count">${s.value}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Contas a Pagar — Situação -->
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title rh-h2">Contas a Pagar — Situação</h3>
            <a href="#/contas-pagar" style="text-decoration:none;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;color:var(--rh-brand-500);">Ver todas ${_icon('arrow-right', 14)}</a>
          </div>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:var(--sp-md);">
            ${[
              { tone: 'neg',  label: 'Vencidas',     value: dash.contasPagarStatus?.vencidas || 0 },
              { tone: 'warn', label: 'Próx. 7 dias', value: dash.contasPagarStatus?.proximasVencer || 0 },
              { tone: 'pos',  label: 'No prazo',     value: (dash.contasPagarStatus?.pendentes || 0) - (dash.contasPagarStatus?.vencidas || 0) - (dash.contasPagarStatus?.proximasVencer || 0) },
            ].map(s => `
              <div class="rh-pipeline-stage ${s.value > 0 && s.tone === 'neg' ? 'is-active' : ''}" style="text-align:left;">
                <div class="rh-pipeline-stage-label rh-row-sm">${window.rhStatusPill ? window.rhStatusPill(s.tone, s.label) : s.label}</div>
                <div class="rh-pipeline-stage-count">${s.value}</div>
              </div>
            `).join('')}
            <div class="rh-pipeline-stage" style="text-align:left;border-left-color:var(--rh-neg-strong);">
              <div class="rh-pipeline-stage-label" style="color:var(--rh-neg-text);">Total pendente</div>
              <div class="rh-pipeline-stage-count" style="font-size:22px;color:var(--rh-neg-strong);">${Store.formatBRL(dash.contasPagarStatus?.totalPendente || 0)}</div>
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
                      <div class="rh-meta">${escapeHtml(c.client)}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-weight:700; color:${c.diasRestantes <= 7 ? 'var(--color-danger)' : 'var(--color-warning)'};">${c.diasRestantes}d</div>
                      <div class="rh-meta">${new Date(c.endDate).toLocaleDateString('pt-BR')}</div>
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
                          <div class="rh-meta">${escapeHtml(c.client)}</div>
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
        ${(() => {
          const filtradas = (dash.recentCaixaEntries || [])
            .filter(e => this.movFiltro === 'ambos' ? true : e.type === this.movFiltro)
            .slice(0, 20);
          return `
          <div class="card" style="margin-top:var(--sp-lg);">
            <div class="card-header">
              <h3 class="card-title">Últimas Movimentações — Caixa</h3>
              <div style="display:flex;align-items:center;gap:var(--sp-md);">
                <div id="movFiltroCtrl" style="display:inline-flex;border:1px solid var(--color-border);border-radius:6px;overflow:hidden;">
                  ${[
                    { k: 'ambos',   l: 'Ambos',   c: '#60A5FA' },
                    { k: 'entrada', l: 'Entradas', c: 'var(--color-success)' },
                    { k: 'saida',   l: 'Saídas',  c: 'var(--color-danger)' },
                  ].map((b, i) => `
                    <button data-filtro="${b.k}" style="
                      padding:5px 12px;border:0;cursor:pointer;font-size:13px;font-weight:600;
                      background:${this.movFiltro === b.k ? b.c : 'transparent'};
                      color:${this.movFiltro === b.k ? '#fff' : 'var(--color-text-muted)'};
                      ${i < 2 ? 'border-right:1px solid var(--color-border);' : ''}
                    ">${b.l}</button>
                  `).join('')}
                </div>
                <a href="#/caixa" class="rh-link">Ver todos →</a>
              </div>
            </div>
            ${filtradas.length === 0 ? `
              <p style="color:var(--color-text-muted);padding:var(--sp-md) 0;">Nenhuma movimentação no filtro selecionado</p>
            ` : `
              <div style="display:flex; flex-direction:column;">
                ${filtradas.map(e => `
                  <div class="row-dash-mov" data-id="${e.id}" style="display:flex; justify-content:space-between; align-items:center; padding:var(--sp-md) 0; border-bottom:1px solid var(--color-border); cursor:pointer;">
                    <div>
                      <div style="font-weight:500;">${escapeHtml(e.description)}</div>
                      <div class="rh-meta">${new Date(e.date).toLocaleDateString('pt-BR')}${e.formaPagamento ? ' · ' + escapeHtml(e.formaPagamento) : ''}${e.category ? ' · ' + escapeHtml(e.category) : ''}</div>
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
              <div style="padding:var(--sp-sm) 0 0;color:var(--color-text-muted);font-size:13px;text-align:center;">
                ${filtradas.length} movimentaç${filtradas.length === 1 ? 'ão' : 'ões'} exibida${filtradas.length === 1 ? '' : 's'}
              </div>
            `}
          </div>`;
        })()}
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

    // Botões 30/60/90 dias de projeção
    document.querySelectorAll('#projDaysCtrl button[data-days]').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.dataset.days);
        if (d && d !== this.projDays) {
          this.projDays = d;
          this.render();
        }
      });
    });

    // Filtro entrada/saída/ambos
    document.querySelectorAll('#movFiltroCtrl button[data-filtro]').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.filtro;
        if (f && f !== this.movFiltro) {
          this.movFiltro = f;
          this.render();
        }
      });
    });

    // Click na linha de movimentação → modal de detalhe (reusa Caixa.showDetail)
    document.querySelectorAll('.row-dash-mov').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.id;
        if (window.Caixa?.showDetail) window.Caixa.showDetail(id);
      });
    });

    // Click na linha de entradas previstas → modal de detalhe da NF
    document.querySelectorAll('.row-dash-fut').forEach(row => {
      row.addEventListener('click', () => {
        const nfId = row.dataset.nfId;
        if (window.NotasFiscais?.showDetail) window.NotasFiscais.showDetail(nfId);
      });
    });
  },

  // Pipeline de medições (mês corrente): Rascunho → Aguard. emissão → NF emitida → Recebida
  // - Rascunho: saída sem nf_id
  // - Aguard. emissão: saída com nf_id mas NF não emitida
  // - NF emitida: NF.emitida=true mas sem caixa_entry_id (não recebida)
  // - Recebida: NF.emitida=true E com caixa_entry_id
  _calcPipeline(nfsList, saidasList) {
    const hoje = new Date();
    const mesIni = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inMes = (dStr) => dStr && new Date(dStr) >= mesIni;
    const nfById = new Map(nfsList.map(n => [n.id, n]));
    const stats = {
      rascunho:      { count: 0, valor: 0 },
      aguardEmissao: { count: 0, valor: 0 },
      nfEmitida:     { count: 0, valor: 0 },
      recebida:      { count: 0, valor: 0 },
    };
    saidasList.filter(s => inMes(s.date)).forEach(s => {
      const v = parseFloat(s.value) || 0;
      const nfId = s.nfId || s.nf_id;
      const nf = nfId ? nfById.get(nfId) : null;
      if (!nf) {
        stats.rascunho.count++; stats.rascunho.valor += v;
      } else if (!nf.emitida && nf.status !== 'emitida') {
        stats.aguardEmissao.count++; stats.aguardEmissao.valor += v;
      } else if (!(nf.caixaEntryId || nf.caixa_entry_id)) {
        stats.nfEmitida.count++; stats.nfEmitida.valor += v;
      } else {
        stats.recebida.count++; stats.recebida.valor += v;
      }
    });
    return stats;
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

    // Alertas de RDO (compliance de obras)
    const rs = this._rdoStats;
    if (rs && !rs.ehFimDeSemana) {
      if (rs.obrasSemRdoOntem && rs.obrasSemRdoOntem.length > 0) {
        const nomes = rs.obrasSemRdoOntem.slice(0, 3).map(o => o.name).join(', ');
        const sufixo = rs.obrasSemRdoOntem.length > 3 ? ` e mais ${rs.obrasSemRdoOntem.length - 3}` : '';
        alertas.push({ tipo: 'danger', msg: `🔴 ${rs.obrasSemRdoOntem.length} obra(s) sem RDO no último dia útil: ${nomes}${sufixo} — <a href="#/rdos" style="color:inherit;text-decoration:underline;">ver RDOs</a>` });
      }
      if (rs.obrasAtrasadas && rs.obrasAtrasadas.length > 0) {
        alertas.push({ tipo: 'warning', msg: `⚠️ ${rs.obrasAtrasadas.length} obra(s) com mais de 2 dias úteis sem RDO — <a href="#/rdos" style="color:inherit;text-decoration:underline;">ver RDOs</a>` });
      }
      if (typeof rs.aderencia7d === 'number' && rs.aderencia7d < 50) {
        alertas.push({ tipo: 'warning', msg: `⚠️ Aderência de RDOs nos últimos ${rs.diasUteisAvaliados} dias úteis: ${rs.aderencia7d}% — abaixo do esperado` });
      }
    }

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

    // Cores adaptáveis ao tema (light/dark)
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const tc = {
      text:    isDark ? '#FFFFFF' : '#1f2937',
      grid:    isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      tipBg:   isDark ? '#0F1523' : '#FFFFFF',
      tipBorder: isDark ? '#1C2840' : '#e5e7eb',
      tipText: isDark ? '#FFFFFF' : '#1f2937',
      hojeLine: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
    };

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
            labels: { usePointStyle: true, padding: 20, color: tc.text, font: { size: 14, family: 'Nunito', weight: '600' } }
          },
          tooltip: {
            backgroundColor: tc.tipBg,
            borderColor: tc.tipBorder,
            borderWidth: 1,
            titleColor: tc.tipText,
            bodyColor: tc.tipText,
            titleFont: { size: 13 },
            bodyFont: { size: 13 },
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
                borderColor: tc.hojeLine,
                borderWidth: 1,
                borderDash: [4, 4],
                label: { display: true, content: 'Hoje', position: 'start', font: { size: 12, weight: '600' }, color: tc.text }
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: tc.grid },
            ticks: { color: tc.text, font: { size: 13, weight: '500' }, maxTicksLimit: 12 }
          },
          y: {
            grid: { color: tc.grid },
            ticks: {
              color: tc.text,
              font: { size: 13, weight: '500' },
              callback: v => v >= 1000000 ? 'R$' + (v/1000000).toFixed(1) + 'M' : v >= 1000 ? 'R$' + (v/1000).toFixed(0) + 'k' : 'R$' + v
            }
          }
        }
      }
    });
  }
};
