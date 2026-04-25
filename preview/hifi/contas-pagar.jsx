// Rhino Hi-fi — Contas a Pagar (conectado aos dados reais)

const ContasPagar = () => {
  const [data, setData] = React.useState(null);
  const [filtro, setFiltro] = React.useState('pendente');
  const [busca, setBusca] = React.useState('');

  React.useEffect(() => {
    Promise.all([
      fetch('/api/contas-pagar').then(r => r.json()).catch(() => ({ contasPagar: [] })),
      fetch('/api/fornecedores').then(r => r.json()).catch(() => ({ fornecedores: [] })),
      fetch('/api/contracts').then(r => r.json()).catch(() => ({ contracts: [] })),
    ]).then(([cp, f, c]) => {
      setData({
        contas: cp.contasPagar || cp.contas || [],
        fornecedores: f.fornecedores || [],
        contracts: c.contracts || [],
      });
    });
  }, []);

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
  const em7Dias = new Date(); em7Dias.setDate(em7Dias.getDate() + 7);
  const em7DiasStr = em7Dias.toISOString().split('T')[0];

  const fornMap = new Map(data.fornecedores.map(f => [f.id, f.nome || f.razaoSocial || '—']));
  const ctMap = new Map(data.contracts.map(c => [c.id, { codigo: c.codigo || c.name, client: c.client }]));

  const enrich = (c) => {
    const venc = c.dataVencimento || c.data_vencimento;
    const isVencida = c.status === 'pendente' && venc && venc < hojeStr;
    const isProx = c.status === 'pendente' && venc && venc >= hojeStr && venc <= em7DiasStr;
    return { ...c, venc, isVencida, isProx };
  };
  const enriched = data.contas.map(enrich);

  const counts = {
    todos: enriched.length,
    pendente: enriched.filter(c => c.status === 'pendente').length,
    vencidas: enriched.filter(c => c.isVencida).length,
    proximas: enriched.filter(c => c.isProx).length,
    pagas: enriched.filter(c => c.status === 'pago').length,
  };

  const totals = {
    pendente: enriched.filter(c => c.status === 'pendente').reduce((s, c) => s + (Number(c.valor) || 0), 0),
    vencidas: enriched.filter(c => c.isVencida).reduce((s, c) => s + (Number(c.valor) || 0), 0),
    proximas: enriched.filter(c => c.isProx).reduce((s, c) => s + (Number(c.valor) || 0), 0),
    pagas: enriched.filter(c => c.status === 'pago').reduce((s, c) => s + (Number(c.valor) || 0), 0),
  };

  const filtradas = enriched
    .filter(c => {
      if (filtro === 'todos') return true;
      if (filtro === 'pendente') return c.status === 'pendente';
      if (filtro === 'vencidas') return c.isVencida;
      if (filtro === 'proximas') return c.isProx;
      if (filtro === 'pagas') return c.status === 'pago';
      return true;
    })
    .filter(c => {
      if (!busca) return true;
      const t = busca.toLowerCase();
      return ((c.descricao || '') + ' ' + (fornMap.get(c.fornecedorId) || '') + ' ' + (c.numeroNF || '')).toLowerCase().includes(t);
    })
    .sort((a, b) => (a.venc || '').localeCompare(b.venc || ''));

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="Contas a Pagar"/>
        <div className="main">
          <Topbar crumbs={["Financeiro", "Contas a Pagar"]}/>
          <div className="main-body">

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <h1 className="h1">Contas a pagar</h1>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {counts.pendente} pendentes · {fmtBRLk(totals.pendente)} a quitar
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a className="btn" href="/#/contas-pagar" target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
            </div>

            {counts.vencidas > 0 && (
              <div className="alert-bar">
                <div className="alert-bar-icon">!</div>
                <div className="alert-bar-text">
                  <b>{counts.vencidas} conta(s) vencida(s)</b> totalizando {fmtBRLk(totals.vencidas)}
                  <span className="muted"> · regularize para evitar juros e bloqueios.</span>
                </div>
                <button className="btn btn-sm" onClick={() => setFiltro('vencidas')}>Filtrar vencidas</button>
              </div>
            )}

            <div className="dash-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="card kpi-card">
                <div className="kpi-label">Pendentes</div>
                <div className="kpi-value tabular">{fmtBRLk(totals.pendente)}</div>
                <div className="kpi-delta flat">{counts.pendente} contas</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Vencidas</div>
                <div className="kpi-value tabular" style={{ color: counts.vencidas > 0 ? 'var(--neg)' : 'var(--pos)' }}>{fmtBRLk(totals.vencidas)}</div>
                <div className={`kpi-delta ${counts.vencidas > 0 ? 'down' : 'up'}`}>{counts.vencidas} contas</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Vencendo em 7d</div>
                <div className="kpi-value tabular" style={{ color: counts.proximas > 0 ? 'var(--warn)' : 'var(--ink)' }}>{fmtBRLk(totals.proximas)}</div>
                <div className="kpi-delta flat">{counts.proximas} contas</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Pagas</div>
                <div className="kpi-value tabular">{fmtBRLk(totals.pagas)}</div>
                <div className="kpi-delta up">{counts.pagas} quitadas</div>
              </div>
            </div>

            <div className="card">
              <div className="filter-bar" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="filter-row">
                  <div className="input-search" style={{ minWidth: 280 }}>
                    <Icon name="search" size={14}/>
                    <input placeholder="Buscar descrição, fornecedor, NF…" value={busca} onChange={e => setBusca(e.target.value)}/>
                  </div>
                  <span className="filter-label" style={{ marginLeft: 8 }}>Status</span>
                  <button className={`pill-filter ${filtro === 'todos' ? 'on' : ''}`} onClick={() => setFiltro('todos')}>Todos · {counts.todos}</button>
                  <button className={`pill-filter ${filtro === 'pendente' ? 'on' : ''}`} onClick={() => setFiltro('pendente')}>Pendentes · {counts.pendente}</button>
                  <button className={`pill-filter ${filtro === 'vencidas' ? 'on' : ''}`} onClick={() => setFiltro('vencidas')}>Vencidas · {counts.vencidas}</button>
                  <button className={`pill-filter ${filtro === 'proximas' ? 'on' : ''}`} onClick={() => setFiltro('proximas')}>7 dias · {counts.proximas}</button>
                  <button className={`pill-filter ${filtro === 'pagas' ? 'on' : ''}`} onClick={() => setFiltro('pagas')}>Pagas · {counts.pagas}</button>
                </div>
              </div>

              <div className="caixa-tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Vencimento</th>
                      <th>Descrição</th>
                      <th>Fornecedor</th>
                      <th>Contrato</th>
                      <th>NF</th>
                      <th className="num-cell">Valor</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.length === 0 && (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhuma conta no filtro</td></tr>
                    )}
                    {filtradas.slice(0, 100).map(c => {
                      const ct = c.contractId ? ctMap.get(c.contractId) : null;
                      const tag = c.status === 'pago' ? 'pos' : c.isVencida ? 'neg' : c.isProx ? 'warn' : 'outline';
                      const label = c.status === 'pago' ? 'Pago' : c.isVencida ? 'Vencida' : c.isProx ? 'Vence em breve' : 'Pendente';
                      return (
                        <tr key={c.id}>
                          <td className="tabular strong">{fmtData(c.venc)}</td>
                          <td className="strong">{c.descricao || '—'}</td>
                          <td className="muted">{fornMap.get(c.fornecedorId) || '—'}</td>
                          <td>
                            {ct ? <span className="tag outline mono" style={{ fontSize: 10 }}>{ct.codigo}</span> : <span className="muted" style={{ fontSize: 12 }}>BASE</span>}
                          </td>
                          <td className="mono muted" style={{ fontSize: 12 }}>{c.numeroNF || '—'}</td>
                          <td className="num-cell strong tabular">{fmtBRL(c.valor)}</td>
                          <td><span className={`tag ${tag}`}><span className="tag-dot"/> {label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="tbl-foot">
                <span>{Math.min(100, filtradas.length)} de {filtradas.length} contas · total filtrado {fmtBRL(filtradas.reduce((s, c) => s + (Number(c.valor) || 0), 0))}</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.ContasPagar = ContasPagar;
