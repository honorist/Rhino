// Rhino Hi-fi V1 — Dashboard Executivo (conectado aos dados reais via /api)

const fmtBRL = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtBRLk = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return 'R$ ' + (v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + 'M';
  if (Math.abs(v) >= 1_000) return 'R$ ' + Math.round(v / 1000) + 'k';
  return fmtBRL(v);
};

const useRhinoData = () => {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    Promise.all([
      fetch('/api/contracts').then(r => r.json()).catch(() => ({ contracts: [] })),
      fetch('/api/dashboard').then(r => r.json()).catch(() => null),
      fetch('/api/rdos').then(r => r.json()).catch(() => ({ stats: null, rdos: [] })),
      fetch('/api/contas-pagar').then(r => r.json()).catch(() => ({ contasPagar: [] })),
      fetch('/api/notas-fiscais').then(r => r.json()).catch(() => ({ notasFiscais: [] })),
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([contracts, dashboard, rdos, cp, nf, me]) => {
      setData({
        contracts: contracts.contracts || [],
        dashboard,
        rdoStats: rdos.stats,
        rdos: rdos.rdos || [],
        contasPagar: cp.contasPagar || [],
        notasFiscais: nf.notasFiscais || [],
        user: me?.user,
      });
    });
  }, []);
  return data;
};

const DashV1 = () => {
  const data = useRhinoData();
  if (!data) return <div style={{ padding: 40, fontFamily: 'var(--font-sans)' }}>Carregando dados…</div>;

  const { contracts, dashboard, rdoStats, contasPagar, notasFiscais, user } = data;
  const ativos = contracts.filter(c => c.status === 'ativo');
  const totalCarteira = ativos.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const saldoCaixa = dashboard?.caixaBalance || 0;
  const totalNFsAReceber = notasFiscais.filter(n => n.status === 'emitida').reduce((s, n) => s + (Number(n.totalLiquido || n.valorTotal) || 0), 0);
  const totalCPVencendo = contasPagar.filter(c => c.status === 'pendente').reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const aderenciaPct = rdoStats?.aderencia7d ?? 100;
  const obrasSemRdo = rdoStats?.obrasSemRdoOntem || [];
  const obrasAtrasadas = rdoStats?.obrasAtrasadas || [];

  const hoje = new Date();
  const horaH = hoje.getHours();
  const saudacao = horaH < 12 ? 'Bom dia' : horaH < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = (user?.name || user?.email || '').split(' ')[0] || 'visitante';
  const subAlerta = `${ativos.length} contratos ativos · ${obrasSemRdo.length} obras sem RDO ontem · ${obrasAtrasadas.length} atrasadas`;

  return (
  <div className="hifi-screen">
    <div className="app">
      <Sidebar active="Dashboard"/>
      <div className="main">
        <Topbar crumbs={["Dashboard", "Visão executiva"]}/>
        <div className="main-body">

          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
            <div>
              <h1 className="h1">{saudacao}, {nome}</h1>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{subAlerta}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a className="btn" href="/" target="_top"><Icon name="arrow-right" size={14}/> Ir ao app</a>
            </div>
          </div>

          {/* Alert bar — primeira obra sem RDO ontem */}
          {obrasSemRdo.length > 0 && (
            <div className="alert-bar">
              <div className="alert-bar-icon">!</div>
              <div className="alert-bar-text">
                <b>{obrasSemRdo[0].name}</b> sem RDO no último dia útil
                {obrasSemRdo.length > 1 && <span className="muted"> · e mais {obrasSemRdo.length - 1} obra(s) na mesma situação.</span>}
              </div>
              <a className="btn btn-sm" href={'/#/contratos/' + obrasSemRdo[0].contractId} target="_top">Abrir contrato</a>
            </div>
          )}

          {/* Hero: Score + KPIs */}
          <div className="dash-hero">
            <div className="card score-card">
              <div className="section-h">
                <div className="section-h-l">
                  <div className="h2">Score de saúde financeira</div>
                  <small>Out 25 · 5 contratos ativos</small>
                </div>
              </div>
              <div className="score-row">
                <ScoreGauge value={72}/>
                <div className="score-info">
                  <div className="score-label">Saudável</div>
                  <div className="score-value">72</div>
                  <div className="score-status">
                    <Icon name="trend-up" size={12}/> +4 vs setembro
                  </div>
                </div>
              </div>
              <div className="score-bars">
                {[
                  ["Margem operacional", "18,2%", 68, "accent"],
                  ["Taxa de despesa", "78%", 78, ""],
                  ["Cobertura de caixa", "2,3 meses", 55, ""],
                ].map(([l, v, p, cl], i) => (
                  <div key={i} className="score-bar-row">
                    <div className="score-bar-head">
                      <span className="muted">{l}</span>
                      <b className="tabular">{v}</b>
                    </div>
                    <div className="progress"><div className={`progress-fill ${cl}`} style={{ width: `${p}%` }}/></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="dash-kpis">
              {[
                { l: "Saldo em caixa", v: fmtBRLk(saldoCaixa), d: saldoCaixa >= 0 ? 'positivo' : 'negativo', up: saldoCaixa >= 0, trend: [saldoCaixa] },
                { l: "A receber (NFs)", v: fmtBRLk(totalNFsAReceber), d: notasFiscais.filter(n => n.status === 'emitida').length + ' emitidas', up: true, trend: [totalNFsAReceber] },
                { l: "A pagar", v: fmtBRLk(totalCPVencendo), d: contasPagar.filter(c => c.status === 'pendente').length + ' pendentes', up: false, trend: [totalCPVencendo] },
                { l: "Carteira ativa", v: fmtBRLk(totalCarteira), d: ativos.length + ' contratos', up: true, trend: [totalCarteira] },
                { l: "Aderência RDO", v: aderenciaPct + '%', d: rdoStats?.diasUteisAvaliados ? 'últimos ' + rdoStats.diasUteisAvaliados + ' dias úteis' : '', up: aderenciaPct >= 80, trend: [aderenciaPct] },
                { l: "Obras sem RDO", v: String(obrasSemRdo.length), d: 'no último dia útil', up: obrasSemRdo.length === 0, trend: [obrasSemRdo.length] },
              ].map((k, i) => (
                <div key={i} className="card kpi-card">
                  <div className="kpi-label">{k.l}</div>
                  <div className="kpi-value tabular">{k.v}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className={`kpi-delta ${k.up ? "up" : "down"}`}>
                      <Icon name={k.up ? "arrow-up" : "arrow-down"} size={11} stroke={2.4}/>
                      {k.d}
                    </div>
                    <div style={{ marginLeft: "auto" }}>
                      <KpiTrend data={k.trend} up={k.up}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cashflow */}
          <div className="card">
            <div className="card-h">
              <div className="card-h-title">
                <h2 className="h2">Fluxo de caixa</h2>
                <small className="muted">30 dias realizado + projeção 60 dias · NF a receber e contas a pagar agendadas</small>
              </div>
              <div className="view-switch">
                <button>30d</button>
                <button className="on">90d</button>
                <button>180d</button>
              </div>
            </div>
            <div style={{ padding: "0 8px" }}>
              <CashflowChart/>
            </div>
            <div className="chart-legend">
              <span className="legend-item"><span className="legend-line" style={{ background: "var(--accent)" }}/> Saldo realizado</span>
              <span className="legend-item"><span className="legend-line dashed"/> Projeção</span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: "var(--pos)" }}/> NF a receber</span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: "var(--neg)" }}/> Conta a pagar</span>
            </div>
          </div>

          {/* Pipeline BM */}
          <div className="card">
            <div className="card-h">
              <div className="card-h-title">
                <h2 className="h2">Pipeline de medições — outubro</h2>
                <small className="muted">Do trabalho executado ao recebimento</small>
              </div>
              <a className="btn btn-ghost btn-sm" style={{ color: "var(--accent-deep)" }}>Ver saídas <Icon name="arrow-right" size={12}/></a>
            </div>
            <div className="pipeline">
              {[
                ["Rascunho", "2", "R$ 220k", false],
                ["Aguard. emissão", "3", "R$ 386k", true],
                ["NF emitida", "8", "R$ 1,24M", false],
                ["Recebida", "6", "R$ 920k", false],
              ].map(([l, n, v, active], i) => (
                <div key={i} className={`pipeline-stage ${active ? "active" : ""}`}>
                  <div className="pipeline-stage-l">{l}</div>
                  <div className="pipeline-stage-v tabular">{n}</div>
                  <div className="pipeline-stage-d tabular">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 3 col: contratos + RDO + ações */}
          <div className="grid-3">
            <div className="card" style={{ gridColumn: "span 2" }}>
              <div className="card-h">
                <div className="card-h-title">
                  <h2 className="h2">Contratos ativos</h2>
                  <small className="muted">5 contratos · R$ 7,02M em carteira</small>
                </div>
                <a className="btn btn-ghost btn-sm" style={{ color: "var(--accent-deep)" }}>Ver todos <Icon name="arrow-right" size={12}/></a>
              </div>
              <div className="card-body flush">
                <div className="ct-list">
                  {ativos.slice(0, 8).map((c, i) => {
                    const hoje = new Date();
                    const start = new Date(c.startDate || c.start_date);
                    const end = new Date(c.endDate || c.end_date);
                    const total = end - start;
                    const dec = hoje - start;
                    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((dec / total) * 100))) : 0;
                    const semRdo = (rdoStats?.obrasSemRdoOntem || []).some(o => o.contractId === c.id);
                    const atras = (rdoStats?.obrasAtrasadas || []).some(o => o.contractId === c.id);
                    const st = semRdo ? 'crit' : atras ? 'warn' : 'ok';
                    return (
                      <div key={c.id} className="ct-list-row">
                        <div className="ct-list-info">
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className={`status-dot ${st}`}/>
                            <span className="ct-list-cli">{c.client || '—'}</span>
                            <span className="tag outline mono" style={{ fontSize: 10 }}>{c.codigo || c.name}</span>
                          </div>
                          <div className="ct-list-meta">
                            <span>{c.name}</span><span>·</span><span className="strong">{fmtBRLk(c.value)}</span>
                          </div>
                        </div>
                        <div className="ct-list-prog">
                          <div className="ct-list-prog-v">{pct}%</div>
                          <div className="progress"><div className={`progress-fill ${st === "crit" ? "neg" : st === "warn" ? "warn" : "accent"}`} style={{ width: `${pct}%` }}/></div>
                        </div>
                        <a className="btn btn-icon" href={'/#/contratos/' + c.id} target="_top"><Icon name="arrow-right" size={14}/></a>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="card rdo-card">
              <div className="section-h" style={{ marginBottom: 10 }}>
                <div className="card-h-title">
                  <h2 className="h2">RDOs</h2>
                  <small className="muted">Aderência mensal</small>
                </div>
                <span className={`tag ${obrasAtrasadas.length > 0 ? 'neg' : 'pos'}`}><span className="tag-dot"/> {obrasAtrasadas.length} atrasada(s)</span>
              </div>
              <div className="rdo-top">
                <div>
                  <div className="rdo-big tabular" style={{ color: aderenciaPct >= 80 ? 'var(--pos)' : aderenciaPct >= 50 ? 'var(--warn)' : 'var(--neg)' }}>{aderenciaPct}%</div>
                  <div className="rdo-big-l">aderência {rdoStats?.diasUteisAvaliados || 7}du</div>
                </div>
                <div className="rdo-mini">
                  <div className="rdo-mini-row"><span className="muted">Obras ativas</span><b className="tabular">{ativos.length}</b></div>
                  <div className="rdo-mini-row"><span className="muted">Sem RDO ontem</span><span className={`tag ${obrasSemRdo.length > 0 ? 'neg' : 'pos'}`}>{obrasSemRdo.length}</span></div>
                  <div className="rdo-mini-row"><span className="muted">Atrasados &gt;2du</span><span className={`tag ${obrasAtrasadas.length > 0 ? 'warn' : 'pos'}`}>{obrasAtrasadas.length}</span></div>
                </div>
              </div>
              {obrasSemRdo.length > 0 && (
                <>
                  <div className="rdo-list-h">Obras sem RDO ontem</div>
                  {obrasSemRdo.slice(0, 4).map((o, i) => (
                    <div key={i} className="rdo-missing">
                      <span className="status-dot crit"/>
                      <div style={{ flex: 1 }}>
                        <b>{o.client || o.name}</b> <span className="muted mono" style={{ fontSize: 11 }}>{o.name}</span>
                        <div className="muted" style={{ fontSize: 11 }}>último RDO: {o.ultimoRdo || 'nunca'}</div>
                      </div>
                      <a className="btn btn-sm" href={'/#/contratos/' + o.contractId} target="_top">Abrir</a>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Eventos no caixa */}
          <div className="card">
            <div className="card-h">
              <div className="card-h-title">
                <h2 className="h2">Próximos eventos no caixa</h2>
                <small className="muted">15 dias · entradas previstas e contas agendadas</small>
              </div>
              <a className="btn btn-ghost btn-sm" style={{ color: "var(--accent-deep)" }}>Ver caixa completo <Icon name="arrow-right" size={12}/></a>
            </div>
            <div className="events">
              {(() => {
                const meses = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
                const dows = ['dom','seg','ter','qua','qui','sex','sáb'];
                const eventos = [];
                notasFiscais.filter(n => n.status === 'emitida' && (n.dataVencimento || n.data_vencimento)).forEach(n => {
                  const d = new Date(n.dataVencimento || n.data_vencimento);
                  eventos.push({ d, t: 'in', desc: 'NF #' + (n.numero || '—') + ' · ' + (n.contractName || ''), ct: n.contractCodigo || '', v: Number(n.totalLiquido || n.valorTotal) || 0, st: d < new Date() ? 'atrasada' : 'agendada' });
                });
                contasPagar.filter(c => c.status === 'pendente' && (c.dataVencimento || c.data_vencimento)).forEach(c => {
                  const d = new Date(c.dataVencimento || c.data_vencimento);
                  eventos.push({ d, t: 'out', desc: c.descricao || 'Conta', ct: c.contractCodigo || c.fornecedorNome || 'BASE', v: Number(c.valor) || 0, st: d < new Date() ? 'atrasada' : 'agendada' });
                });
                eventos.sort((a, b) => a.d - b.d);
                return eventos.slice(0, 8).map((e, i) => ({
                  d: String(e.d.getDate()).padStart(2, '0') + ' ' + meses[e.d.getMonth()],
                  w: dows[e.d.getDay()],
                  t: e.t, desc: e.desc, ct: e.ct, v: e.v, st: e.st,
                }));
              })().map((e, i) => (
                <div key={i} className="event-row">
                  <div className="event-date">
                    {e.d}
                    <small>{e.w}</small>
                  </div>
                  <span className={`tag ${e.t === "in" ? "pos" : "neg"}`}>{e.t === "in" ? "Entrada" : "Saída"}</span>
                  <div className="event-desc">
                    <b>{e.desc}</b>
                    <small><span className="mono">{e.ct}</span></small>
                  </div>
                  <div className={`event-amt ${e.t === "in" ? "in" : "out"}`}>
                    {e.t === "in" ? "+ " : "− "}R$ {e.v.toLocaleString("pt-BR")}
                  </div>
                  <span className={`tag ${e.st === "atrasada" ? "neg" : "outline"}`}>{e.st}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
  );
};

window.DashV1 = DashV1;
