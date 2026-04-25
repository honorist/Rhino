// Rhino Hi-fi — Recursos (conectado aos dados reais)

const Recursos = () => {
  const [data, setData] = React.useState(null);
  const [filtroStatus, setFiltroStatus] = React.useState('funcionario');
  const [busca, setBusca] = React.useState('');

  React.useEffect(() => {
    Promise.all([
      fetch('/api/recursos').then(r => r.json()).catch(() => ({ recursos: [] })),
      fetch('/api/contracts').then(r => r.json()).catch(() => ({ contracts: [] })),
    ]).then(([r, c]) => setData({ recursos: r.recursos || [], contracts: c.contracts || [] }));
  }, []);

  if (!data) return <div style={{ padding: 40, fontFamily: 'var(--font-sans)' }}>Carregando…</div>;

  const fmtData = (d) => {
    if (!d) return '—';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
  };

  const ctMap = new Map(data.contracts.map(c => [c.id, { codigo: c.codigo || c.name, client: c.client }]));

  // Avalia documentos próximos do vencimento (30d)
  const hoje = new Date();
  const em30 = new Date(); em30.setDate(em30.getDate() + 30);
  const docStatus = (r) => {
    const docs = r.documentos || [];
    if (docs.length === 0) return null;
    let venc = null, prox = null;
    for (const d of docs) {
      if (!d.validade) continue;
      const dt = new Date(d.validade + 'T12:00:00');
      if (dt < hoje) venc = d;
      else if (dt <= em30 && !prox) prox = d;
    }
    if (venc) return { type: 'venc', label: (venc.tipo || 'Doc') + ' vencido' };
    if (prox) return { type: 'prox', label: (prox.tipo || 'Doc') + ' vence' };
    return { type: 'ok', label: 'OK' };
  };

  const counts = {
    todos: data.recursos.length,
    funcionario: data.recursos.filter(r => r.status === 'funcionario').length,
    candidato: data.recursos.filter(r => r.status === 'candidato').length,
    ex: data.recursos.filter(r => r.status === 'ex_funcionario').length,
    alocados: data.recursos.filter(r => r.status === 'funcionario' && r.alocacaoAtual?.contractId).length,
    docVencidos: data.recursos.filter(r => docStatus(r)?.type === 'venc').length,
  };

  const filtrados = data.recursos
    .filter(r => filtroStatus === 'todos' || r.status === filtroStatus)
    .filter(r => {
      if (!busca) return true;
      const t = busca.toLowerCase();
      return ((r.nome || '') + ' ' + (r.cpf || '') + ' ' + (r.profissao || '') + ' ' + (r.cargo || '')).toLowerCase().includes(t);
    })
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="Recursos"/>
        <div className="main">
          <Topbar crumbs={["Pessoas", "Recursos"]}/>
          <div className="main-body">

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <h1 className="h1">Recursos</h1>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {counts.funcionario} funcionários · {counts.alocados} alocados em obras
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a className="btn" href="/#/recursos" target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
            </div>

            {counts.docVencidos > 0 && (
              <div className="alert-bar">
                <div className="alert-bar-icon">!</div>
                <div className="alert-bar-text">
                  <b>{counts.docVencidos} pessoa(s) com documento vencido</b>
                  <span className="muted"> · regularize NR-10, ASO ou outros para evitar bloqueio em obra.</span>
                </div>
              </div>
            )}

            <div className="dash-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="card kpi-card">
                <div className="kpi-label">Funcionários</div>
                <div className="kpi-value tabular">{counts.funcionario}</div>
                <div className="kpi-delta flat">cadastro ativo</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Alocados em obra</div>
                <div className="kpi-value tabular" style={{ color: 'var(--accent)' }}>{counts.alocados}</div>
                <div className="kpi-delta flat">com contrato vinculado</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Candidatos</div>
                <div className="kpi-value tabular">{counts.candidato}</div>
                <div className="kpi-delta flat">em processo</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Doc. vencidos</div>
                <div className="kpi-value tabular" style={{ color: counts.docVencidos > 0 ? 'var(--neg)' : 'var(--pos)' }}>{counts.docVencidos}</div>
                <div className={`kpi-delta ${counts.docVencidos > 0 ? 'down' : 'up'}`}>requer atenção</div>
              </div>
            </div>

            <div className="card">
              <div className="filter-bar" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="filter-row">
                  <div className="input-search" style={{ minWidth: 260 }}>
                    <Icon name="search" size={14}/>
                    <input placeholder="Buscar nome, CPF, profissão…" value={busca} onChange={e => setBusca(e.target.value)}/>
                  </div>
                  <span className="filter-label" style={{ marginLeft: 8 }}>Status</span>
                  <button className={`pill-filter ${filtroStatus === 'todos' ? 'on' : ''}`} onClick={() => setFiltroStatus('todos')}>Todos · {counts.todos}</button>
                  <button className={`pill-filter ${filtroStatus === 'funcionario' ? 'on' : ''}`} onClick={() => setFiltroStatus('funcionario')}>Funcionários · {counts.funcionario}</button>
                  <button className={`pill-filter ${filtroStatus === 'candidato' ? 'on' : ''}`} onClick={() => setFiltroStatus('candidato')}>Candidatos · {counts.candidato}</button>
                  <button className={`pill-filter ${filtroStatus === 'ex_funcionario' ? 'on' : ''}`} onClick={() => setFiltroStatus('ex_funcionario')}>Ex-funcionários · {counts.ex}</button>
                </div>
              </div>

              <div className="caixa-tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Profissão</th>
                      <th>Categoria</th>
                      <th>Alocação</th>
                      <th>Documentos</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 && (
                      <tr><td colSpan="6" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhum recurso</td></tr>
                    )}
                    {filtrados.slice(0, 100).map(r => {
                      const ct = r.alocacaoAtual?.contractId ? ctMap.get(r.alocacaoAtual.contractId) : null;
                      const cat = (r.alocacaoAtual?.categoria || r.categoria || 'TER').toUpperCase().slice(0, 3);
                      const doc = docStatus(r);
                      const stTag = r.status === 'funcionario' ? 'pos' : r.status === 'candidato' ? 'accent' : 'outline';
                      const stLabel = r.status === 'funcionario' ? 'Ativo' : r.status === 'candidato' ? 'Candidato' : 'Ex';
                      return (
                        <tr key={r.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className="av sm">{(r.nome || '?').split(" ").map(s => s[0]).slice(0, 2).join("")}</span>
                              <div>
                                <div className="strong">{r.nome || '—'}</div>
                                {r.cpf && <div className="muted mono" style={{ fontSize: 11 }}>{r.cpf}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="muted">{r.profissao || r.cargo || '—'}</td>
                          <td>{r.alocacaoAtual ? <span className={`equipe-cat ${cat}`}>{cat}</span> : <span className="muted" style={{ fontSize: 12 }}>—</span>}</td>
                          <td>
                            {ct ? (
                              <div>
                                <span className="strong" style={{ fontSize: 12 }}>{ct.client}</span>
                                <div><span className="tag outline mono" style={{ fontSize: 10 }}>{ct.codigo}</span></div>
                              </div>
                            ) : <span className="muted" style={{ fontSize: 12 }}>{r.status === 'funcionario' ? 'BASE' : '—'}</span>}
                          </td>
                          <td>
                            {!doc ? <span className="muted" style={{ fontSize: 12 }}>—</span> :
                              doc.type === 'venc' ? <span className="doc-badge crit">{doc.label}</span> :
                              doc.type === 'prox' ? <span className="doc-badge warn">{doc.label}</span> :
                              <span className="doc-badge">OK</span>}
                          </td>
                          <td><span className={`tag ${stTag}`}><span className="tag-dot"/> {stLabel}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="tbl-foot">
                <span>{Math.min(100, filtrados.length)} de {filtrados.length} pessoas</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.Recursos = Recursos;
