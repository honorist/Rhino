// Rhino Hi-fi — RDOs Global (conectado aos dados reais)

const RdosList = () => {
  const [data, setData] = React.useState(null);
  const [filtroContrato, setFiltroContrato] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [contracts, setContracts] = React.useState([]);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    Promise.all([
      fetch('/api/rdos').then(r => r.json()).catch(() => ({ rdos: [], stats: null })),
      fetch('/api/contracts').then(r => r.json()).catch(() => ({ contracts: [] })),
    ]).then(([d, c]) => {
      setData({ rdos: d.rdos || [], stats: d.stats });
      setContracts(c.contracts || []);
    });
  }, [tick]);

  if (!data) return <div style={{ padding: 40, fontFamily: 'var(--font-sans)' }}>Carregando…</div>;

  const fmtData = (d) => {
    if (!d) return '—';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
  };

  const stats = data.stats || {};
  const aderencia = stats.aderencia7d ?? 100;
  const obrasSemRdo = stats.obrasSemRdoOntem || [];
  const obrasAtrasadas = stats.obrasAtrasadas || [];
  const ehFimDeSemana = stats.ehFimDeSemana;

  const contratosUnicos = [...new Map(data.rdos.map(r => [r.contractId, { id: r.contractId, name: r.contractName, client: r.contractClient }])).values()]
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const rdosOrd = data.rdos
    .slice()
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    .filter(r => !filtroContrato || r.contractId === filtroContrato);

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="RDOs"/>
        <div className="main">
          <Topbar crumbs={["Operação", "RDOs · Todos os contratos"]}/>
          <div className="main-body">

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <h1 className="h1">Relatórios diários de obra</h1>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{data.rdos.length} RDOs · {stats.obrasAtivas || 0} obras ativas</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}><Icon name="plus" size={14}/> Novo RDO</button>
                <a className="btn" href="/#/rdos" target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
            </div>
            {showModal && <ModalRDO onClose={() => setShowModal(false)} onSaved={() => setTick(t => t + 1)} contracts={contracts}/>}

            {ehFimDeSemana && (
              <div className="alert-bar" style={{ background: 'linear-gradient(180deg, #dbeafe, transparent)', borderColor: '#93c5fd' }}>
                <div className="alert-bar-icon" style={{ background: '#1e3a8a' }}>📅</div>
                <div className="alert-bar-text">
                  <b>Hoje é fim de semana</b> — RDO é ocasional, não obrigatório.
                  <span className="muted"> Os alertas referem-se ao último dia útil ({fmtData(stats.ultimoDiaUtil)}).</span>
                </div>
              </div>
            )}

            {!ehFimDeSemana && obrasSemRdo.length > 0 && (
              <div className="alert-bar">
                <div className="alert-bar-icon">!</div>
                <div className="alert-bar-text">
                  <b>{obrasSemRdo.length} obra(s) sem RDO no último dia útil</b> ({fmtData(stats.ultimoDiaUtil)})
                  <span className="muted"> · clique em uma obra abaixo para registrar.</span>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div className="dash-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="card kpi-card">
                <div className="kpi-label">Aderência {stats.diasUteisAvaliados || 7} dias úteis</div>
                <div className="kpi-value tabular" style={{ color: aderencia >= 80 ? 'var(--pos)' : aderencia >= 50 ? 'var(--warn)' : 'var(--neg)' }}>{aderencia}%</div>
                <div className={`kpi-delta ${aderencia >= 80 ? 'up' : 'down'}`}>{aderencia >= 80 ? 'no alvo' : aderencia >= 50 ? 'atenção' : 'crítico'}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Obras ativas</div>
                <div className="kpi-value tabular">{stats.obrasAtivas || 0}</div>
                <div className="kpi-delta flat">contratos status=ativo</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Sem RDO ontem</div>
                <div className="kpi-value tabular" style={{ color: obrasSemRdo.length > 0 ? 'var(--neg)' : 'var(--pos)' }}>{obrasSemRdo.length}</div>
                <div className={`kpi-delta ${obrasSemRdo.length === 0 ? 'up' : 'down'}`}>último dia útil</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Atrasadas (&gt;2du)</div>
                <div className="kpi-value tabular" style={{ color: obrasAtrasadas.length > 0 ? 'var(--warn)' : 'var(--pos)' }}>{obrasAtrasadas.length}</div>
                <div className={`kpi-delta ${obrasAtrasadas.length === 0 ? 'up' : 'down'}`}>2+ dias úteis sem RDO</div>
              </div>
            </div>

            {/* Obras inadimplentes */}
            {(obrasSemRdo.length > 0 || obrasAtrasadas.length > 0) && (
              <div className="grid-2-1">
                <div className="card">
                  <div className="card-h">
                    <div className="card-h-title">
                      <h2 className="h2">Obras sem RDO no último dia útil</h2>
                      <small className="muted">{fmtData(stats.ultimoDiaUtil)}</small>
                    </div>
                  </div>
                  <div className="card-body flush">
                    {obrasSemRdo.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', color: 'var(--pos)', fontSize: 13 }}>✓ Tudo em dia!</div>
                    ) : obrasSemRdo.map((o, i) => (
                      <div key={i} className="rdo-missing" style={{ padding: '10px 16px' }}>
                        <span className="status-dot crit"/>
                        <div style={{ flex: 1 }}>
                          <b>{o.client || o.name}</b> <span className="muted mono" style={{ fontSize: 11 }}>{o.name}</span>
                          <div className="muted" style={{ fontSize: 11 }}>último RDO: {fmtData(o.ultimoRdo) || 'nunca'}</div>
                        </div>
                        <a className="btn btn-sm" href={'#contrato?id=' + o.contractId}>Lançar</a>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <div className="card-h">
                    <div className="card-h-title">
                      <h2 className="h2">Atrasadas</h2>
                      <small className="muted">+2 dias úteis sem RDO</small>
                    </div>
                  </div>
                  <div className="card-body flush">
                    {obrasAtrasadas.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', color: 'var(--pos)', fontSize: 13 }}>—</div>
                    ) : obrasAtrasadas.slice(0, 6).map((o, i) => (
                      <div key={i} className="rdo-missing" style={{ padding: '10px 16px' }}>
                        <span className="status-dot warn"/>
                        <div style={{ flex: 1 }}>
                          <b>{o.client || o.name}</b>
                          <div className="muted" style={{ fontSize: 11 }}>{o.nuncaFezRdo ? 'nunca fez RDO' : o.diasUteisSemRdo + ' dias úteis sem RDO'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tabela de RDOs */}
            <div className="card">
              <div className="filter-bar" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="filter-row">
                  <span className="filter-label">Contrato</span>
                  <button className={`pill-filter ${filtroContrato === '' ? 'on' : ''}`} onClick={() => setFiltroContrato('')}>Todos</button>
                  {contratosUnicos.slice(0, 6).map(c => (
                    <button key={c.id} className={`pill-filter ${filtroContrato === c.id ? 'on' : ''}`} onClick={() => setFiltroContrato(c.id)}>{c.client || c.name}</button>
                  ))}
                </div>
              </div>
              <div className="caixa-tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Nº</th>
                      <th>Contrato</th>
                      <th>Cliente</th>
                      <th>OS</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rdosOrd.length === 0 && (
                      <tr><td colSpan="6" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhum RDO</td></tr>
                    )}
                    {rdosOrd.slice(0, 50).map(r => (
                      <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => { window.location.hash = '#contrato?id=' + r.contractId; }}>
                        <td className="tabular strong">{fmtData(r.data)}</td>
                        <td><span className="mono muted">#{r.numero || '—'}</span></td>
                        <td className="strong">{r.contractName}</td>
                        <td className="muted">{r.contractClient || '—'}</td>
                        <td className="mono muted" style={{ fontSize: 12 }}>{r.osNumero || '—'}</td>
                        <td><a className="btn btn-icon" onClick={e => e.stopPropagation()} href={'#contrato?id=' + r.contractId}><Icon name="arrow-right" size={14}/></a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="tbl-foot">
                <span>{Math.min(50, rdosOrd.length)} de {rdosOrd.length} RDOs</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.RdosList = RdosList;
