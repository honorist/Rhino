// Rhino Hi-fi — Sócios + Aportes (conectado aos dados reais)

const Socios = () => {
  const [data, setData] = React.useState(null);
  const [busca, setBusca] = React.useState('');
  const [modal, setModal] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    Promise.all([
      fetch('/api/socios').then(r => r.json()).catch(() => ({ socios: [] })),
      fetch('/api/investimentos').then(r => r.json()).catch(() => ({ investimentos: [] })),
      fetch('/api/contracts').then(r => r.json()).catch(() => ({ contracts: [] })),
    ]).then(([s, i, c]) => {
      setData({
        socios: s.socios || [],
        aportes: i.investimentos || i.aportes || [],
        contracts: c.contracts || [],
      });
    });
  }, [tick]);

  if (!data) return <div style={{ padding: 40, fontFamily: 'var(--font-sans)' }}>Carregando…</div>;

  const fmtBRLk = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1_000_000) return 'R$ ' + (v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + 'M';
    if (Math.abs(v) >= 1_000) return 'R$ ' + Math.round(v / 1000) + 'k';
    return 'R$ ' + Math.round(v);
  };
  const fmtBRL = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtData = (d) => {
    if (!d) return '—';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
  };

  const ctMap = new Map(data.contracts.map(c => [c.id, { codigo: c.codigo || c.name, client: c.client }]));

  const stats = (s) => {
    const aps = data.aportes.filter(a => a.socioId === s.id);
    const total = aps.reduce((sum, a) => sum + (Number(a.value) || 0), 0);
    const paraBase = aps.filter(a => a.destino === 'base').reduce((sum, a) => sum + (Number(a.value) || 0), 0);
    const paraContrato = aps.filter(a => a.destino === 'contrato').reduce((sum, a) => sum + (Number(a.value) || 0), 0);
    const ultimoAporte = aps.map(a => a.date).filter(Boolean).sort().pop() || null;
    return { aportes: aps.length, total, paraBase, paraContrato, ultimoAporte };
  };

  const enriched = data.socios.map(s => ({ ...s, _stats: stats(s) }));

  const total = {
    socios: enriched.length,
    participacao: enriched.reduce((s, x) => s + (Number(x.participacao) || 0), 0),
    aportes: data.aportes.length,
    aportesValor: data.aportes.reduce((s, a) => s + (Number(a.value) || 0), 0),
    aportesBase: data.aportes.filter(a => a.destino === 'base').reduce((s, a) => s + (Number(a.value) || 0), 0),
    aportesContrato: data.aportes.filter(a => a.destino === 'contrato').reduce((s, a) => s + (Number(a.value) || 0), 0),
  };

  const filtrados = enriched
    .filter(s => {
      if (!busca) return true;
      const t = busca.toLowerCase();
      return ((s.name || '') + ' ' + (s.document || '') + ' ' + (s.email || '')).toLowerCase().includes(t);
    })
    .sort((a, b) => b._stats.total - a._stats.total || (a.name || '').localeCompare(b.name || ''));

  // Aportes recentes (últimos 10)
  const aportesRecentes = [...data.aportes]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 10);
  const socioName = (id) => data.socios.find(s => s.id === id)?.name || '—';

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="Aportes"/>
        <div className="main">
          <Topbar crumbs={["Financeiro", "Sócios e Aportes"]}/>
          <div className="main-body">

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <h1 className="h1">Sócios e aportes</h1>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {total.socios} sócios · {total.participacao.toFixed(1)}% de participação total · {fmtBRLk(total.aportesValor)} aportados
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => setModal('socio')}><Icon name="plus" size={14}/> Novo sócio</button>
                <button className="btn btn-primary" onClick={() => setModal('aporte')}><Icon name="plus" size={14}/> Novo aporte</button>
                <a className="btn" href="/#/socios" target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
            </div>
            {modal === 'socio' && <ModalSocio onClose={() => setModal(null)} onSaved={() => setTick(t => t + 1)}/>}
            {modal === 'aporte' && <ModalAporte onClose={() => setModal(null)} onSaved={() => setTick(t => t + 1)} socios={data.socios} contracts={data.contracts}/>}
            {editing && <ModalSocio onClose={() => setEditing(null)} onSaved={() => setTick(t => t + 1)} initial={editing}/>}

            {Math.abs(total.participacao - 100) > 0.01 && total.socios > 0 && (
              <div className="alert-bar">
                <div className="alert-bar-icon">!</div>
                <div className="alert-bar-text">
                  <b>Participação total = {total.participacao.toFixed(2)}%</b>
                  <span className="muted"> · esperado 100%. Verifique os percentuais cadastrados.</span>
                </div>
              </div>
            )}

            <div className="dash-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="card kpi-card">
                <div className="kpi-label">Sócios</div>
                <div className="kpi-value tabular">{total.socios}</div>
                <div className="kpi-delta flat">{total.participacao.toFixed(1)}% no total</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Aportes acumulados</div>
                <div className="kpi-value tabular" style={{ color: 'var(--pos)' }}>{fmtBRLk(total.aportesValor)}</div>
                <div className="kpi-delta up">{total.aportes} lançamentos</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Para BASE</div>
                <div className="kpi-value tabular">{fmtBRLk(total.aportesBase)}</div>
                <div className="kpi-delta flat">capital geral</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Para contratos</div>
                <div className="kpi-value tabular" style={{ color: 'var(--accent)' }}>{fmtBRLk(total.aportesContrato)}</div>
                <div className="kpi-delta flat">capital de giro por obra</div>
              </div>
            </div>

            <div className="grid-2-1">
              <div className="card">
                <div className="card-h">
                  <div className="card-h-title">
                    <h2 className="h2">Sócios</h2>
                    <small className="muted">ordenados por valor aportado</small>
                  </div>
                </div>
                <div className="filter-bar" style={{ borderBottom: '1px solid var(--line)' }}>
                  <div className="filter-row">
                    <div className="input-search" style={{ minWidth: 240 }}>
                      <Icon name="search" size={14}/>
                      <input placeholder="Buscar sócio…" value={busca} onChange={e => setBusca(e.target.value)}/>
                    </div>
                  </div>
                </div>
                <div className="caixa-tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Sócio</th>
                        <th className="num-cell">Participação</th>
                        <th className="num-cell">Aportes</th>
                        <th className="num-cell">Total aportado</th>
                        <th>Último aporte</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.length === 0 && (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhum sócio</td></tr>
                      )}
                      {filtrados.map(s => (
                        <tr key={s.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="av sm">{(s.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('')}</span>
                              <div>
                                <div className="strong">{s.name || '—'}</div>
                                {s.document && <div className="muted mono" style={{ fontSize: 11 }}>{s.document}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="num-cell strong tabular">{(Number(s.participacao) || 0).toFixed(2)}%</td>
                          <td className="num-cell tabular">{s._stats.aportes}</td>
                          <td className="num-cell strong tabular" style={{ color: s._stats.total > 0 ? 'var(--pos)' : 'var(--muted)' }}>
                            {s._stats.total > 0 ? fmtBRLk(s._stats.total) : '—'}
                          </td>
                          <td className="muted tabular" style={{ fontSize: 12 }}>{fmtData(s._stats.ultimoAporte)}</td>
                          <td><button className="btn btn-sm" onClick={() => setEditing(s)}>Editar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-h">
                  <div className="card-h-title">
                    <h2 className="h2">Aportes recentes</h2>
                    <small className="muted">últimos 10 lançamentos</small>
                  </div>
                </div>
                <div className="card-body flush">
                  {aportesRecentes.length === 0 ? (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Nenhum aporte registrado</div>
                  ) : aportesRecentes.map(a => {
                    const ct = a.contractId ? ctMap.get(a.contractId) : null;
                    return (
                      <div key={a.id} className="event-row" style={{ gridTemplateColumns: '50px 1fr auto auto' }}>
                        <div className="event-date">
                          {fmtData(a.date).slice(0, 5)}
                          <small>{(new Date(a.date)).toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)}</small>
                        </div>
                        <div className="event-desc">
                          <b>{a.description || (a.destino === 'base' ? 'Aporte BASE' : 'Aporte contrato')}</b>
                          <small>{socioName(a.socioId)}{ct ? ' · ' + ct.codigo : ''}</small>
                        </div>
                        <span className={`tag ${a.destino === 'base' ? 'outline' : 'accent'}`}>
                          {a.destino === 'base' ? 'BASE' : 'Contrato'}
                        </span>
                        <div className="event-amt in tabular">+ {fmtBRL(a.value)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.Socios = Socios;
