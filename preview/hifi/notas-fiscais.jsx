// Rhino Hi-fi — Notas Fiscais (conectado aos dados reais)

const NotasFiscais = () => {
  const [data, setData] = React.useState(null);
  const [filtro, setFiltro] = React.useState('todos');
  const [busca, setBusca] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    Promise.all([
      fetch('/api/notas-fiscais').then(r => r.json()).catch(() => ({ notas_fiscais: [] })),
      fetch('/api/contracts').then(r => r.json()).catch(() => ({ contracts: [] })),
    ]).then(([nf, c]) => {
      setData({
        notas: nf.notas_fiscais || nf.notasFiscais || nf.notas || [],
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

  const hojeStr = new Date().toISOString().split('T')[0];
  const ctMap = new Map(data.contracts.map(c => [c.id, { codigo: c.codigo || c.name, client: c.client }]));

  const enrich = (n) => {
    const venc = n.dataVencimento || n.data_vencimento || n.dataLimite;
    const isAtrasada = n.status === 'emitida' && venc && venc < hojeStr;
    return { ...n, venc, isAtrasada, valor: Number(n.totalLiquido || n.valorTotal || n.valor) || 0 };
  };
  const enriched = data.notas.map(enrich);

  const counts = {
    todos: enriched.length,
    rascunho: enriched.filter(n => n.status === 'rascunho' || !n.status).length,
    emitida: enriched.filter(n => n.status === 'emitida').length,
    atrasadas: enriched.filter(n => n.isAtrasada).length,
    recebida: enriched.filter(n => n.status === 'recebida').length,
    cancelada: enriched.filter(n => n.status === 'cancelada').length,
  };
  const totals = {
    rascunho: enriched.filter(n => n.status === 'rascunho' || !n.status).reduce((s, n) => s + n.valor, 0),
    emitida: enriched.filter(n => n.status === 'emitida').reduce((s, n) => s + n.valor, 0),
    atrasadas: enriched.filter(n => n.isAtrasada).reduce((s, n) => s + n.valor, 0),
    recebida: enriched.filter(n => n.status === 'recebida').reduce((s, n) => s + n.valor, 0),
  };

  const filtradas = enriched
    .filter(n => {
      if (filtro === 'todos') return true;
      if (filtro === 'rascunho') return n.status === 'rascunho' || !n.status;
      if (filtro === 'emitida') return n.status === 'emitida';
      if (filtro === 'atrasadas') return n.isAtrasada;
      if (filtro === 'recebida') return n.status === 'recebida';
      if (filtro === 'cancelada') return n.status === 'cancelada';
      return true;
    })
    .filter(n => {
      if (!busca) return true;
      const t = busca.toLowerCase();
      const ct = ctMap.get(n.contractId);
      return ((n.numero || '') + ' ' + (ct?.client || '') + ' ' + (ct?.codigo || '') + ' ' + (n.descricao || '')).toLowerCase().includes(t);
    })
    .sort((a, b) => (b.dataEmissao || b.venc || '').localeCompare(a.dataEmissao || a.venc || ''));

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="Notas Fiscais"/>
        <div className="main">
          <Topbar crumbs={["Financeiro", "Notas Fiscais"]}/>
          <div className="main-body">

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <h1 className="h1">Notas fiscais</h1>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {counts.emitida} emitidas · {fmtBRLk(totals.emitida)} a receber
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}><Icon name="plus" size={14}/> Nova NF</button>
                <a className="btn" href="/#/notas-fiscais" target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
            </div>
            {showModal && <ModalNF onClose={() => setShowModal(false)} onSaved={() => setTick(t => t + 1)} contracts={data.contracts}/>}

            {counts.atrasadas > 0 && (
              <div className="alert-bar">
                <div className="alert-bar-icon">!</div>
                <div className="alert-bar-text">
                  <b>{counts.atrasadas} NF(s) atrasada(s)</b> totalizando {fmtBRLk(totals.atrasadas)}
                  <span className="muted"> · cliente em mora.</span>
                </div>
                <button className="btn btn-sm" onClick={() => setFiltro('atrasadas')}>Filtrar atrasadas</button>
              </div>
            )}

            {/* Pipeline visual */}
            <div className="card">
              <div className="card-h">
                <div className="card-h-title">
                  <h2 className="h2">Pipeline de notas fiscais</h2>
                  <small className="muted">do rascunho ao recebimento</small>
                </div>
              </div>
              <div className="pipeline">
                <div className={`pipeline-stage ${filtro === 'rascunho' ? 'active' : ''}`} onClick={() => setFiltro('rascunho')} style={{ cursor: 'pointer' }}>
                  <div className="pipeline-stage-l">Rascunho</div>
                  <div className="pipeline-stage-v tabular">{counts.rascunho}</div>
                  <div className="pipeline-stage-d tabular">{fmtBRLk(totals.rascunho)}</div>
                </div>
                <div className={`pipeline-stage ${filtro === 'emitida' ? 'active' : ''}`} onClick={() => setFiltro('emitida')} style={{ cursor: 'pointer' }}>
                  <div className="pipeline-stage-l">Emitida</div>
                  <div className="pipeline-stage-v tabular">{counts.emitida}</div>
                  <div className="pipeline-stage-d tabular">{fmtBRLk(totals.emitida)}</div>
                </div>
                <div className={`pipeline-stage ${filtro === 'recebida' ? 'active' : ''}`} onClick={() => setFiltro('recebida')} style={{ cursor: 'pointer' }}>
                  <div className="pipeline-stage-l">Recebida</div>
                  <div className="pipeline-stage-v tabular">{counts.recebida}</div>
                  <div className="pipeline-stage-d tabular">{fmtBRLk(totals.recebida)}</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="filter-bar" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="filter-row">
                  <div className="input-search" style={{ minWidth: 280 }}>
                    <Icon name="search" size={14}/>
                    <input placeholder="Buscar nº, cliente, código…" value={busca} onChange={e => setBusca(e.target.value)}/>
                  </div>
                  <span className="filter-label" style={{ marginLeft: 8 }}>Status</span>
                  <button className={`pill-filter ${filtro === 'todos' ? 'on' : ''}`} onClick={() => setFiltro('todos')}>Todos · {counts.todos}</button>
                  <button className={`pill-filter ${filtro === 'rascunho' ? 'on' : ''}`} onClick={() => setFiltro('rascunho')}>Rascunho · {counts.rascunho}</button>
                  <button className={`pill-filter ${filtro === 'emitida' ? 'on' : ''}`} onClick={() => setFiltro('emitida')}>Emitidas · {counts.emitida}</button>
                  <button className={`pill-filter ${filtro === 'atrasadas' ? 'on' : ''}`} onClick={() => setFiltro('atrasadas')}>Atrasadas · {counts.atrasadas}</button>
                  <button className={`pill-filter ${filtro === 'recebida' ? 'on' : ''}`} onClick={() => setFiltro('recebida')}>Recebidas · {counts.recebida}</button>
                </div>
              </div>

              <div className="caixa-tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Emissão</th>
                      <th>Vencimento</th>
                      <th>Cliente</th>
                      <th>Contrato</th>
                      <th className="num-cell">Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.length === 0 && (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhuma NF no filtro</td></tr>
                    )}
                    {filtradas.slice(0, 100).map(n => {
                      const ct = n.contractId ? ctMap.get(n.contractId) : null;
                      const tag = n.status === 'recebida' ? 'pos' : n.isAtrasada ? 'neg' : n.status === 'emitida' ? 'accent' : n.status === 'cancelada' ? 'outline' : 'outline';
                      const label = n.status === 'recebida' ? 'Recebida' : n.isAtrasada ? 'Atrasada' : n.status === 'emitida' ? 'Emitida' : n.status === 'cancelada' ? 'Cancelada' : 'Rascunho';
                      return (
                        <tr key={n.id}>
                          <td><span className="mono strong">#{n.numero || '—'}</span></td>
                          <td className="muted tabular" style={{ fontSize: 12 }}>{fmtData(n.dataEmissao)}</td>
                          <td className="tabular strong">{fmtData(n.venc)}</td>
                          <td>{ct?.client || '—'}</td>
                          <td>{ct ? <span className="tag outline mono" style={{ fontSize: 10 }}>{ct.codigo}</span> : '—'}</td>
                          <td className="num-cell strong tabular">{fmtBRL(n.valor)}</td>
                          <td><span className={`tag ${tag}`}><span className="tag-dot"/> {label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="tbl-foot">
                <span>{Math.min(100, filtradas.length)} de {filtradas.length} NFs · total filtrado {fmtBRL(filtradas.reduce((s, n) => s + n.valor, 0))}</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.NotasFiscais = NotasFiscais;
