// Rhino Hi-fi V1 — Dashboard Executivo
// Score · KPIs · Fluxo de caixa · Contratos · RDOs · Pipeline BM · Eventos do caixa

const DashV1 = () => (
  <div className="hifi-screen">
    <div className="app">
      <Sidebar active="Dashboard"/>
      <div className="main">
        <Topbar crumbs={["Dashboard", "Visão executiva"]}/>
        <div className="main-body">

          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
            <div>
              <h1 className="h1">Bom dia, João</h1>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                Caixa positivo · <span className="strong">3 BMs aguardando emissão</span> · 2 RDOs sem lançamento ontem
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn"><Icon name="download" size={14}/> Exportar</button>
              <button className="btn btn-primary"><Icon name="plus" size={14}/> Novo lançamento</button>
            </div>
          </div>

          {/* Alert bar */}
          <div className="alert-bar">
            <div className="alert-bar-icon">!</div>
            <div className="alert-bar-text">
              <b>CT-017 Eldorado</b> abaixo da curva (28% real × 35% planejado) e com resultado parcial negativo.
              <span className="muted"> · Painéis CCM atrasados há 2 dias.</span>
            </div>
            <button className="btn btn-sm">Abrir contrato</button>
          </div>

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
                { l: "Saldo em caixa", v: "R$ 482k", d: "+ R$ 38k em 30d", up: true, trend: [444,455,470,485,498,512,520,530,545,560,575,592,612] },
                { l: "A receber (NFs)", v: "R$ 1,24M", d: "8 emitidas · 3 pendentes", up: true, trend: [800,820,850,890,920,950,990,1020,1080,1120,1180,1220,1240] },
                { l: "A pagar (30d)", v: "R$ 968k", d: "12 lançamentos", up: false, trend: [620,680,710,740,790,820,860,880,900,920,940,955,968] },
                { l: "Faturado (mês)", v: "R$ 1,42M", d: "+ 12% vs setembro", up: true, trend: [800,860,920,980,1050,1100,1180,1240,1290,1340,1380,1410,1420] },
                { l: "Margem", v: "18,2%", d: "− 1,3pp", up: false, trend: [22,21,20.5,20,19.8,19.5,19.2,19,18.8,18.6,18.5,18.3,18.2] },
                { l: "Aportes acumulados", v: "R$ 320k", d: "Sócio + empresa", up: true, trend: [50,80,120,150,180,200,230,250,270,290,300,310,320] },
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
                  {[
                    { n: "CT-014", cli: "Veracel Celulose", esc: "Manutenção parada planta 2", v: "R$ 2,4M", p: 82, st: "ok", res: "+ R$ 124k" },
                    { n: "CT-015", cli: "Klabin", esc: "Linha de prensagem", v: "R$ 1,8M", p: 64, st: "ok", res: "+ R$ 96k" },
                    { n: "CT-016", cli: "Suzano", esc: "Tubulação vapor", v: "R$ 1,2M", p: 45, st: "warn", res: "+ R$ 38k" },
                    { n: "CT-017", cli: "Eldorado Brasil", esc: "Painéis CCM", v: "R$ 980k", p: 28, st: "crit", res: "− R$ 12k" },
                    { n: "CT-019", cli: "Veracel Celulose", esc: "Cabeamento BT", v: "R$ 640k", p: 12, st: "ok", res: "+ R$ 4k" },
                  ].map((c, i) => (
                    <div key={i} className="ct-list-row">
                      <div className="ct-list-info">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className={`status-dot ${c.st}`}/>
                          <span className="ct-list-cli">{c.cli}</span>
                          <span className="tag outline mono" style={{ fontSize: 10 }}>{c.n}</span>
                        </div>
                        <div className="ct-list-meta">
                          <span>{c.esc}</span><span>·</span><span className="strong">{c.v}</span><span>·</span>
                          <span style={{ color: c.res.startsWith("−") ? "var(--neg)" : "var(--pos)", fontWeight: 600 }}>{c.res}</span>
                        </div>
                      </div>
                      <div className="ct-list-prog">
                        <div className="ct-list-prog-v">{c.p}%</div>
                        <div className="progress"><div className={`progress-fill ${c.st === "crit" ? "neg" : c.st === "warn" ? "warn" : "accent"}`} style={{ width: `${c.p}%` }}/></div>
                      </div>
                      <button className="btn btn-icon"><Icon name="more" size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card rdo-card">
              <div className="section-h" style={{ marginBottom: 10 }}>
                <div className="card-h-title">
                  <h2 className="h2">RDOs</h2>
                  <small className="muted">Aderência mensal</small>
                </div>
                <span className="tag warn"><span className="tag-dot"/> 2 atrasados</span>
              </div>
              <div className="rdo-top">
                <div>
                  <div className="rdo-big tabular" style={{ color: "var(--accent)" }}>87%</div>
                  <div className="rdo-big-l">aderência mês</div>
                </div>
                <div className="rdo-mini">
                  <div className="rdo-mini-row"><span className="muted">Lançados ontem</span><b className="tabular">5/7</b></div>
                  <div className="rdo-mini-row"><span className="muted">Sem RDO ontem</span><span className="tag warn">2</span></div>
                  <div className="rdo-mini-row"><span className="muted">Atrasados &gt;2du</span><span className="tag neg">2</span></div>
                </div>
              </div>
              <div className="rdo-list-h">Obras sem RDO ontem</div>
              {[
                ["CT-016", "Suzano", "3 dias úteis"],
                ["CT-017", "Eldorado Brasil", "2 dias úteis"],
              ].map((r, i) => (
                <div key={i} className="rdo-missing">
                  <span className="status-dot crit"/>
                  <div style={{ flex: 1 }}>
                    <b>{r[1]}</b> <span className="muted mono" style={{ fontSize: 11 }}>{r[0]}</span>
                    <div className="muted" style={{ fontSize: 11 }}>sem lançamento há {r[2]}</div>
                  </div>
                  <button className="btn btn-sm">Cobrar</button>
                </div>
              ))}
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
              {[
                { d: "24 OUT", w: "qui", t: "in",  desc: "NF #845 · Veracel · BM-05",      ct: "CT-014", v: 184200, st: "agendada" },
                { d: "26 OUT", w: "sáb", t: "out", desc: "Folha quinzena (38 pessoas)",     ct: "BASE",   v: 198400, st: "agendada" },
                { d: "28 OUT", w: "seg", t: "in",  desc: "NF #846 · Klabin · BM-04",        ct: "CT-015", v: 142500, st: "agendada" },
                { d: "30 OUT", w: "qua", t: "out", desc: "INSS folha",                       ct: "BASE",   v: 42600,  st: "agendada" },
                { d: "02 NOV", w: "sáb", t: "in",  desc: "NF #840 · Klabin · vencida",      ct: "CT-015", v: 86300,  st: "atrasada" },
                { d: "05 NOV", w: "ter", t: "out", desc: "Cabos Pirelli — fornecedor",       ct: "CT-014", v: 84200,  st: "aprovada" },
              ].map((e, i) => (
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

window.DashV1 = DashV1;
