// Rhino Hi-fi — Clientes (conectado aos dados reais)

const Clientes = () => {
  const [data, setData] = React.useState(null);
  const [busca, setBusca] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    Promise.all([
      fetch('/api/clientes').then(r => r.json()).catch(() => ({ clientes: [] })),
      fetch('/api/contracts').then(r => r.json()).catch(() => ({ contracts: [] })),
      fetch('/api/notas-fiscais').then(r => r.json()).catch(() => ({ notas_fiscais: [] })),
    ]).then(([cli, c, nf]) => {
      setData({
        clientes: cli.clientes || [],
        contracts: c.contracts || [],
        notas: nf.notas_fiscais || nf.notasFiscais || [],
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

  // Agrega contratos por cliente: o app vincula contrato ao cliente pelo nome (c.client === cliente.empresa ou similar)
  // Tenta dois critérios: clienteId e nome do cliente
  const stats = (cli) => {
    const matchById = data.contracts.filter(c => c.clienteId === cli.id);
    const matchByName = data.contracts.filter(c => !c.clienteId && (c.client === cli.empresa || c.client === cli.nome));
    const ctrs = matchById.length > 0 ? matchById : matchByName;
    const ativos = ctrs.filter(c => c.status === 'ativo');
    const carteira = ctrs.reduce((s, c) => s + (Number(c.value) || 0), 0);
    const ctrIds = new Set(ctrs.map(c => c.id));
    const nfsCli = data.notas.filter(n => ctrIds.has(n.contractId));
    const nfsAReceber = nfsCli.filter(n => n.status === 'emitida').reduce((s, n) => s + (Number(n.totalLiquido || n.valorTotal) || 0), 0);
    return { ctrs: ctrs.length, ativos: ativos.length, carteira, nfsAReceber, nfsCount: nfsCli.length };
  };

  const enriched = data.clientes.map(cli => ({ ...cli, _stats: stats(cli) }));

  const total = {
    clientes: enriched.length,
    comAtivos: enriched.filter(c => c._stats.ativos > 0).length,
    carteiraTotal: enriched.reduce((s, c) => s + c._stats.carteira, 0),
    aReceber: enriched.reduce((s, c) => s + c._stats.nfsAReceber, 0),
  };

  const filtrados = enriched
    .filter(cli => {
      if (!busca) return true;
      const t = busca.toLowerCase();
      return ((cli.empresa || '') + ' ' + (cli.nome || '') + ' ' + (cli.email || '') + ' ' + (cli.endereco || '')).toLowerCase().includes(t);
    })
    .sort((a, b) => b._stats.carteira - a._stats.carteira || (a.empresa || a.nome || '').localeCompare(b.empresa || b.nome || ''));

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="Clientes"/>
        <div className="main">
          <Topbar crumbs={["Operação", "Clientes"]}/>
          <div className="main-body">

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <h1 className="h1">Clientes</h1>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {total.clientes} clientes · {total.comAtivos} com contrato ativo · {fmtBRLk(total.carteiraTotal)} em carteira
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}><Icon name="plus" size={14}/> Novo cliente</button>
                <a className="btn" href="/#/clientes" target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
            </div>
            {showModal && <ModalCliente onClose={() => setShowModal(false)} onSaved={() => setTick(t => t + 1)}/>}
            {editing && <ModalCliente onClose={() => setEditing(null)} onSaved={() => setTick(t => t + 1)} initial={editing}/>}

            <div className="dash-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="card kpi-card">
                <div className="kpi-label">Clientes cadastrados</div>
                <div className="kpi-value tabular">{total.clientes}</div>
                <div className="kpi-delta flat">na base</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Com obra ativa</div>
                <div className="kpi-value tabular" style={{ color: 'var(--accent)' }}>{total.comAtivos}</div>
                <div className="kpi-delta flat">{total.clientes > 0 ? Math.round((total.comAtivos / total.clientes) * 100) : 0}% do cadastro</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Carteira total</div>
                <div className="kpi-value tabular">{fmtBRLk(total.carteiraTotal)}</div>
                <div className="kpi-delta flat">soma de todos contratos</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">A receber (NFs)</div>
                <div className="kpi-value tabular" style={{ color: total.aReceber > 0 ? 'var(--pos)' : 'var(--ink)' }}>{fmtBRLk(total.aReceber)}</div>
                <div className="kpi-delta flat">NFs emitidas pendentes</div>
              </div>
            </div>

            <div className="card">
              <div className="filter-bar" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="filter-row">
                  <div className="input-search" style={{ minWidth: 280 }}>
                    <Icon name="search" size={14}/>
                    <input placeholder="Buscar empresa, contato, email…" value={busca} onChange={e => setBusca(e.target.value)}/>
                  </div>
                </div>
              </div>

              <div className="caixa-tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Contato</th>
                      <th>Localização</th>
                      <th className="num-cell">Contratos</th>
                      <th className="num-cell">Carteira</th>
                      <th className="num-cell">A receber</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 && (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhum cliente</td></tr>
                    )}
                    {filtrados.map(cli => {
                      const tag = cli._stats.ativos > 0 ? 'pos' : cli._stats.ctrs > 0 ? 'outline' : 'accent';
                      const label = cli._stats.ativos > 0 ? 'Ativo' : cli._stats.ctrs > 0 ? 'Sem obra ativa' : 'Prospect';
                      return (
                        <tr key={cli.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="av sm">{(cli.empresa || cli.nome || '?').split(' ').map(s => s[0]).slice(0, 2).join('')}</span>
                              <div>
                                <div className="strong">{cli.empresa || cli.nome || '—'}</div>
                                {cli.empresa && cli.nome && <div className="muted" style={{ fontSize: 11 }}>{cli.nome}{cli.cargo ? ' · ' + cli.cargo : ''}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize: 12 }}>
                            {cli.email && <div>{cli.email}</div>}
                            {cli.telefone && <div className="mono">{cli.telefone}</div>}
                            {!cli.email && !cli.telefone && '—'}
                          </td>
                          <td className="muted" style={{ fontSize: 12 }}>{cli.endereco || '—'}</td>
                          <td className="num-cell tabular">
                            <span className="strong">{cli._stats.ctrs}</span>
                            {cli._stats.ativos > 0 && <span className="muted" style={{ fontSize: 11 }}> ({cli._stats.ativos} ativos)</span>}
                          </td>
                          <td className="num-cell strong tabular">{fmtBRLk(cli._stats.carteira)}</td>
                          <td className="num-cell tabular" style={{ color: cli._stats.nfsAReceber > 0 ? 'var(--pos)' : 'var(--muted)' }}>
                            {cli._stats.nfsAReceber > 0 ? fmtBRLk(cli._stats.nfsAReceber) : '—'}
                          </td>
                          <td>
                            <span className={`tag ${tag}`}><span className="tag-dot"/> {label}</span>
                            <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setEditing(cli)}>Editar</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="tbl-foot">
                <span>{filtrados.length} clientes · carteira filtrada {fmtBRLk(filtrados.reduce((s, c) => s + c._stats.carteira, 0))}</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.Clientes = Clientes;
