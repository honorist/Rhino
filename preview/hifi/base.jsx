// Rhino Hi-fi — BASE (capital geral) conectado aos dados reais

const Base = () => {
  const [data, setData] = React.useState(null);
  const [filtroTipo, setFiltroTipo] = React.useState('todos');
  const [busca, setBusca] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    Promise.all([
      fetch('/api/base').then(r => r.json()).catch(() => ({ items: [] })),
      fetch('/api/tipos-base').then(r => r.json()).catch(() => ({ tipos: [] })),
      fetch('/api/contracts').then(r => r.json()).catch(() => ({ contracts: [] })),
    ]).then(([b, t, c]) => {
      setData({
        items: (b.items || b.baseItems || []).map(it => ({
          ...it,
          allocations: typeof it.allocations === 'string' ? (() => { try { return JSON.parse(it.allocations); } catch { return []; } })() : (it.allocations || []),
        })),
        tipos: t.tipos || [],
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

  const tipoMap = new Map(data.tipos.map(t => [t.key, t]));
  if (!tipoMap.has('outros')) tipoMap.set('outros', { key: 'outros', label: 'Outros', icon: '🔹', cor: '#718096' });
  const ctMap = new Map(data.contracts.map(c => [c.id, { codigo: c.codigo || c.name, client: c.client }]));

  const enriched = data.items.map(it => {
    const allocated = (it.allocations || []).reduce((s, a) => s + (Number(a.value) || 0), 0);
    return {
      ...it,
      allocated,
      disponivel: (Number(it.value) || 0) - allocated,
      tipoInfo: tipoMap.get(it.type) || tipoMap.get('outros'),
    };
  });

  // Totais por tipo
  const totaisPorTipo = {};
  for (const it of enriched) {
    const k = tipoMap.has(it.type) ? it.type : 'outros';
    if (!totaisPorTipo[k]) totaisPorTipo[k] = { count: 0, total: 0, alocado: 0, disp: 0 };
    totaisPorTipo[k].count += 1;
    totaisPorTipo[k].total += Number(it.value) || 0;
    totaisPorTipo[k].alocado += it.allocated;
    totaisPorTipo[k].disp += it.disponivel;
  }

  const totalGeral = enriched.reduce((s, i) => s + (Number(i.value) || 0), 0);
  const totalAloc = enriched.reduce((s, i) => s + i.allocated, 0);
  const totalDisp = enriched.reduce((s, i) => s + i.disponivel, 0);
  const pctAloc = totalGeral > 0 ? (totalAloc / totalGeral) * 100 : 0;

  const filtrados = enriched
    .filter(it => filtroTipo === 'todos' || (it.type === filtroTipo) || (filtroTipo === 'outros' && !tipoMap.has(it.type)))
    .filter(it => !busca || ((it.description || '') + ' ' + (it.notes || '')).toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="BASE"/>
        <div className="main">
          <Topbar crumbs={["Financeiro", "BASE · Capital geral"]}/>
          <div className="main-body">

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <h1 className="h1">BASE</h1>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {enriched.length} itens · {fmtBRLk(totalGeral)} em capital geral · {pctAloc.toFixed(0)}% alocado
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}><Icon name="plus" size={14}/> Novo item</button>
                <a className="btn" href="/#/base" target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
            </div>
            {showModal && <ModalBase onClose={() => setShowModal(false)} onSaved={() => setTick(t => t + 1)} tipos={data.tipos}/>}
            {editing && <ModalBase onClose={() => setEditing(null)} onSaved={() => setTick(t => t + 1)} tipos={data.tipos} initial={editing}/>}

            <div className="dash-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="card kpi-card">
                <div className="kpi-label">Total em capital</div>
                <div className="kpi-value tabular">{fmtBRLk(totalGeral)}</div>
                <div className="kpi-delta flat">{enriched.length} itens registrados</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Alocado em obras</div>
                <div className="kpi-value tabular" style={{ color: 'var(--accent)' }}>{fmtBRLk(totalAloc)}</div>
                <div className="kpi-delta flat">{pctAloc.toFixed(1)}% do total</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Disponível</div>
                <div className="kpi-value tabular" style={{ color: totalDisp > 0 ? 'var(--pos)' : 'var(--muted)' }}>{fmtBRLk(totalDisp)}</div>
                <div className="kpi-delta flat">livre para alocar</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Tipos cadastrados</div>
                <div className="kpi-value tabular">{Object.keys(totaisPorTipo).length}</div>
                <div className="kpi-delta flat">categorias em uso</div>
              </div>
            </div>

            {/* Cards por tipo */}
            <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {Object.entries(totaisPorTipo)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([k, t]) => {
                  const info = tipoMap.get(k) || { label: k, icon: '🔹' };
                  return (
                    <div key={k} className="card kpi-card" style={{ cursor: 'pointer' }} onClick={() => setFiltroTipo(filtroTipo === k ? 'todos' : k)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 18 }}>{info.icon}</span>
                        <div className="kpi-label" style={{ flex: 1 }}>{info.label}</div>
                        {filtroTipo === k && <span className="tag accent" style={{ fontSize: 10 }}>filtrado</span>}
                      </div>
                      <div className="kpi-value tabular" style={{ fontSize: 20 }}>{fmtBRLk(t.total)}</div>
                      <div className="kpi-delta flat">{t.count} itens · {fmtBRLk(t.disp)} livre</div>
                    </div>
                  );
                })}
            </div>

            <div className="card">
              <div className="filter-bar" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="filter-row">
                  <div className="input-search" style={{ minWidth: 280 }}>
                    <Icon name="search" size={14}/>
                    <input placeholder="Buscar descrição…" value={busca} onChange={e => setBusca(e.target.value)}/>
                  </div>
                  <span className="filter-label" style={{ marginLeft: 8 }}>Tipo</span>
                  <button className={`pill-filter ${filtroTipo === 'todos' ? 'on' : ''}`} onClick={() => setFiltroTipo('todos')}>Todos · {enriched.length}</button>
                  {[...tipoMap.values()].map(t => (
                    <button key={t.key} className={`pill-filter ${filtroTipo === t.key ? 'on' : ''}`} onClick={() => setFiltroTipo(t.key)}>
                      {t.icon} {t.label} · {totaisPorTipo[t.key]?.count || 0}
                    </button>
                  ))}
                </div>
              </div>

              <div className="caixa-tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Tipo</th>
                      <th className="num-cell">Valor</th>
                      <th className="num-cell">Alocado</th>
                      <th className="num-cell">Disponível</th>
                      <th>Alocações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 && (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhum item</td></tr>
                    )}
                    {filtrados.slice(0, 100).map(it => {
                      const pctIt = (Number(it.value) || 0) > 0 ? (it.allocated / it.value) * 100 : 0;
                      return (
                        <tr key={it.id}>
                          <td className="muted tabular" style={{ fontSize: 12 }}>{fmtData(it.date)}</td>
                          <td className="strong">{it.description || '—'}</td>
                          <td>
                            <span className="tag outline" style={{ fontSize: 10 }}>
                              {it.tipoInfo.icon} {it.tipoInfo.label}
                            </span>
                          </td>
                          <td className="num-cell strong tabular">{fmtBRL(it.value)}</td>
                          <td className="num-cell tabular" style={{ color: it.allocated > 0 ? 'var(--accent)' : 'var(--muted)' }}>
                            {it.allocated > 0 ? fmtBRL(it.allocated) : '—'}
                            {it.allocated > 0 && (
                              <div className="progress" style={{ marginTop: 4, width: 80, marginLeft: 'auto' }}>
                                <div className="progress-fill accent" style={{ width: pctIt + '%' }}/>
                              </div>
                            )}
                          </td>
                          <td className="num-cell tabular" style={{ color: it.disponivel > 0 ? 'var(--pos)' : 'var(--muted)' }}>
                            {it.disponivel > 0 ? fmtBRL(it.disponivel) : (it.disponivel === 0 ? '0' : fmtBRL(it.disponivel))}
                          </td>
                          <td>
                            {(it.allocations || []).length === 0 ? (
                              <span className="muted" style={{ fontSize: 12 }}>—</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {(it.allocations || []).slice(0, 3).map((a, i) => {
                                  const ct = ctMap.get(a.contractId);
                                  return (
                                    <span key={i} className="tag accent" style={{ fontSize: 10 }} title={fmtBRL(a.value)}>
                                      {ct?.codigo || a.contractId?.slice(-6) || '?'} · {fmtBRLk(a.value)}
                                    </span>
                                  );
                                })}
                                {(it.allocations || []).length > 3 && <span className="muted" style={{ fontSize: 11 }}>+{it.allocations.length - 3}</span>}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="tbl-foot">
                <span>{Math.min(100, filtrados.length)} de {filtrados.length} itens · total filtrado {fmtBRL(filtrados.reduce((s, i) => s + (Number(i.value) || 0), 0))}</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.Base = Base;
