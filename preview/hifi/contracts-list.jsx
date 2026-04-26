// Rhino Hi-fi — Lista de Contratos (conectado aos dados reais)

const ContractsList = () => {
  const [data, setData] = React.useState(null);
  const [filtroStatus, setFiltroStatus] = React.useState('ativo');
  const [busca, setBusca] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    Promise.all([
      fetch('/api/contracts').then(r => r.json()).catch(() => ({ contracts: [] })),
      fetch('/api/rdos').then(r => r.json()).catch(() => ({ stats: null })),
    ]).then(([c, r]) => setData({ contracts: c.contracts || [], rdoStats: r.stats }));
  }, [tick]);

  if (!data) return <div style={{ padding: 40, fontFamily: 'var(--font-sans)' }}>Carregando…</div>;

  const fmtBRLk = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1_000_000) return 'R$ ' + (v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + 'M';
    if (Math.abs(v) >= 1_000) return 'R$ ' + Math.round(v / 1000) + 'k';
    return 'R$ ' + Math.round(v);
  };
  const fmtData = (d) => {
    if (!d) return '—';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
  };

  const semRdoIds = new Set((data.rdoStats?.obrasSemRdoOntem || []).map(o => o.contractId));
  const atrasIds = new Set((data.rdoStats?.obrasAtrasadas || []).map(o => o.contractId));

  const counts = {
    todos: data.contracts.length,
    ativo: data.contracts.filter(c => c.status === 'ativo').length,
    pausado: data.contracts.filter(c => c.status === 'pausado').length,
    concluido: data.contracts.filter(c => c.status === 'concluido').length,
    prospeccao: data.contracts.filter(c => c.status === 'prospeccao').length,
    cancelado: data.contracts.filter(c => c.status === 'cancelado').length,
  };

  const filtrados = data.contracts
    .filter(c => filtroStatus === 'todos' || c.status === filtroStatus)
    .filter(c => !busca || (c.name + ' ' + (c.client || '') + ' ' + (c.codigo || '')).toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => (a.client || '').localeCompare(b.client || ''));

  const totalCarteira = filtrados.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const stTags = {
    ativo: { tag: 'pos', label: 'Ativo' },
    pausado: { tag: 'warn', label: 'Pausado' },
    concluido: { tag: 'outline', label: 'Concluído' },
    cancelado: { tag: 'neg', label: 'Cancelado' },
    prospeccao: { tag: 'accent', label: 'Prospecção' },
  };

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="Contratos"/>
        <div className="main">
          <Topbar crumbs={["Operação", "Contratos"]}/>
          <div className="main-body">

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <h1 className="h1">Contratos</h1>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{filtrados.length} contratos · {fmtBRLk(totalCarteira)} em carteira</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}><Icon name="plus" size={14}/> Novo contrato</button>
                <a className="btn" href="/#/contratos" target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
            </div>
            {showModal && <ModalContrato onClose={() => setShowModal(false)} onSaved={() => setTick(t => t + 1)}/>}

            <div className="card">
              <div className="filter-bar" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="filter-row">
                  <div className="input-search" style={{ minWidth: 260 }}>
                    <Icon name="search" size={14}/>
                    <input placeholder="Buscar contrato, cliente, código…" value={busca} onChange={e => setBusca(e.target.value)}/>
                  </div>
                  <span className="filter-label" style={{ marginLeft: 8 }}>Status</span>
                  <button className={`pill-filter ${filtroStatus === 'todos' ? 'on' : ''}`} onClick={() => setFiltroStatus('todos')}>Todos · {counts.todos}</button>
                  <button className={`pill-filter ${filtroStatus === 'ativo' ? 'on' : ''}`} onClick={() => setFiltroStatus('ativo')}>Ativos · {counts.ativo}</button>
                  <button className={`pill-filter ${filtroStatus === 'pausado' ? 'on' : ''}`} onClick={() => setFiltroStatus('pausado')}>Pausados · {counts.pausado}</button>
                  <button className={`pill-filter ${filtroStatus === 'prospeccao' ? 'on' : ''}`} onClick={() => setFiltroStatus('prospeccao')}>Prospecção · {counts.prospeccao}</button>
                  <button className={`pill-filter ${filtroStatus === 'concluido' ? 'on' : ''}`} onClick={() => setFiltroStatus('concluido')}>Concluídos · {counts.concluido}</button>
                  <button className={`pill-filter ${filtroStatus === 'cancelado' ? 'on' : ''}`} onClick={() => setFiltroStatus('cancelado')}>Cancelados · {counts.cancelado}</button>
                </div>
              </div>

              <div className="caixa-tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Cliente / Contrato</th>
                      <th>Código</th>
                      <th>Vigência</th>
                      <th className="num-cell">Valor</th>
                      <th className="num-cell">Saídas</th>
                      <th className="num-cell">RDOs</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 && (
                      <tr><td colSpan="8" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhum contrato</td></tr>
                    )}
                    {filtrados.map(c => {
                      const st = stTags[c.status] || { tag: 'outline', label: c.status };
                      const semRdo = c.status === 'ativo' && semRdoIds.has(c.id);
                      const atras = c.status === 'ativo' && atrasIds.has(c.id);
                      const nSaidas = (c.saidas || []).length;
                      const nRdos = (c.rdos || []).length;
                      return (
                        <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => { window.location.hash = '#contrato?id=' + c.id; }}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className="strong">{c.client || '—'}</span>
                              {semRdo && <span title="Sem RDO no último dia útil" className="status-dot crit"/>}
                              {atras && !semRdo && <span title="Atrasada >2 dias úteis" className="status-dot warn"/>}
                            </div>
                            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{c.name}</div>
                          </td>
                          <td><span className="tag outline mono" style={{ fontSize: 10 }}>{c.codigo || '—'}</span></td>
                          <td className="muted tabular" style={{ fontSize: 12 }}>{fmtData(c.startDate)} → {fmtData(c.endDate)}</td>
                          <td className="num-cell strong tabular">{fmtBRLk(c.value)}</td>
                          <td className="num-cell tabular">{nSaidas}</td>
                          <td className="num-cell tabular">{nRdos}</td>
                          <td><span className={`tag ${st.tag}`}><span className="tag-dot"/> {st.label}</span></td>
                          <td><a className="btn btn-icon" onClick={e => e.stopPropagation()} href={'#contrato?id=' + c.id}><Icon name="arrow-right" size={14}/></a></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="tbl-foot">
                <span>{filtrados.length} contratos · valor total filtrado {fmtBRLk(totalCarteira)}</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.ContractsList = ContractsList;
