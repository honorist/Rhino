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
    const meses = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];
    if (modo === 'mes') return `${meses[mes - 1]} ${ano}`;
    if (modo === 'ano') return `Ano ${ano}`;
    return '30 dias recentes + projeção';
  },

  async render() {
    const app = document.getElementById('app');
    // Disparar carregamento de Chart.js em paralelo com o skeleton — quando o
    // renderChart() for chamado mais abaixo, await garantirá que esteja pronto.
    if (window.RhinoLazy)
      window.RhinoLazy.ensure('chart').catch((e) =>
        console.error(
          '[Dashboard] falha ao pré-carregar Chart.js — gráficos podem não renderizar:',
          e?.message || e
        )
      );
    app.innerHTML = `
      <div class="dashboard-skeleton" aria-busy="true">
        <div class="grid grid-4" style="margin-bottom:24px;">
          <div class="skeleton skeleton--card"></div>
          <div class="skeleton skeleton--card"></div>
          <div class="skeleton skeleton--card"></div>
          <div class="skeleton skeleton--card"></div>
        </div>
        <div class="grid grid-2" style="margin-bottom:24px;">
          <div class="skeleton" style="height:220px;border-radius:10px;"></div>
          <div class="skeleton" style="height:220px;border-radius:10px;"></div>
        </div>
        <div style="background:var(--color-surface);padding:16px;border-radius:10px;border:1px solid var(--color-border);">
          ${window.RhinoUI && window.RhinoUI.skeletonRows ? window.RhinoUI.skeletonRows(6) : ''}
        </div>
      </div>`;

    try {
      // Carrega tudo em PARALELO. Antes era um waterfall de 6 etapas sequenciais
      // (cada `await` esperava a anterior terminar) — ~6× a latência de rede.
      // loadAll, loadDashboard, /api/rdos, /api/anomalias e loadFor(propostas)
      // são independentes entre si; cada um trata o próprio erro (não bloqueia).
      const [, , rdoJson, anomJson, , opJson, cobJson] = await Promise.all([
        Store.loadAll(),
        Store.loadDashboard(this._buildParams()),
        fetch('/api/rdos')
          .then((r) => (r.ok ? r.json() : null))
          .catch((e) => {
            console.warn(
              '[Dashboard] /api/rdos falhou — KPIs de compliance ficarão zerados:',
              e?.message || e
            );
            return null;
          }),
        fetch('/api/anomalias')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        Store.loadFor(['propostas']).catch((e) => {
          console.warn(
            '[Dashboard] Store.loadFor(propostas) falhou — KPIs de prospecção ficarão zerados:',
            e?.message || e
          );
        }),
        fetch('/api/dashboard/operacional')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch('/api/dashboard/cobranca')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      const dash = Store.state.dashboard;
      // `rdoStats` local é usado mais abaixo na montagem do HTML (KPI de RDO,
      // painel de aderência); `this._rdoStats` é usado por renderAlertas.
      const rdoStats = rdoJson ? rdoJson.stats || null : null;
      this._rdoStats = rdoStats;
      // RDO é diário: cada (obra × dia útil) sem RDO conta 1 atraso.
      const rdosAtrasados = (rdoStats?.aderenciaDiaria || []).reduce(
        (s, d) => s + Math.max(0, (d.esperados || 0) - (d.feitos || 0)),
        0
      );
      this._anomalias = anomJson ? anomJson.anomalias || [] : [];

      // nf/cp/socios/investimentos: loadAll() JÁ trouxe as 4 — antes o Dashboard
      // refazia exatamente as mesmas 4 requisições. Agora lemos de Store.state.
      const nfsList = Store.state.notas_fiscais || [];
      const cpList = Store.state.contas_pagar || [];
      const sociosList = Store.state.socios || [];
      const investList = Store.state.investimentos || [];
      const saidasList = Store.state.saidas || [];

      // Pipeline de medições (mês corrente)
      const pipeline = this._calcPipeline(nfsList, saidasList);

      // Colaboradores ativos
      const recursos = Store.state.recursos || [];
      const colaboradoresAtivos = recursos.filter((r) => r.status === 'funcionario').length;
      const colaboradoresCandidatos = recursos.filter((r) => r.status === 'candidato').length;

      // Aportes acumulados (sócios + investimentos com origem 'empresa')
      const aportesSocios = sociosList.reduce(
        (s, x) => s + (parseFloat(x.aporteTotal || x.aporte_total || x.aporte) || 0),
        0
      );
      const aportesEmpresa = investList
        .filter((i) => (i.origem || '').toLowerCase() === 'empresa')
        .reduce((s, i) => s + (parseFloat(i.value || i.valor) || 0), 0);
      const aportesTotal = aportesSocios + aportesEmpresa;

      // Propostas em prospecção (rascunho + enviada — ainda não viraram contrato
      // ativo). Já carregadas no Promise.all do início do render().
      const propostasState = Store.state.propostas || [];
      const propostasRascunho = propostasState.filter((p) => p.status === 'rascunho').length;
      const propostasEnviada = propostasState.filter((p) => p.status === 'enviada').length;
      const propostasAceita = propostasState.filter((p) => p.status === 'aceita').length;
      const propostasProspeccao = propostasRascunho + propostasEnviada;
      const valorPropostasProspeccao = propostasState
        .filter((p) => p.status === 'rascunho' || p.status === 'enviada')
        .reduce((s, p) => s + (parseFloat(p.valorTotal || p.valor_total) || 0), 0);

      // A receber (NFs emitidas, valor + contagens)
      const nfsEmitidas = nfsList.filter((n) => n.emitida || n.status === 'emitida');
      const nfsPendentes = nfsList.filter((n) => !n.emitida && n.status !== 'emitida');
      const totalAReceber = nfsEmitidas
        .filter((n) => !n.caixaEntryId && !n.caixa_entry_id) // emitidas mas ainda não recebidas
        .reduce((s, n) => s + (parseFloat(n.valor || n.totalLiquido || n.valorTotal) || 0), 0);

      // A pagar próximos 30 dias
      const hojeStr2 = new Date().toISOString().split('T')[0];
      const em30str = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
      })();
      const cpPendentes = cpList.filter((c) => c.status === 'pendente' || c.status === 'aberto');
      const cp30d = cpPendentes.filter((c) => {
        const v = c.dataVencimento || c.data_vencimento;
        return v && v <= em30str;
      });
      const totalAPagar30d = cp30d.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);

      // Faturado mês corrente (entradas no caixa) e mês anterior para delta
      const hojeD = new Date();
      const mesIni = new Date(hojeD.getFullYear(), hojeD.getMonth(), 1).toISOString().split('T')[0];
      const mesAntIni = new Date(hojeD.getFullYear(), hojeD.getMonth() - 1, 1)
        .toISOString()
        .split('T')[0];
      const mesAntFim = new Date(hojeD.getFullYear(), hojeD.getMonth(), 0)
        .toISOString()
        .split('T')[0];
      const caixaEntries = Array.isArray(Store.state.caixa)
        ? Store.state.caixa
        : Store.state.caixa?.entries || [];
      const faturadoMes = caixaEntries
        .filter((e) => e.type === 'entrada' && e.date >= mesIni)
        .reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
      const faturadoMesAnt = caixaEntries
        .filter((e) => e.type === 'entrada' && e.date >= mesAntIni && e.date <= mesAntFim)
        .reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
      const deltaFaturadoPct =
        faturadoMesAnt > 0 ? ((faturadoMes - faturadoMesAnt) / faturadoMesAnt) * 100 : 0;

      // Cobertura de caixa (saldo / saídas médias mensais últimos 3 meses)
      const tres30 = new Date();
      tres30.setDate(tres30.getDate() - 90);
      const tres30str = tres30.toISOString().split('T')[0];
      const saidasUlt90 = caixaEntries
        .filter((e) => e.type === 'saida' && e.date >= tres30str)
        .reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
      const saidaMediaMensal = saidasUlt90 / 3;
      const coberturaMeses = saidaMediaMensal > 0 ? dash.caixaBalance / saidaMediaMensal : 0;

      // Saudação dinâmica
      const horaH = hojeD.getHours();
      const saudacaoTxt = horaH < 12 ? 'Bom dia' : horaH < 18 ? 'Boa tarde' : 'Boa noite';
      const userObj = (window.auth && window.auth.user && window.auth.user()) || null;
      const primeiroNome = (userObj?.name || userObj?.email || '').split(/[\s@]/)[0] || 'visitante';
      const subParts = [];
      subParts.push(dash.caixaBalance >= 0 ? 'Caixa positivo' : 'Caixa negativo');
      const bmsAguard = pipeline.aguardEmissao.count;
      if (bmsAguard > 0)
        subParts.push(`${bmsAguard} BM${bmsAguard !== 1 ? 's' : ''} aguardando emissão`);
      if (rdosAtrasados > 0)
        subParts.push(
          `${rdosAtrasados} RDO${rdosAtrasados !== 1 ? 's' : ''} atrasado${rdosAtrasados !== 1 ? 's' : ''}`
        );

      const totalSaidas = (Store.state.saidas || []).reduce((sum, s) => sum + s.value, 0);
      const taxaDespesa =
        dash.totalContractValue > 0
          ? ((totalSaidas / dash.totalContractValue) * 100).toFixed(1)
          : 0;
      const marginMedia =
        dash.contractsWithMargin.length > 0
          ? (
              dash.contractsWithMargin.reduce((sum, c) => sum + parseFloat(c.marginPct), 0) /
              dash.contractsWithMargin.length
            ).toFixed(1)
          : 0;

      const saudeScore = this.calcularScore(
        parseFloat(taxaDespesa),
        parseFloat(marginMedia),
        dash.caixaBalance
      );

      const _icon = (name, size) => (window.rhIcon ? window.rhIcon(name, size || 16) : '');

      // Sparkline SVG inline a partir de um array de números (45 pontos ideal)
      const _spark = (values, tone) => {
        if (!values || values.length < 2) return '';
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const w = 80,
          h = 26,
          p = 2;
        const stepX = (w - p * 2) / (values.length - 1);
        const points = values
          .map((v, i) => {
            const x = p + i * stepX;
            const y = h - p - ((v - min) / range) * (h - p * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ');
        const cls =
          { pos: 'rh-spark-pos', neg: 'rh-spark-neg', warn: 'rh-spark-warn' }[tone] ||
          'rh-spark-neutral';
        return `<svg class="rh-spark ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      };

      // Calcula séries diárias (últimos 45 dias) para sparklines a partir de caixaEntries
      const _spark45 = (() => {
        const days = 45;
        const arr = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          arr.push(d.toISOString().split('T')[0]);
        }
        const sumByDay = (filterFn) =>
          arr.map((date) =>
            caixaEntries
              .filter((e) => e.date <= date && filterFn(e))
              .reduce((s, e) => s + (parseFloat(e.value) || 0), 0)
          );
        return {
          saldo: arr.map((date) =>
            caixaEntries
              .filter((e) => e.date <= date)
              .reduce((s, e) => s + (e.type === 'entrada' ? 1 : -1) * (parseFloat(e.value) || 0), 0)
          ),
          entradasAcum: sumByDay((e) => e.type === 'entrada'),
          saidasAcum: sumByDay((e) => e.type === 'saida'),
          // diferença diária (não acumulado) para "faturado mês"
          entradaDia: arr.map((date) =>
            caixaEntries
              .filter((e) => e.date === date && e.type === 'entrada')
              .reduce((s, e) => s + (parseFloat(e.value) || 0), 0)
          ),
        };
      })();

      const _kpi = (opts) => {
        const tone = opts.tone || '';
        const valueColor =
          tone === 'pos'
            ? 'var(--rh-pos-strong)'
            : tone === 'neg'
              ? 'var(--rh-neg-strong)'
              : tone === 'warn'
                ? 'var(--rh-warn-strong)'
                : 'var(--rh-ink-900)';
        const deltaCls =
          opts.deltaTone === 'pos'
            ? 'rh-kpi-delta-pos'
            : opts.deltaTone === 'neg'
              ? 'rh-kpi-delta-neg'
              : '';
        const sparkSvg = opts.spark ? _spark(opts.spark, opts.deltaTone || tone || 'neutral') : '';
        const tooltip = opts.tooltip ? ` title="${escapeHtml(opts.tooltip)}"` : '';
        return `
          <a href="${opts.href || '#'}" class="rh-kpi" style="text-decoration:none;color:inherit;cursor:pointer;" aria-label="${escapeHtml(opts.label + ': ' + opts.value)}"${tooltip}>
            <div class="rh-kpi-label">${escapeHtml(opts.label)}</div>
            <div class="rh-kpi-value" style="color:${valueColor};">${opts.value}</div>
            <div class="rh-kpi-meta" style="justify-content:space-between;">
              <div class="rh-row-sm" style="min-width:0;flex:1;">
                ${opts.deltaIcon ? `<span class="${deltaCls}">${_icon(opts.deltaIcon, 12)}</span>` : ''}
                <span style="overflow:hidden;text-overflow:ellipsis;">${opts.meta || ''}</span>
              </div>
              ${sparkSvg}
            </div>
          </a>
        `;
      };

      // Score card especial (estilo hero) com gauge + sub-bars
      const _scoreCard = () => {
        const score =
          parseFloat(saudeScore.label.match(/\d+/)?.[0] || '0') ||
          (() => {
            // calcula pontos como em calcularScore
            let p = 100;
            if (parseFloat(taxaDespesa) > 80) p -= 40;
            else if (parseFloat(taxaDespesa) > 60) p -= 20;
            if (parseFloat(marginMedia) < 0) p -= 30;
            else if (parseFloat(marginMedia) < 10) p -= 15;
            if (dash.caixaBalance < 0) p -= 20;
            return p;
          })();
        const scoreLabel = score >= 80 ? 'Saudável' : score >= 60 ? 'Atenção' : 'Crítico';
        const scoreColor =
          score >= 80
            ? 'var(--rh-pos-strong)'
            : score >= 60
              ? 'var(--rh-warn-strong)'
              : 'var(--rh-neg-strong)';
        const r = 36,
          c = 2 * Math.PI * r;
        const offset = c - (score / 100) * c;
        const margemPct = parseFloat(marginMedia) || 0;
        const taxaPct = parseFloat(taxaDespesa) || 0;
        const cobMeses = coberturaMeses;
        const cobScore = Math.min(100, Math.max(0, (cobMeses / 6) * 100)); // 6 meses = 100%
        const periodLabel = hojeD.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        return `
          <a href="#/contratos" class="rh-score-card" style="text-decoration:none;color:inherit;display:block;"
             title="Score de 0 a 100 calculado a partir de 3 fatores: taxa de despesa, margem média e saldo de caixa. Saudável ≥80, Atenção 60–79, Crítico <60. Vide Manual → Dashboard / Indicadores para detalhes.">
            <div class="rh-row" style="justify-content:space-between;align-items:flex-start;margin-bottom:var(--sp-md);">
              <div>
                <h3 class="rh-h2" style="margin:0;">Score de saúde financeira</h3>
                <div class="rh-meta">${periodLabel.replace('.', '')} · ${dash.activeContracts} contrato${dash.activeContracts !== 1 ? 's' : ''} ativo${dash.activeContracts !== 1 ? 's' : ''}</div>
              </div>
            </div>
            <div class="rh-row" style="gap:18px;">
              <div class="rh-gauge">
                <svg viewBox="0 0 80 80">
                  <circle class="rh-gauge-bg" cx="40" cy="40" r="${r}" stroke-width="6"/>
                  <circle class="rh-gauge-fg" cx="40" cy="40" r="${r}" stroke-width="6" stroke-dasharray="${c}" stroke-dashoffset="${offset}" style="stroke:${scoreColor};"/>
                </svg>
                <div class="rh-gauge-num">
                  <span class="rh-gauge-num-val">${score}</span>
                  <span class="rh-gauge-num-max">/100</span>
                </div>
              </div>
              <div style="flex:1;">
                <div class="rh-label" style="margin-bottom:4px;">${scoreLabel}</div>
                <div class="rh-display" style="font-size:34px;font-weight:800;color:${scoreColor};line-height:1;">${score}</div>
                <div class="rh-row-sm" style="margin-top:6px;">${_icon('arrow-up', 12)}<span class="rh-meta">aderência atual</span></div>
              </div>
            </div>
            <div class="rh-score-bars">
              <div class="rh-score-bar" title="Média da margem (lucro / receita) de cada contrato ativo. Acima de 20% = saudável, 0–20% = apertado, abaixo de 0% = prejuízo.">
                <div class="rh-score-bar-h"><span class="rh-muted">Margem operacional</span><b>${margemPct.toFixed(1)}%</b></div>
                <div class="rh-score-bar-track"><div class="rh-score-bar-fill is-accent" style="width:${Math.min(100, Math.max(0, margemPct * 3))}%;"></div></div>
              </div>
              <div class="rh-score-bar" title="Total de saídas dos contratos ÷ valor total contratado, em %. Quanto da receita vai para custos. Acima de 80% pesa −40 no score; entre 60–80% pesa −20.">
                <div class="rh-score-bar-h"><span class="rh-muted">Taxa de despesa</span><b>${taxaPct.toFixed(1)}%</b></div>
                <div class="rh-score-bar-track"><div class="rh-score-bar-fill" style="width:${Math.min(100, taxaPct)}%;"></div></div>
              </div>
              <div class="rh-score-bar" title="Quantos meses o saldo atual cobre, dado o gasto médio mensal dos últimos 90 dias. Indicador de runway financeiro. Ideal ≥3 meses.">
                <div class="rh-score-bar-h"><span class="rh-muted">Cobertura de caixa</span><b>${cobMeses > 0 ? cobMeses.toFixed(1) + ' meses' : '—'}</b></div>
                <div class="rh-score-bar-track"><div class="rh-score-bar-fill" style="width:${cobScore.toFixed(0)}%;"></div></div>
              </div>
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

        <!-- COBRANÇA POR ÁREA — semáforo do que está parado, há quantos dias e
             onde resolver. Topo absoluto: é a fila de cobrança do dono. -->
        ${this._renderCobranca(cobJson)}

        <!-- APANHADO GERAL — operação no topo: contratações, compras, estoque, frota.
             Promovido do rodapé porque é o que o gestor cobra primeiro (montagem é
             execução + mão de obra + suprimentos, não só caixa). -->
        ${this._renderOperacional(opJson)}

        <!-- Hero: Score card + grid de KPIs com sparklines -->
        <div style="display:grid;grid-template-columns:minmax(320px, 1fr) minmax(0, 2fr);gap:var(--sp-md);margin-bottom:var(--sp-md);">
          ${_scoreCard()}
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--sp-md);">
            ${_kpi({
              href: '#/caixa',
              label: 'Saldo em caixa',
              value: Store.formatBRLk(dash.caixaBalance),
              tone: dash.caixaBalance >= 0 ? 'pos' : 'neg',
              deltaIcon: 'arrow-up',
              deltaTone: dash.caixaBalance >= 0 ? 'pos' : 'neg',
              meta: dash.caixaBalance >= 0 ? 'caixa positivo' : 'caixa negativo',
              spark: _spark45.saldo,
              tooltip: `${Store.formatBRL(dash.caixaBalance)} · Saldo bruto histórico: soma de todas as entradas menos todas as saídas, independente do mês.`,
            })}
            ${_kpi({
              href: '#/notas-fiscais',
              label: 'A receber (NFs)',
              value: Store.formatBRLk(totalAReceber),
              meta: `${nfsEmitidas.length} emitidas · ${nfsPendentes.length} pendentes`,
              spark: _spark45.entradasAcum,
              deltaTone: 'pos',
              tooltip: `${Store.formatBRL(totalAReceber)} · NFs emitidas mas ainda sem entrada no caixa.`,
            })}
            ${_kpi({
              href: '#/contas-pagar',
              label: 'A pagar (30d)',
              value: Store.formatBRLk(totalAPagar30d),
              tone: totalAPagar30d > 0 ? 'warn' : '',
              deltaIcon: cp30d.length > 0 ? 'arrow-down' : '',
              deltaTone: 'neg',
              meta: `${cp30d.length} lançamento${cp30d.length !== 1 ? 's' : ''}`,
              spark: _spark45.saidasAcum,
              tooltip: `${Store.formatBRL(totalAPagar30d)} · Contas pendentes nos próximos 30 dias (incluindo vencidas).`,
            })}
            ${_kpi({
              href: '#/caixa',
              label: 'Faturado (mês)',
              value: Store.formatBRLk(faturadoMes),
              deltaIcon:
                faturadoMesAnt > 0 ? (deltaFaturadoPct >= 0 ? 'arrow-up' : 'arrow-down') : '',
              deltaTone: deltaFaturadoPct >= 0 ? 'pos' : 'neg',
              meta:
                faturadoMesAnt > 0
                  ? `${Math.abs(deltaFaturadoPct).toFixed(1)}% vs mês ant.`
                  : 'sem comparativo',
              spark: _spark45.entradaDia,
              tooltip: `${Store.formatBRL(faturadoMes)} · Entradas do mês. Variação compara com mês anterior.`,
            })}
            ${_kpi({
              href: '#/contratos',
              label: 'Margem média',
              value: marginMedia + '%',
              tone:
                parseFloat(marginMedia) > 20 ? 'pos' : parseFloat(marginMedia) > 0 ? 'warn' : 'neg',
              deltaIcon: parseFloat(marginMedia) > 0 ? 'arrow-up' : 'arrow-down',
              deltaTone: parseFloat(marginMedia) > 0 ? 'pos' : 'neg',
              meta: `${dash.activeContracts} contrato${dash.activeContracts !== 1 ? 's' : ''} ativo${dash.activeContracts !== 1 ? 's' : ''}`,
              spark: _spark45.saldo.map((v, i) => v - (_spark45.saidasAcum[i] || 0)),
              tooltip:
                'Média aritmética simples das margens realizadas dos contratos ativos. Margem realizada = (recebido − custos pagos, do caixa) ÷ recebido × 100.',
            })}
            <!-- Hero enxuto: 6 KPIs essenciais. Prospecção/Aportes/Colaboradores
                 saíram daqui (continuam nas próprias páginas via menu). -->
            ${
              rdoStats
                ? rdoStats.aderencia7d == null
                  ? _kpi({
                      href: '#/rdos',
                      label: `Aderência RDO ${rdoStats.diasUteisAvaliados}d`,
                      value: '—',
                      tone: 'neutral',
                      meta: 'sem obra ativa pra medir',
                      spark: [],
                      tooltip: `Aderência = RDOs lançados ÷ (obras ativas × ${rdoStats.diasUteisAvaliados} dias úteis avaliados) × 100. Sem obra ativa no período, não há o que medir.`,
                    })
                  : _kpi({
                      href: '#/rdos',
                      label: `Aderência RDO ${rdoStats.diasUteisAvaliados}d`,
                      value: rdoStats.aderencia7d + '%',
                      tone:
                        rdoStats.aderencia7d >= 80
                          ? 'pos'
                          : rdoStats.aderencia7d >= 50
                            ? 'warn'
                            : 'neg',
                      deltaIcon: rdoStats.aderencia7d >= 80 ? 'arrow-up' : 'arrow-down',
                      deltaTone: rdoStats.aderencia7d >= 80 ? 'pos' : 'neg',
                      meta:
                        rdosAtrasados > 0
                          ? `${rdosAtrasados} RDO${rdosAtrasados !== 1 ? 's' : ''} atrasado${rdosAtrasados !== 1 ? 's' : ''}`
                          : 'tudo em dia',
                      spark: (rdoStats.aderenciaDiaria || []).map((d) => d.pct),
                      tooltip: `Aderência = RDOs lançados ÷ (obras ativas × ${rdoStats.diasUteisAvaliados} dias úteis avaliados) × 100. Verde ≥80%, amarelo 50–79%, vermelho <50%.`,
                    })
                : ''
            }
          </div>
        </div>

        <!-- 2 colunas: ESQUERDA = Receivables/Pagar + Pipeline · DIREITA = RDO -->
        <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:var(--sp-md);margin-bottom:var(--sp-md);align-items:stretch;">
          <div style="display:flex;flex-direction:column;gap:var(--sp-md);">
            <!-- Contas a Receber / Contas a Pagar -->
            ${this.renderReceivablesPayables()}

            <!-- Pipeline de Medições — slim, alinhado no rodapé via margin-top:auto -->
            <div class="card" style="margin-bottom:0;margin-top:auto;padding:12px 16px;">
              <div class="rh-between" style="margin-bottom:8px;">
                <div class="rh-row-sm">
                  <h3 class="rh-h3" style="margin:0;">Pipeline de medições</h3>
                  <span class="rh-meta-xs">— ${hojeD.toLocaleDateString('pt-BR', { month: 'long' })}</span>
                </div>
                <a href="#/contratos" style="text-decoration:none;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:4px;color:var(--rh-brand-500);">Ver saídas ${_icon('arrow-right', 12)}</a>
              </div>
              <div role="list" aria-label="Estágios do pipeline" style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;">
                ${[
                  {
                    l: 'Rascunho',
                    d: pipeline.rascunho,
                    active: false,
                    tip: 'Saídas (BMs) cadastradas mas ainda sem NF vinculada.',
                  },
                  {
                    l: 'Aguard. emissão',
                    d: pipeline.aguardEmissao,
                    active: true,
                    tip: 'Saídas com NF cadastrada mas ainda não emitida.',
                  },
                  {
                    l: 'NF emitida',
                    d: pipeline.nfEmitida,
                    active: false,
                    tip: 'NF emitida, aguardando recebimento.',
                  },
                  {
                    l: 'Recebida',
                    d: pipeline.recebida,
                    active: false,
                    tip: 'Pagamento recebido — ciclo completo.',
                  },
                ]
                  .map(
                    (s) => `
                  <div role="listitem" title="${escapeHtml(s.tip)}"
                       style="padding:8px 10px;border-radius:6px;border:1px solid var(--rh-ink-200);${s.active ? 'background:var(--rh-warn-bg);border-left:3px solid var(--rh-warn-strong);' : 'border-left:3px solid var(--rh-ink-300);'}">
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:${s.active ? 'var(--rh-warn-text)' : 'var(--rh-ink-500)'};line-height:1.2;">${s.l}</div>
                    <div class="rh-row" style="justify-content:space-between;align-items:baseline;margin-top:4px;gap:6px;">
                      <span style="font-family:var(--rh-font-display);font-size:18px;font-weight:800;line-height:1;color:var(--rh-ink-900);">${s.d.count}</span>
                      <span class="rh-meta-xs" style="font-variant-numeric:tabular-nums;">${Store.formatBRL(s.d.valor).replace('R$ ', '')}</span>
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          </div>

          <!-- Aderência RDO -->
          <div>
        ${
          rdoStats
            ? (() => {
                const ativas = rdoStats.obrasAtivas || 0;
                const sem = (rdoStats.obrasSemRdoOntem || []).length;
                const lancados = Math.max(0, ativas - sem);
                const atrasadas = rdoStats.obrasAtrasadas || [];
                const aderMes =
                  rdoStats.aderenciaMes != null ? rdoStats.aderenciaMes : rdoStats.aderencia7d;
                const aderColor =
                  aderMes == null
                    ? 'var(--rh-ink-500)'
                    : aderMes >= 80
                      ? 'var(--rh-pos-strong)'
                      : aderMes >= 50
                        ? 'var(--rh-warn-strong)'
                        : 'var(--rh-neg-strong)';
                const aderMesLabel = aderMes == null ? '—' : `${aderMes}%`;
                const semList = rdoStats.obrasSemRdoOntem || [];
                return `
          <div class="card" style="margin-bottom:0;">
            <div class="rh-between" style="margin-bottom:var(--sp-md);">
              <div>
                <h3 class="rh-h2" style="margin:0;">RDOs</h3>
                <div class="rh-meta">Aderência mensal</div>
              </div>
              ${
                atrasadas.length > 0
                  ? `<span class="rh-pill rh-pill-warn"><span class="rh-pill-dot"></span>${atrasadas.length} atrasado${atrasadas.length !== 1 ? 's' : ''}</span>`
                  : `<span class="rh-pill rh-pill-pos"><span class="rh-pill-dot"></span>em dia</span>`
              }
            </div>
            <div style="display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:8px 0;">
              <div class="rh-display" style="font-size:42px;font-weight:800;color:${aderColor};line-height:1;grid-row:span 3;align-self:center;">${aderMesLabel}<div style="font-size:11px;font-weight:600;color:var(--rh-ink-500);text-transform:uppercase;letter-spacing:.06em;margin-top:6px;">aderência mês</div></div>
              <div style="border-top:1px solid var(--rh-ink-200);padding-top:8px;font-size:14px;color:var(--rh-ink-700);" title="Quantas obras ativas tiveram RDO lançado no último dia útil, sobre o total de obras ativas previstas.">Lançados ontem</div>
              <div style="border-top:1px solid var(--rh-ink-200);padding-top:8px;font-size:14px;font-weight:700;text-align:right;" title="X de Y obras ativas com RDO no último dia útil.">${lancados}<span style="color:var(--rh-ink-500);">/${ativas}</span></div>
              <div style="font-size:14px;color:var(--rh-ink-700);" title="Obras ativas que NÃO tiveram RDO lançado no último dia útil.">Sem RDO ontem</div>
              <div style="text-align:right;" title="Obras sem RDO ontem."><span class="rh-pill ${sem > 0 ? 'rh-pill-warn' : 'rh-pill-pos'}">${sem}</span></div>
              <div style="font-size:14px;color:var(--rh-ink-700);" title="Obras com mais de 2 dias úteis sem RDO. Prioridade alta para cobrança.">Atrasados &gt;2du</div>
              <div style="text-align:right;" title="Obras atrasadas (>2 dias úteis sem RDO)."><span class="rh-pill ${atrasadas.length > 0 ? 'rh-pill-neg' : 'rh-pill-pos'}">${atrasadas.length}</span></div>
            </div>
            ${
              semList.length > 0
                ? `
              <div style="border-top:1px solid var(--rh-ink-200);margin-top:var(--sp-md);padding-top:var(--sp-md);">
                <div class="rh-label" style="margin-bottom:8px;">Obras sem RDO ontem</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${semList
                    .slice(0, 6)
                    .map((o) => {
                      // Tenta achar diasUteisSemRdo na lista de atrasadas
                      const a = atrasadas.find((x) => x.contractId === o.contractId);
                      const dias = a ? (a.nuncaFezRdo ? null : a.diasUteisSemRdo) : null;
                      const sub =
                        dias != null
                          ? `sem lançamento há ${dias} dia${dias !== 1 ? 's' : ''} úteis`
                          : 'sem lançamento ontem';
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
                    })
                    .join('')}
                  ${semList.length > 6 ? `<div class="rh-meta" style="text-align:center;padding-top:4px;">+ ${semList.length - 6} — <a href="#/rdos" class="rh-link">ver todas</a></div>` : ''}
                </div>
              </div>
            `
                : ''
            }
          </div>
          `;
              })()
            : ''
        }
          </div>
        </div>

        <!-- Alertas -->
        ${this.renderAlertas(dash)}

        <!-- Saúde Financeira + Gráfico Histórico + Projeção -->
        ${this._renderFluxoCaixaCard(dash, saudeScore, marginMedia, taxaDespesa)}

        <!-- Entradas previstas das NFs -->
        ${this._renderEntradasPrevistas(dash)}

        <!-- Situação NF + Contas a Pagar lado a lado (denso) -->
        <div class="grid grid-2">
          ${this._renderNfsSituacao(dash)}
          ${this._renderContasPagarSituacao(dash)}
        </div>

        <!-- Contratos a vencer + Margem -->
        ${this._renderContratosVencerMargem(dash)}

        <!-- Últimas movimentações -->
        ${this._renderUltimasMovimentacoes(dash)}
      `;

      app.innerHTML = html;

      // Customização: marca seções identificáveis e aplica preferências do usuário
      this._marcarWidgets();
      this._aplicarPreferenciasDash();
      this._injetarBotaoCustomizar();

      await this.renderChart(dash);
      this._bindPeriodoCtrl();
    } catch (e) {
      console.error(e);
      app.innerHTML =
        '<div class="card"><p class="text-danger">Erro ao carregar dashboard. Tente novamente.</p></div>';
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Seções do corpo do dashboard, extraídas de render() (Sprint 4: funções
  // menores). Cada uma recebe `dash` (Store.state.dashboard) e devolve string
  // HTML — sem estado próprio além de `this` (periodo/projDays/movFiltro), então
  // o DOM gerado é idêntico ao inline anterior (importante p/ _marcarWidgets,
  // que identifica os widgets pela ordem/título dos filhos de #app).
  // ─────────────────────────────────────────────────────────────────────────

  // Card "Fluxo de Caixa": legenda, seletor de projeção (30/60/90d), canvas do
  // gráfico e os 5 mini-KPIs do rodapé. `saudeScore`/`marginMedia`/`taxaDespesa`
  // vêm calculados de render() (dependem de agregações locais).
  _renderFluxoCaixaCard(dash, saudeScore, marginMedia, taxaDespesa) {
    return `
        <div class="card mb-md">
          <div class="card-header">
            <h3 class="card-title">Fluxo de Caixa — ${this._periodoLabel()}</h3>
            <div style="display:flex;align-items:center;gap:var(--sp-md);flex-wrap:wrap;">
              <div class="rh-row-sm">
                <div style="width:24px;height:3px;background:#F0B429;border-radius:2px;"></div>
                <span class="rh-meta">Realizado</span>
              </div>
              ${
                this.periodo.modo === 'recente'
                  ? `
              <div class="rh-row-sm">
                <div style="width:24px;height:3px;background:#60A5FA;border-radius:2px;border-top:2px dashed #60A5FA;"></div>
                <span class="rh-meta">Projetado (NFs)</span>
              </div>
              <div id="projDaysCtrl" style="display:inline-flex;border:1px solid var(--color-border);border-radius:6px;overflow:hidden;">
                ${[30, 60, 90]
                  .map(
                    (d) => `
                  <button data-days="${d}" style="
                    padding:6px 12px;border:0;cursor:pointer;font-size:13px;font-weight:600;
                    background:${this.projDays === d ? '#60A5FA' : 'transparent'};
                    color:${this.projDays === d ? '#fff' : 'var(--color-text-muted)'};
                    border-right:${d !== 90 ? '1px solid var(--color-border)' : '0'};
                  ">${d}d</button>
                `
                  )
                  .join('')}
              </div>
              `
                  : ''
              }
              <span style="font-weight:700;color:${saudeScore.color};font-size:15px;">${saudeScore.label}</span>
            </div>
          </div>
          <div style="position:relative;height:200px;">
            <canvas id="chartSaude"></canvas>
          </div>
        </div>`;
  },

  // Tabela "Entradas Previstas" (recebimento de NFs projetado). Some quando não
  // há projeção futura.
  _renderEntradasPrevistas(dash) {
    if (!(dash.projecaoFutura.length > 0)) return '';
    // Achata todas as entradas e mostra só as 6 mais próximas; o total agregado
    // e "ver todas" cobrem o resto (gerencial primeiro, detalhe no módulo de NFs).
    const todas = dash.projecaoFutura.flatMap((p) =>
      p.entradas.map((e) => ({ ...e, _data: p.data }))
    );
    const total = dash.projecaoFutura.reduce((s, p) => s + p.totalEntradas, 0);
    const linhas = todas.slice(0, 6);
    const resto = todas.length - linhas.length;
    return `
          <div class="card mb-md">
            <div class="card-header">
              <h3 class="card-title">Entradas Previstas — Recebimento de NFs</h3>
              <a href="#/notas-fiscais" class="rh-link">Ver todas →</a>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Data de Recebimento</th>
                    <th scope="col">NF</th>
                    <th scope="col">Contrato</th>
                    <th scope="col">Prazo</th>
                    <th scope="col" style="text-align:right;">Valor Esperado</th>
                  </tr>
                </thead>
                <tbody>
                  ${linhas
                    .map((e) => {
                      const contract = Store.getContractById(e.contractId);
                      const diasAte = Math.floor((new Date(e._data) - new Date()) / 86400000);
                      const urgCor =
                        diasAte <= 7
                          ? 'var(--color-success)'
                          : diasAte <= 30
                            ? 'var(--color-info)'
                            : 'var(--color-text-muted)';
                      return `
                      <tr class="row-dash-fut" data-nf-id="${e.nfId}" style="cursor:pointer;">
                        <td>
                          <strong style="color:${urgCor};">${new Date(e._data + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
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
                    })
                    .join('')}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="4" style="color:var(--color-text-muted);">${resto > 0 ? `+ ${resto} recebimento(s) — <a href="#/notas-fiscais" class="rh-link">ver todas</a>` : 'Total previsto'}</td>
                    <td style="text-align:right;font-weight:800;color:var(--color-success);">+${Store.formatBRL(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>`;
  },

  // Card "Notas Fiscais — Situação" (4 contadores por status).
  _renderNfsSituacao(dash) {
    return `
        <div class="card mb-md">
          <div class="card-header">
            <h3 class="card-title">Notas Fiscais — Situação</h3>
            <a href="#/notas-fiscais" class="rh-link">Ver todas →</a>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(105px,1fr)); gap:8px;">
            ${[
              { tone: 'neg', label: 'Vencidas', value: dash.nfsStatus.vencidas },
              { tone: 'warn', label: 'Próx. 7 dias', value: dash.nfsStatus.proximasVencer },
              { tone: 'pos', label: 'No prazo', value: dash.nfsStatus.noPrazo },
              { tone: 'info', label: 'Emitidas', value: dash.nfsStatus.emitidas || 0 },
            ]
              .map(
                (s) => `
              <div class="rh-pipeline-stage ${s.value > 0 && s.tone === 'neg' ? 'is-active' : ''}" style="text-align:left;">
                <div class="rh-pipeline-stage-label rh-row-sm">${window.rhStatusPill ? window.rhStatusPill(s.tone, s.label) : s.label}</div>
                <div class="rh-pipeline-stage-count">${s.value}</div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>`;
  },

  // Card "Contas a Pagar — Situação" (3 contadores + total pendente).
  _renderContasPagarSituacao(dash) {
    const _icon = (name, size) => (window.rhIcon ? window.rhIcon(name, size || 16) : '');
    return `
        <div class="card mb-md">
          <div class="card-header">
            <h3 class="card-title rh-h2">Contas a Pagar — Situação</h3>
            <a href="#/contas-pagar" style="text-decoration:none;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px;color:var(--rh-brand-500);">Ver todas ${_icon('arrow-right', 14)}</a>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(105px,1fr)); gap:8px;">
            ${[
              { tone: 'neg', label: 'Vencidas', value: dash.contasPagarStatus?.vencidas || 0 },
              {
                tone: 'warn',
                label: 'Próx. 7 dias',
                value: dash.contasPagarStatus?.proximasVencer || 0,
              },
              {
                tone: 'pos',
                label: 'No prazo',
                value:
                  (dash.contasPagarStatus?.pendentes || 0) -
                  (dash.contasPagarStatus?.vencidas || 0) -
                  (dash.contasPagarStatus?.proximasVencer || 0),
              },
            ]
              .map(
                (s) => `
              <div class="rh-pipeline-stage ${s.value > 0 && s.tone === 'neg' ? 'is-active' : ''}" style="text-align:left;">
                <div class="rh-pipeline-stage-label rh-row-sm">${window.rhStatusPill ? window.rhStatusPill(s.tone, s.label) : s.label}</div>
                <div class="rh-pipeline-stage-count">${s.value}</div>
              </div>
            `
              )
              .join('')}
            <div class="rh-pipeline-stage" style="text-align:left;border-left-color:var(--rh-neg-strong);">
              <div class="rh-pipeline-stage-label" style="color:var(--rh-neg-text);">Total pendente</div>
              <div class="rh-pipeline-stage-count" style="font-size:22px;color:var(--rh-neg-strong);">${Store.formatBRL(dash.contasPagarStatus?.totalPendente || 0)}</div>
            </div>
          </div>
        </div>`;
  },

  // Grid de 2 cards: "Contratos a Vencer (30 dias)" + "Contratos por Margem".
  _renderContratosVencerMargem(dash) {
    return `
        <div class="grid grid-2">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Contratos a Vencer (30 dias)</h3>
            </div>
            ${
              dash.contratosAVencer.length === 0
                ? `
              <p style="color:var(--color-text-muted); padding:var(--sp-md) 0;">Nenhum contrato vence nos próximos 30 dias</p>
            `
                : `
              <div style="display:flex; flex-direction:column; gap:var(--sp-sm);">
                ${dash.contratosAVencer
                  .map(
                    (c) => `
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
                `
                  )
                  .join('')}
              </div>
            `
            }
          </div>

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Contratos por Margem</h3>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Contrato</th>
                    <th scope="col">Gasto</th>
                    <th scope="col">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    dash.contractsWithMargin.length === 0
                      ? `
                    <tr><td colspan="3" style="text-align:center; color:var(--color-text-muted); padding:var(--sp-xl);">Nenhum contrato</td></tr>
                  `
                      : dash.contractsWithMargin
                          .slice(0, 8)
                          .map((c) => {
                            const pct = parseFloat(c.marginPct);
                            const cor =
                              pct < 0
                                ? 'var(--color-danger)'
                                : pct < 20
                                  ? 'var(--color-warning)'
                                  : 'var(--color-success)';
                            return `
                      <tr>
                        <td>
                          <a href="#/contratos/${c.id}" style="color:var(--color-primary); text-decoration:none; font-weight:500;">${escapeHtml(c.name)}</a>
                          <div class="rh-meta">${escapeHtml(c.client)}</div>
                        </td>
                        <td>${Store.formatBRL(c.custoRealizado)}</td>
                        <td>
                          <span style="font-weight:700; color:${cor};">${pct}%</span>
                          <div class="progress-bar-wrap" style="margin-top:4px; width:80px;">
                            <div class="progress-bar ${pct < 0 ? 'over-budget' : ''}" style="width:${Math.min(Math.abs(pct), 100)}%"></div>
                          </div>
                        </td>
                      </tr>
                    `;
                          })
                          .join('')
                  }
                </tbody>
                ${dash.contractsWithMargin.length > 8 ? `<tfoot><tr><td colspan="3" style="text-align:center;color:var(--color-text-muted);padding-top:8px;">+ ${dash.contractsWithMargin.length - 8} contratos — <a href="#/contratos" class="rh-link">ver todos</a></td></tr></tfoot>` : ''}
              </table>
            </div>
          </div>
        </div>`;
  },

  // Card "Últimas Movimentações — Caixa" com filtro entrada/saída/ambos
  // (estado em this.movFiltro; os botões são religados em _bindPeriodoCtrl).
  _renderUltimasMovimentacoes(dash) {
    const todas = (dash.recentCaixaEntries || []).filter((e) =>
      this.movFiltro === 'ambos' ? true : e.type === this.movFiltro
    );
    const filtradas = todas.slice(0, 6);
    return `
          <div class="card" style="margin-top:var(--sp-lg);">
            <div class="card-header">
              <h3 class="card-title">Últimas Movimentações — Caixa</h3>
              <div style="display:flex;align-items:center;gap:var(--sp-md);">
                <div id="movFiltroCtrl" style="display:inline-flex;border:1px solid var(--color-border);border-radius:6px;overflow:hidden;">
                  ${[
                    { k: 'ambos', l: 'Ambos', c: '#60A5FA' },
                    { k: 'entrada', l: 'Entradas', c: 'var(--color-success)' },
                    { k: 'saida', l: 'Saídas', c: 'var(--color-danger)' },
                  ]
                    .map(
                      (b, i) => `
                    <button data-filtro="${b.k}" style="
                      padding:5px 12px;border:0;cursor:pointer;font-size:13px;font-weight:600;
                      background:${this.movFiltro === b.k ? b.c : 'transparent'};
                      color:${this.movFiltro === b.k ? '#fff' : 'var(--color-text-muted)'};
                      ${i < 2 ? 'border-right:1px solid var(--color-border);' : ''}
                    ">${b.l}</button>
                  `
                    )
                    .join('')}
                </div>
                <a href="#/caixa" class="rh-link">Ver todos →</a>
              </div>
            </div>
            ${
              filtradas.length === 0
                ? `
              <p style="color:var(--color-text-muted);padding:var(--sp-md) 0;">Nenhuma movimentação no filtro selecionado</p>
            `
                : `
              <div style="display:flex; flex-direction:column;">
                ${filtradas
                  .map(
                    (e) => `
                  <div class="row-dash-mov" data-id="${e.id}" style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--color-border); cursor:pointer;">
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
                `
                  )
                  .join('')}
              </div>
              <div style="padding:var(--sp-sm) 0 0;color:var(--color-text-muted);font-size:13px;text-align:center;">
                ${todas.length > filtradas.length ? `+ ${todas.length - filtradas.length} movimentações — <a href="#/caixa" class="rh-link">ver todas</a>` : `${todas.length} movimentaç${todas.length === 1 ? 'ão' : 'ões'}`}
              </div>
            `
            }
          </div>`;
  },

  // Painel "Cobrança por área": 4 cards (RH/Obras/Financeiro/Frota) com
  // semáforo por dias parado. `cob` vem de /api/dashboard/cobranca
  // (null-safe: se faltar, a seção some). "+N ver todas" usa <details> nativo
  // — sem bind de JS. Cor nunca é o único sinal (emoji + rótulo junto).
  _renderCobranca(cob) {
    if (!cob || !Array.isArray(cob.areas) || cob.areas.length === 0) return '';
    const COR = {
      vermelho: { css: 'var(--rh-neg-strong)', icone: '🔴', rotulo: 'crítico' },
      amarelo: { css: 'var(--rh-warn-strong)', icone: '🟡', rotulo: 'atenção' },
      verde: { css: 'var(--rh-pos-strong)', icone: '🟢', rotulo: 'em dia' },
    };
    const linha = (pend) => `
      <a href="${escapeHtml(pend.href || '#')}" class="rh-row" style="justify-content:space-between;text-decoration:none;color:inherit;padding:2px 0;" title="${escapeHtml(pend.proximaAcao || '')}">
        <span style="font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(pend.titulo)}</span>
        <b style="white-space:nowrap;margin-left:8px;">${pend.diasParado ?? '?'}d</b>
      </a>`;
    const card = (area) => {
      const cor = COR[area.cor] || COR.verde;
      const pend = Array.isArray(area.pendencias) ? area.pendencias : [];
      const top3 = pend.slice(0, 3);
      const resto = pend.slice(3);
      return `
        <div class="rh-kpi" style="border-left:4px solid ${cor.css};">
          <div class="rh-kpi-label">${cor.icone} ${escapeHtml(area.nome)}
            <span class="rh-meta-xs">· ${cor.rotulo}${pend.length ? ` · ${pend.length} pendência(s)` : ''}</span>
          </div>
          ${pend.length === 0 ? '<div class="rh-kpi-meta">em dia ✓</div>' : top3.map(linha).join('')}
          ${
            resto.length
              ? `<details><summary style="cursor:pointer;font-size:12px;color:var(--rh-ink-500);">+${resto.length} ver todas</summary>${resto.map(linha).join('')}</details>`
              : ''
          }
        </div>`;
    };
    return `
      <div class="card mb-md">
        <div class="card-header">
          <h3 class="card-title">Cobrança por área</h3>
          <span class="rh-meta">o que está parado e há quantos dias — clique para resolver</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--sp-md);">
          ${cob.areas.map(card).join('')}
        </div>
      </div>`;
  },

  // Card "Operação — visão do mês": KPIs de frota/compras/recrutamento/folha/
  // estoque com comparação mês atual × anterior. `op` vem de /api/dashboard/
  // operacional (null-safe: se faltar, a seção some). Para CUSTOS, alta = vermelho.
  _renderOperacional(op) {
    if (!op) return '';
    const brlk = (v) => Store.formatBRLk(v || 0);
    const delta = (atual, anterior) => {
      if (!anterior) return atual > 0 ? { pct: 100, up: true } : null;
      const p = ((atual - anterior) / anterior) * 100;
      return { pct: Math.abs(p), up: p >= 0 };
    };
    const custoCard = (label, atual, anterior, href, extra) => {
      const d = delta(atual, anterior);
      // Custo subindo é ruim (vermelho); caindo é bom (verde).
      const cor = d
        ? d.up
          ? 'var(--rh-neg-strong)'
          : 'var(--rh-pos-strong)'
        : 'var(--rh-ink-500)';
      const meta = d
        ? `${d.up ? '↑' : '↓'} ${d.pct.toFixed(0)}% vs mês anterior`
        : 'sem comparativo';
      return `<a href="${href}" class="rh-kpi" style="text-decoration:none;color:inherit;">
        <div class="rh-kpi-label">${escapeHtml(label)}</div>
        <div class="rh-kpi-value">${brlk(atual)}</div>
        <div class="rh-kpi-meta"><span style="color:${cor};font-weight:600;">${meta}</span>${extra ? ' · ' + escapeHtml(extra) : ''}</div>
      </a>`;
    };
    const numCard = (label, value, meta, href, warn) => `
      <a href="${href}" class="rh-kpi" style="text-decoration:none;color:inherit;">
        <div class="rh-kpi-label">${escapeHtml(label)}</div>
        <div class="rh-kpi-value" style="${warn ? 'color:var(--rh-warn-strong);' : ''}">${value}</div>
        <div class="rh-kpi-meta">${escapeHtml(meta || '')}</div>
      </a>`;
    const top = op.topCombustivel || [];
    const topFuel = top.length
      ? `
      <div style="margin-top:var(--sp-md);border-top:1px solid var(--color-border);padding-top:var(--sp-md);">
        <div class="rh-label" style="margin-bottom:8px;">🏆 Top combustível do mês (por carro)</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${top
            .map(
              (c, i) => `<div class="rh-row" style="justify-content:space-between;">
            <div class="rh-row-sm"><span style="font-weight:800;color:var(--rh-ink-500);min-width:22px;">${i + 1}º</span>
              <div><div style="font-weight:600;">${escapeHtml(c.placa || '—')}</div><div class="rh-meta-xs">${escapeHtml(c.modelo || '')} · ${(c.litros || 0).toFixed(0)} L</div></div></div>
            <div style="font-weight:700;">${Store.formatBRL(c.total)}</div>
          </div>`
            )
            .join('')}
        </div>
      </div>`
      : '';
    return `
      <div class="card mb-md">
        <div class="card-header">
          <h3 class="card-title">Apanhado geral do mês</h3>
          <span class="rh-meta">contratações · compras · estoque · frota — vs mês anterior</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--sp-md);">
          ${numCard('👥 Vagas abertas', op.recrutamento.vagasAbertas, `${op.recrutamento.candidatosEmAndamento} candidato(s) no funil`, '#/recrutamento', op.recrutamento.vagasAbertas > 0)}
          ${numCard('🛒 Compras em aberto', op.compras.abertas, op.compras.valorAberto > 0 ? `${brlk(op.compras.valorAberto)} parado` : 'aguardando avaliação/aprovação', '#/solicitacoes-compra', op.compras.abertas > 0)}
          ${custoCard('🛒 Comprado (mês)', op.compras.compradoAtual, op.compras.compradoAnterior, '#/solicitacoes-compra')}
          ${numCard('📦 Estoque', brlk(op.estoque.valor), op.estoque.abaixoMinimo > 0 ? `${op.estoque.abaixoMinimo} item(ns) abaixo do mínimo` : 'em dia', '#/estoque', op.estoque.abaixoMinimo > 0)}
          ${custoCard('💰 Folha (mês)', op.folha.custoAtual, op.folha.custoAnterior, '#/folha-pagamento', op.folha.pendente > 0 ? `${brlk(op.folha.pendente)} pendente` : '')}
          ${custoCard('⛽ Combustível (mês)', op.combustivel.mesAtual, op.combustivel.mesAnterior, '#/frota', `${(op.combustivel.litrosAtual || 0).toFixed(0)} L`)}
          ${custoCard('🔧 Manutenção (mês)', op.manutencao.mesAtual, op.manutencao.mesAnterior, '#/frota')}
        </div>
        ${topFuel}
      </div>
      ${this._renderSituacaoAtual(op)}`;
  },

  _renderSituacaoAtual(op) {
    const brlk = (v) => Store.formatBRLk(v || 0);
    const numCard = (label, value, meta, href, warn) => `
      <a href="${href}" class="rh-kpi" style="text-decoration:none;color:inherit;">
        <div class="rh-kpi-label">${escapeHtml(label)}</div>
        <div class="rh-kpi-value" style="${warn ? 'color:var(--rh-warn-strong);' : ''}">${value}</div>
        <div class="rh-kpi-meta">${escapeHtml(meta || '')}</div>
      </a>`;

    const me = op.manutEquip || {};
    const dk = op.docsKpi || {};
    const pk = op.propostasKpi || {};
    const re = op.revisoes || {};
    const fk = op.folgasKpi || {};
    const cp = op.comprasParadas || {};
    const candParados = op.candidatosParados || 0;

    const manutMeta =
      me.emAberto > 0
        ? `${me.aAvaliar || 0} a avaliar · ${me.emManutencao || 0} em exec.`
        : 'nenhuma em aberto';
    const docsMeta = dk.vencendo30d > 0 ? `${dk.vencendo30d} vencem em 30 dias` : 'todos em dia';
    const propMeta = pk.emAndamento > 0 ? brlk(pk.valorEmAndamento) + ' em jogo' : 'nenhuma ativa';
    const compMeta =
      cp.paradas3d > 0 ? `${cp.paradas3d} parada(s) há mais de 3 dias` : 'sem atrasos';

    return `
      <div class="card mb-md">
        <div class="card-header">
          <h3 class="card-title">Situação atual</h3>
          <span class="rh-meta">pendências · vencimentos · funil — tempo real</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--sp-md);">
          ${numCard('🔧 Equip. em manutenção', me.emAberto || 0, manutMeta, '#/manutencao', (me.atrasadas || 0) > 0)}
          ${numCard('⏰ Manutenções atrasadas', me.atrasadas || 0, me.atrasadas > 0 ? 'retorno previsto ultrapassado' : 'sem atrasos', '#/manutencao?filtro=atrasadas', (me.atrasadas || 0) > 0)}
          ${numCard('📄 Docs vencidos', dk.vencidos || 0, docsMeta, '#/recursos?docs=vencidos', (dk.vencidos || 0) > 0)}
          ${numCard('📊 Propostas ativas', pk.emAndamento || 0, propMeta, '#/propostas', false)}
          ${numCard('🎯 Conversão propostas', (pk.taxaConversao || 0) + '%', 'aceitas / total enviadas', '#/propostas', false)}
          ${numCard('👤 Candidatos parados', candParados, candParados > 0 ? 'sem atualização há +7 dias' : 'funil ativo', '#/recrutamento?filtro=parados', candParados > 0)}
          ${numCard('🔩 Revisões venc. (frota)', re.vencidas || 0, re.vencidas > 0 ? 'revisão preventiva em atraso' : 'revisões em dia', '#/frota', (re.vencidas || 0) > 0)}
          ${numCard('🏖️ Folgas (próx. 5 dias)', fk.proximas5d || 0, fk.proximas5d > 0 ? 'colaborador(es) de folga' : 'nenhuma prevista', '#/recursos', false)}
          ${numCard('🛒 Compras em avaliação', cp.emAvaliacao || 0, compMeta, '#/solicitacoes-compra', (cp.paradas3d || 0) > 0)}
        </div>
      </div>`;
  },

  _renderPeriodoCtrl() {
    const now = new Date();
    const anoAtual = now.getFullYear();
    const anos = [anoAtual - 2, anoAtual - 1, anoAtual, anoAtual + 1];
    const meses = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ];
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
        ${anos.map((a) => `<option value="${a}" ${ano === a ? 'selected' : ''}>${a}</option>`).join('')}
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
        ano: parseInt(anoEl.value) || now.getFullYear(),
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
    document.querySelectorAll('#projDaysCtrl button[data-days]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.dataset.days);
        if (d && d !== this.projDays) {
          this.projDays = d;
          this.render();
        }
      });
    });

    // Filtro entrada/saída/ambos
    document.querySelectorAll('#movFiltroCtrl button[data-filtro]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.filtro;
        if (f && f !== this.movFiltro) {
          this.movFiltro = f;
          this.render();
        }
      });
    });

    // Click na linha de movimentação → modal de detalhe (reusa Caixa.showDetail)
    document.querySelectorAll('.row-dash-mov').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.dataset.id;
        if (window.Caixa?.showDetail) window.Caixa.showDetail(id);
      });
    });

    // Click na linha de entradas previstas → modal de detalhe da NF
    document.querySelectorAll('.row-dash-fut').forEach((row) => {
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
    const nfById = new Map(nfsList.map((n) => [n.id, n]));
    const stats = {
      rascunho: { count: 0, valor: 0 },
      aguardEmissao: { count: 0, valor: 0 },
      nfEmitida: { count: 0, valor: 0 },
      recebida: { count: 0, valor: 0 },
    };
    saidasList
      .filter((s) => inMes(s.date))
      .forEach((s) => {
        const v = parseFloat(s.value) || 0;
        const nfId = s.nfId || s.nf_id;
        const nf = nfId ? nfById.get(nfId) : null;
        if (!nf) {
          stats.rascunho.count++;
          stats.rascunho.valor += v;
        } else if (!nf.emitida && nf.status !== 'emitida') {
          stats.aguardEmissao.count++;
          stats.aguardEmissao.valor += v;
        } else if (!(nf.caixaEntryId || nf.caixa_entry_id)) {
          stats.nfEmitida.count++;
          stats.nfEmitida.valor += v;
        } else {
          stats.recebida.count++;
          stats.recebida.valor += v;
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
    const nfPendentes = (Store.state.notas_fiscais || []).filter((nf) => !nf.emitida);
    const recOpen = nfPendentes.filter((nf) => !nf.dataLimite || nf.dataLimite >= hojeStr);
    const recOverdue = nfPendentes.filter((nf) => nf.dataLimite && nf.dataLimite < hojeStr);
    const recOpenVal = recOpen.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
    const recOverdueVal = recOverdue.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
    const recTotal = recOpenVal + recOverdueVal;
    const recOpenPct = recTotal > 0 ? (recOpenVal / recTotal) * 100 : 0;
    const recOverduePct = recTotal > 0 ? (recOverdueVal / recTotal) * 100 : 0;

    // Contas a Pagar — contas pendentes
    const cpPendentes = (Store.state.contas_pagar || []).filter((c) => c.status === 'pendente');
    const payOpen = cpPendentes.filter((c) => !c.dataVencimento || c.dataVencimento >= hojeStr);
    const payOverdue = cpPendentes.filter((c) => c.dataVencimento && c.dataVencimento < hojeStr);
    const payOpenVal = payOpen.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const payOverdueVal = payOverdue.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const payTotal = payOpenVal + payOverdueVal;
    const payOpenPct = payTotal > 0 ? (payOpenVal / payTotal) * 100 : 0;
    const payOverduePct = payTotal > 0 ? (payOverdueVal / payTotal) * 100 : 0;

    const card = (
      titulo,
      link,
      subtitulo,
      total,
      totalLabel,
      openVal,
      openPct,
      overdueVal,
      overduePct
    ) => `
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
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);margin-bottom:var(--sp-md);">
        ${card(
          'Contas a Receber',
          '#/notas-fiscais',
          'Valor que você tem a receber dos seus clientes',
          recTotal,
          'Total de notas fiscais pendentes',
          recOpenVal,
          recOpenPct,
          recOverdueVal,
          recOverduePct
        )}
        ${card(
          'Contas a Pagar',
          '#/contas-pagar',
          'Valor que você tem a pagar aos seus fornecedores',
          payTotal,
          'Total de contas pendentes',
          payOpenVal,
          payOpenPct,
          payOverdueVal,
          payOverduePct
        )}
      </div>
    `;
  },

  renderAlertas(dash) {
    // ⚠️ SEGURANÇA: `msg` é HTML (contém <a> intencionais) e é injetado via
    // innerHTML sem escape no render (linha ~1118). Portanto QUALQUER dado de
    // usuário/banco interpolado aqui DEVE ser escapado com escapeHtml() no push
    // (ver `nomes` abaixo). Nunca interpole nome/descrição/observação cru.
    const alertas = [];
    if (dash.nfsStatus.vencidas > 0)
      alertas.push({
        tipo: 'danger',
        msg: `🔴 ${dash.nfsStatus.vencidas} nota(s) fiscal(is) VENCIDA(S) — emita imediatamente!`,
      });
    if (dash.nfsStatus.proximasVencer > 0)
      alertas.push({
        tipo: 'warning',
        msg: `⚠️ ${dash.nfsStatus.proximasVencer} nota(s) fiscal(is) vence(m) em até 7 dias`,
      });
    if (dash.contratosAVencer.some((c) => c.diasRestantes <= 7))
      alertas.push({
        tipo: 'warning',
        msg: `⚠️ Há contratos encerrando em menos de 7 dias — faça follow-up com o cliente`,
      });
    if (dash.caixaBalance < 0)
      alertas.push({
        tipo: 'danger',
        msg: `🔴 Saldo de caixa negativo: ${Store.formatBRL(dash.caixaBalance)}`,
      });
    if (dash.contasPagarStatus?.vencidas > 0)
      alertas.push({
        tipo: 'danger',
        msg: `🔴 ${dash.contasPagarStatus.vencidas} conta(s) a pagar VENCIDA(S) — <a href="#/contas-pagar" style="color:inherit;text-decoration:underline;">ver Contas a Pagar</a>`,
      });
    if (dash.contasPagarStatus?.proximasVencer > 0)
      alertas.push({
        tipo: 'warning',
        msg: `⚠️ ${dash.contasPagarStatus.proximasVencer} conta(s) a pagar vence(m) em até 7 dias — total ${Store.formatBRL(dash.contasPagarStatus.totalPendente)}`,
      });

    // Alertas de RDO (compliance de obras)
    const rs = this._rdoStats;
    if (rs && !rs.ehFimDeSemana) {
      if (rs.obrasSemRdoOntem && rs.obrasSemRdoOntem.length > 0) {
        const nomes = rs.obrasSemRdoOntem
          .slice(0, 3)
          .map((o) => escapeHtml(o.name || ''))
          .join(', ');
        const sufixo =
          rs.obrasSemRdoOntem.length > 3 ? ` e mais ${rs.obrasSemRdoOntem.length - 3}` : '';
        alertas.push({
          tipo: 'danger',
          msg: `🔴 ${rs.obrasSemRdoOntem.length} obra(s) sem RDO no último dia útil: ${nomes}${sufixo} — <a href="#/rdos" style="color:inherit;text-decoration:underline;">ver RDOs</a>`,
        });
      }
      if (rs.obrasAtrasadas && rs.obrasAtrasadas.length > 0) {
        alertas.push({
          tipo: 'warning',
          msg: `⚠️ ${rs.obrasAtrasadas.length} obra(s) com mais de 2 dias úteis sem RDO — <a href="#/rdos" style="color:inherit;text-decoration:underline;">ver RDOs</a>`,
        });
      }
      if (typeof rs.aderencia7d === 'number' && rs.aderencia7d < 50) {
        alertas.push({
          tipo: 'warning',
          msg: `⚠️ Aderência de RDOs nos últimos ${rs.diasUteisAvaliados} dias úteis: ${rs.aderencia7d}% — abaixo do esperado`,
        });
      }
    }

    // F6: Anomaly detection alerts
    const anomalias = this._anomalias || [];
    if (anomalias.length > 0) {
      const alta = anomalias.filter((a) => a.severidade === 'alta');
      if (alta.length > 0) {
        alertas.push({
          tipo: 'danger',
          msg: `🚨 ${alta.length} despesa(s) anômala(s) de alta severidade detectada(s) — valores muito acima da média histórica da categoria. <a href="#/caixa" style="color:inherit;text-decoration:underline;">Ver Caixa</a>`,
        });
      } else {
        alertas.push({
          tipo: 'warning',
          msg: `⚠️ ${anomalias.length} despesa(s) com valores acima do padrão histórico detectada(s). <a href="#/caixa" style="color:inherit;text-decoration:underline;">Ver Caixa</a>`,
        });
      }
    }

    if (alertas.length === 0) return '';
    return `
      <div style="display:flex; flex-direction:column; gap:var(--sp-sm); margin-bottom:var(--sp-lg);">
        ${alertas
          .map(
            (a) => `
          <div style="padding:var(--sp-md); border-radius:8px; background:rgba(${a.tipo === 'danger' ? '229,62,62' : '214,158,46'},.1); border-left:4px solid var(--color-${a.tipo});">
            <p style="margin:0; font-weight:600; color:var(--color-${a.tipo});">${a.msg}</p>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  },

  async renderChart(dash) {
    // Aguarda Chart.js (disparado em paralelo no início de render()).
    if (typeof window.Chart === 'undefined' && window.RhinoLazy) {
      await window.RhinoLazy.ensure('chart');
    }
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    const canvas = document.getElementById('chartSaude');
    if (!canvas || typeof Chart === 'undefined') return;

    const podeVerValores =
      !window.perfil ||
      typeof window.perfil.podeVerValores !== 'function' ||
      window.perfil.podeVerValores();
    const fmt = (v) =>
      podeVerValores
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
        : 'R$ ●●●●●';
    // Padrão brasileiro: . separa milhar/milhão. Eixo Y mostra valor cheio
    // (ex: R$ 1.234.567) — mais legível que abreviações.
    const _nfBR = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    });
    const fmtTick = (v) => {
      if (!podeVerValores) return '●●●';
      const n = Number(v) || 0;
      return n < 0 ? '-' + _nfBR.format(Math.abs(n)) : _nfBR.format(n);
    };
    const hoje = new Date().toISOString().split('T')[0];

    // Cores adaptáveis ao tema (light/dark)
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const tc = {
      text: isDark ? '#FFFFFF' : '#1f2937',
      grid: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      tipBg: isDark ? '#0F1523' : '#FFFFFF',
      tipBorder: isDark ? '#1C2840' : '#e5e7eb',
      tipText: isDark ? '#FFFFFF' : '#1f2937',
      hojeLine: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
    };

    // Passado: histórico real (últimos 30 dias)
    const labelsPassado = dash.historicoCaixa.map(
      (d) =>
        d.label ||
        new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        })
    );
    const saldosPassado = dash.historicoCaixa.map((d) => d.saldo);

    const isHistorico = this.periodo.modo !== 'recente';

    // Futuro: projeção only in recente mode
    const labelsFuturo = isHistorico
      ? []
      : [
          'Hoje',
          ...dash.saldoProjetado.map((d) =>
            new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
            })
          ),
        ];
    const saldosFuturo = isHistorico
      ? []
      : [dash.caixaBalance, ...dash.saldoProjetado.map((d) => d.saldo)];

    const totalPassado = labelsPassado.length;
    const labels = [...labelsPassado, ...labelsFuturo.slice(1)];

    const dataPassado = [
      ...saldosPassado,
      ...new Array(Math.max(0, labelsFuturo.length - 1)).fill(null),
    ];
    const dataFuturo = isHistorico
      ? []
      : [...new Array(totalPassado - 1).fill(null), dash.caixaBalance, ...saldosFuturo.slice(1)];

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
            spanGaps: false,
          },
          ...(!isHistorico
            ? [
                {
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
                  spanGaps: false,
                },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 20,
              color: tc.text,
              font: { size: 14, family: 'Nunito', weight: '600' },
            },
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
              label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y ?? 0)}`,
            },
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
                label: {
                  display: true,
                  content: 'Hoje',
                  position: 'start',
                  font: { size: 12, weight: '600' },
                  color: tc.text,
                },
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: tc.grid },
            ticks: { color: tc.text, font: { size: 13, weight: '500' }, maxTicksLimit: 12 },
          },
          y: {
            grid: { color: tc.grid },
            ticks: {
              color: tc.text,
              font: { size: 13, weight: '500' },
              callback: (v) => fmtTick(v),
            },
          },
        },
      },
    });
  },

  // ═════════════ Customização do Dashboard ═════════════
  _widgetsDetected: [],
  _prefs: null,

  // Detecta automaticamente as seções principais e marca cada uma com data-widget-id
  _marcarWidgets() {
    const app = document.getElementById('app');
    if (!app) return;
    this._widgetsDetected = [];
    let idx = 0;
    Array.from(app.children).forEach((el) => {
      if (el.classList.contains('page-header')) return; // header sempre visível
      // Extrai título textual da seção (h1/h2/h3/.card-title/.rh-h2)
      const titleEl = el.querySelector('.card-title, .rh-h2, h2, h3');
      const fallbackText = el.textContent?.trim().split('\n')[0]?.slice(0, 50);
      const label = titleEl?.textContent?.trim() || fallbackText || `Seção ${idx + 1}`;
      if (!label || label.length < 3) return;
      const id = `w-${idx++}`;
      el.dataset.widgetId = id;
      this._widgetsDetected.push({ id, label: label.slice(0, 60) });
    });
  },

  // Carrega preferências do usuário (servidor → localStorage → padrão)
  async _carregarPrefs() {
    if (this._prefs) return this._prefs;
    let prefs = null;
    try {
      const r = await fetch('/api/dashboard/layouts');
      if (r.ok) {
        const j = await r.json();
        const def = (j.layouts || []).find((l) => l.isDefault) || (j.layouts || [])[0];
        if (def) prefs = { id: def.id, nome: def.nome, widgets: def.widgets };
      }
    } catch {
      /* fallback */
    }
    if (!prefs) {
      try {
        prefs = JSON.parse(localStorage.getItem('rhino-dash-prefs') || 'null');
      } catch {}
    }
    this._prefs = prefs || { widgets: [] };
    return this._prefs;
  },

  async _aplicarPreferenciasDash() {
    const prefs = await this._carregarPrefs();
    const ocultos = (prefs.widgets || []).filter((w) => w.visivel === false).map((w) => w.id);
    ocultos.forEach((id) => {
      const el = document.querySelector(`[data-widget-id="${id}"]`);
      if (el) el.style.display = 'none';
    });
  },

  // Adiciona botão "🎨 Personalizar" no header do dashboard
  _injetarBotaoCustomizar() {
    const ctrl = document.getElementById('dash-periodo-ctrl');
    if (!ctrl || document.getElementById('btnCustomizarDash')) return;
    const btn = document.createElement('button');
    btn.id = 'btnCustomizarDash';
    btn.className = 'btn btn-secondary btn-sm';
    btn.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:6px;">' +
      window.rhIcon('palette', 15) +
      'Personalizar</span>';
    btn.title = 'Mostrar/ocultar seções do dashboard';
    btn.addEventListener('click', () => this._showModalCustomizar());

    const btnRel = document.createElement('button');
    btnRel.id = 'btnGerarRelatorio';
    btnRel.className = 'btn btn-secondary btn-sm';
    btnRel.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:6px;">' +
      window.rhIcon('file-text', 15) +
      'Relatório</span>';
    btnRel.title = 'Gerar relatório gerencial em PDF';
    btnRel.addEventListener('click', async () => {
      // FIX silent-failure: Relatorio.js é lazy (só carrega em #/relatorios).
      // Sem este preload o ?. engole o undefined e o click vira no-op silencioso.
      try {
        if (typeof _loadLazyForPattern === 'function' && !window.RhinoRelatorio) {
          await _loadLazyForPattern('#/relatorios');
        }
      } catch (e) {
        console.warn('[Dashboard] lazy-load de Relatorio falhou:', e?.message || e);
      }
      if (window.RhinoRelatorio?.gerar) {
        window.RhinoRelatorio.gerar();
      } else {
        console.error('[Dashboard] RhinoRelatorio.gerar indisponível após lazy-load');
        alert(
          'Não foi possível carregar o gerador de relatório. Recarregue a página e tente novamente.'
        );
      }
    });

    ctrl.appendChild(btnRel); // Relatório primeiro
    ctrl.appendChild(btn); // Personalizar depois
  },

  _showModalCustomizar() {
    const widgets = this._widgetsDetected || [];
    const prefs = this._prefs || { widgets: [] };
    const visMap = new Map((prefs.widgets || []).map((w) => [w.id, w.visivel !== false]));

    const html = `
      <div class="modal-overlay" id="modalDashCust">
        <div class="modal" style="width:560px;max-height:85vh;display:flex;flex-direction:column;">
          <div class="modal-header">
            <h2 class="modal-title"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('palette', 18)}Personalizar Dashboard</span></h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content" style="overflow-y:auto;flex:1;">
            <p class="text-muted font-sm">Escolha quais seções aparecem no seu dashboard. As alterações são salvas na sua conta.</p>
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:var(--sp-md);">
              ${widgets.length === 0 ? '<p class="text-muted">Nenhuma seção detectada</p>' : ''}
              ${widgets
                .map((w) => {
                  const visivel = visMap.has(w.id) ? visMap.get(w.id) : true;
                  return `
                  <label style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--color-surface-2);border-radius:6px;cursor:pointer;">
                    <input type="checkbox" data-wid="${w.id}" ${visivel ? 'checked' : ''}>
                    <span style="flex:1;">${escapeHtml(w.label)}</span>
                  </label>
                `;
                })
                .join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnDashCustReset">Restaurar padrão</button>
            <button class="btn btn-primary" id="btnDashCustSave"><span style="display:inline-flex;align-items:center;gap:6px;">${window.rhIcon('save', 15)}Salvar</span></button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalDashCust');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);

    document.getElementById('btnDashCustReset').addEventListener('click', () => {
      overlay.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
    });

    document.getElementById('btnDashCustSave').addEventListener('click', async () => {
      const widgetsConfig = Array.from(overlay.querySelectorAll('input[type="checkbox"]')).map(
        (cb) => ({
          id: cb.dataset.wid,
          visivel: cb.checked,
        })
      );
      const novasPrefs = { ...prefs, widgets: widgetsConfig };

      // Salva no localStorage como cache imediato
      try {
        localStorage.setItem('rhino-dash-prefs', JSON.stringify(novasPrefs));
      } catch {}

      // Sincroniza com servidor
      try {
        const url = prefs.id ? `/api/dashboard/layouts/${prefs.id}` : `/api/dashboard/layouts`;
        const method = prefs.id ? 'PUT' : 'POST';
        const r = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: prefs.nome || 'Padrão',
            widgets: widgetsConfig,
            isDefault: true,
          }),
        });
        if (r.ok) {
          const saved = await r.json();
          this._prefs = { id: saved.id, nome: saved.nome, widgets: saved.widgets };
        }
      } catch (e) {
        console.warn('Falha ao salvar layout no servidor:', e.message);
      }

      // Aplica imediatamente: esconde/mostra os widgets
      widgetsConfig.forEach((w) => {
        const el = document.querySelector(`[data-widget-id="${w.id}"]`);
        if (el) el.style.display = w.visivel ? '' : 'none';
      });

      window.showToast('Dashboard personalizado!', 'success');
      close();
    });
  },
};
