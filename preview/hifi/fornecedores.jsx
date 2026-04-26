// Rhino Hi-fi — Fornecedores (conectado aos dados reais)

const Fornecedores = () => {
  const [data, setData] = React.useState(null);
  const [busca, setBusca] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    Promise.all([
      fetch('/api/fornecedores').then(r => r.json()).catch(() => ({ fornecedores: [] })),
      fetch('/api/contas-pagar').then(r => r.json()).catch(() => ({ contasPagar: [] })),
    ]).then(([f, cp]) => {
      setData({
        fornecedores: f.fornecedores || [],
        contas: cp.contasPagar || cp.contas || [],
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

  const hojeStr = new Date().toISOString().split('T')[0];

  // Agrega contas a pagar por fornecedor
  const stats = (forn) => {
    const cs = data.contas.filter(c => c.fornecedorId === forn.id);
    const totalGasto = cs.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const pendentes = cs.filter(c => c.status === 'pendente');
    const totalPendente = pendentes.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const vencidas = pendentes.filter(c => (c.dataVencimento || c.data_vencimento) && (c.dataVencimento || c.data_vencimento) < hojeStr);
    return {
      contas: cs.length,
      pendentes: pendentes.length,
      totalGasto,
      totalPendente,
      vencidas: vencidas.length,
      ultimaCompra: cs.map(c => c.dataEmissao).filter(Boolean).sort().pop() || null,
    };
  };

  const enriched = data.fornecedores.map(f => ({ ...f, _stats: stats(f) }));

  const total = {
    fornecedores: enriched.length,
    ativos: enriched.filter(f => f._stats.contas > 0).length,
    totalGasto: enriched.reduce((s, f) => s + f._stats.totalGasto, 0),
    totalPendente: enriched.reduce((s, f) => s + f._stats.totalPendente, 0),
    comVencidas: enriched.filter(f => f._stats.vencidas > 0).length,
  };

  // Parse materiais (vem como JSON string)
  const parseMat = (m) => {
    if (!m) return [];
    if (Array.isArray(m)) return m;
    try { const p = JSON.parse(m); return Array.isArray(p) ? p : []; } catch { return []; }
  };

  const filtrados = enriched
    .filter(f => {
      if (!busca) return true;
      const t = busca.toLowerCase();
      const mats = parseMat(f.materiais).join(' ');
      return ((f.nome || '') + ' ' + (f.cnpj || '') + ' ' + (f.email || '') + ' ' + (f.pessoaContato || '') + ' ' + mats).toLowerCase().includes(t);
    })
    .sort((a, b) => b._stats.totalGasto - a._stats.totalGasto || (a.nome || '').localeCompare(b.nome || ''));

  const fmtData = (d) => {
    if (!d) return '—';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
  };

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="Fornecedores"/>
        <div className="main">
          <Topbar crumbs={["Operação", "Fornecedores"]}/>
          <div className="main-body">

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <h1 className="h1">Fornecedores</h1>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {total.fornecedores} cadastrados · {total.ativos} com movimento · {fmtBRLk(total.totalPendente)} a pagar
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}><Icon name="plus" size={14}/> Novo fornecedor</button>
                <a className="btn" href="/#/fornecedores" target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
            </div>
            {showModal && <ModalFornecedor onClose={() => setShowModal(false)} onSaved={() => setTick(t => t + 1)}/>}
            {editing && <ModalFornecedor onClose={() => setEditing(null)} onSaved={() => setTick(t => t + 1)} initial={editing}/>}

            {total.comVencidas > 0 && (
              <div className="alert-bar">
                <div className="alert-bar-icon">!</div>
                <div className="alert-bar-text">
                  <b>{total.comVencidas} fornecedor(es) com pagamento atrasado</b>
                  <span className="muted"> · regularize para evitar bloqueio de fornecimento.</span>
                </div>
                <a className="btn btn-sm" href="/#/contas-pagar" target="_top">Ver contas vencidas</a>
              </div>
            )}

            <div className="dash-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="card kpi-card">
                <div className="kpi-label">Cadastrados</div>
                <div className="kpi-value tabular">{total.fornecedores}</div>
                <div className="kpi-delta flat">na base</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Com movimento</div>
                <div className="kpi-value tabular" style={{ color: 'var(--accent)' }}>{total.ativos}</div>
                <div className="kpi-delta flat">{total.fornecedores > 0 ? Math.round((total.ativos / total.fornecedores) * 100) : 0}% do cadastro</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Total movimentado</div>
                <div className="kpi-value tabular">{fmtBRLk(total.totalGasto)}</div>
                <div className="kpi-delta flat">soma de todas as contas</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">A pagar</div>
                <div className="kpi-value tabular" style={{ color: total.totalPendente > 0 ? 'var(--neg)' : 'var(--ink)' }}>{fmtBRLk(total.totalPendente)}</div>
                <div className={`kpi-delta ${total.comVencidas > 0 ? 'down' : 'flat'}`}>{total.comVencidas > 0 ? total.comVencidas + ' com vencidas' : 'em dia'}</div>
              </div>
            </div>

            <div className="card">
              <div className="filter-bar" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="filter-row">
                  <div className="input-search" style={{ minWidth: 320 }}>
                    <Icon name="search" size={14}/>
                    <input placeholder="Buscar nome, CNPJ, contato, material…" value={busca} onChange={e => setBusca(e.target.value)}/>
                  </div>
                </div>
              </div>

              <div className="caixa-tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Fornecedor</th>
                      <th>CNPJ / Contato</th>
                      <th>Materiais</th>
                      <th className="num-cell">Contas</th>
                      <th className="num-cell">Total movimentado</th>
                      <th className="num-cell">A pagar</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 && (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhum fornecedor</td></tr>
                    )}
                    {filtrados.map(f => {
                      const mats = parseMat(f.materiais);
                      const tag = f._stats.vencidas > 0 ? 'neg' : f._stats.pendentes > 0 ? 'warn' : f._stats.contas > 0 ? 'pos' : 'outline';
                      const label = f._stats.vencidas > 0 ? `${f._stats.vencidas} vencida(s)` : f._stats.pendentes > 0 ? `${f._stats.pendentes} pendente(s)` : f._stats.contas > 0 ? 'Em dia' : 'Sem movimento';
                      return (
                        <tr key={f.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="av sm">{(f.nome || '?').split(' ').map(s => s[0]).slice(0, 2).join('')}</span>
                              <div>
                                <div className="strong">{f.nome || '—'}</div>
                                {f._stats.ultimaCompra && <div className="muted" style={{ fontSize: 11 }}>última: {fmtData(f._stats.ultimaCompra)}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="muted" style={{ fontSize: 12 }}>
                            {f.cnpj && <div className="mono">{f.cnpj}</div>}
                            {f.pessoaContato && <div>{f.pessoaContato}</div>}
                            {!f.cnpj && !f.pessoaContato && '—'}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {mats.length === 0 ? <span className="muted">—</span> : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {mats.slice(0, 3).map((m, i) => (
                                  <span key={i} className="tag outline" style={{ fontSize: 10 }}>{m}</span>
                                ))}
                                {mats.length > 3 && <span className="muted" style={{ fontSize: 11 }}>+{mats.length - 3}</span>}
                              </div>
                            )}
                          </td>
                          <td className="num-cell tabular">
                            <span className="strong">{f._stats.contas}</span>
                            {f._stats.pendentes > 0 && <span className="muted" style={{ fontSize: 11 }}> ({f._stats.pendentes} pend.)</span>}
                          </td>
                          <td className="num-cell strong tabular">{fmtBRLk(f._stats.totalGasto)}</td>
                          <td className="num-cell tabular" style={{ color: f._stats.totalPendente > 0 ? 'var(--neg)' : 'var(--muted)' }}>
                            {f._stats.totalPendente > 0 ? fmtBRLk(f._stats.totalPendente) : '—'}
                          </td>
                          <td>
                            <span className={`tag ${tag}`}><span className="tag-dot"/> {label}</span>
                            <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setEditing(f)}>Editar</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="tbl-foot">
                <span>{filtrados.length} fornecedores · movimentado filtrado {fmtBRLk(filtrados.reduce((s, f) => s + f._stats.totalGasto, 0))}</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.Fornecedores = Fornecedores;
