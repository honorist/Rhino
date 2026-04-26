// Rhino Hi-fi — Auditoria (read-only)

const Auditoria = () => {
  const [data, setData] = React.useState(null);
  const [filtros, setFiltros] = React.useState({ user: '', entity: '', action: '' });
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const qs = new URLSearchParams();
    if (filtros.user) qs.append('user', filtros.user);
    if (filtros.entity) qs.append('entity', filtros.entity);
    if (filtros.action) qs.append('action', filtros.action);
    qs.append('limit', '200');
    fetch('/api/audit?' + qs.toString())
      .then(r => r.json())
      .catch(() => ({ rows: [], total: 0 }))
      .then(d => setData(d));
  }, [filtros, tick]);

  if (!data) return <div style={{ padding: 40, fontFamily: 'var(--font-sans)' }}>Carregando…</div>;

  const fmtTs = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  };

  const ENTITIES = {
    contracts: 'Contrato', clientes: 'Cliente', fornecedores: 'Fornecedor', recursos: 'Recurso',
    socios: 'Sócio', investimentos: 'Aporte', 'notas-fiscais': 'NF', 'contas-pagar': 'Conta a pagar',
    caixa: 'Caixa', base: 'Item BASE', 'doc-templates': 'Template doc', users: 'Usuário',
    'niveis-acesso': 'Nível de acesso', 'tipos-base': 'Tipo BASE',
  };
  const labelEntity = (e) => {
    if (!e) return '—';
    const root = e.split('.')[0];
    const sub = e.includes('.') ? ' · ' + e.split('.')[1] : '';
    return (ENTITIES[root] || e) + sub;
  };
  const labelAction = (a) => ({
    create: 'Criou', update: 'Atualizou', delete: 'Excluiu',
    pagar: 'Marcou pago', estornar: 'Estornou', emitir: 'Emitiu', 'cancelar-emissao': 'Cancelou emissão',
  }[a] || a);
  const labelStatus = (s) => {
    if (!s) return '';
    if (s >= 200 && s < 300) return 'OK';
    if (s >= 400 && s < 500) return 'Erro do usuário';
    if (s >= 500) return 'Erro do servidor';
    return s;
  };

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="Auditoria"/>
        <div className="main">
          <Topbar crumbs={["Administração", "Auditoria"]}/>
          <div className="main-body">

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <h1 className="h1">Auditoria</h1>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  Histórico completo de mudanças · {data.total || data.rows.length} eventos registrados
                </p>
              </div>
              <button className="btn" onClick={() => setTick(t => t + 1)}>Atualizar</button>
            </div>

            <div className="card">
              <div className="filter-bar" style={{ borderBottom: '1px solid var(--line)' }}>
                <div className="filter-row">
                  <div className="input-search" style={{ minWidth: 220 }}>
                    <Icon name="search" size={14}/>
                    <input placeholder="Quem fez (email)…" value={filtros.user} onChange={e => setFiltros(f => ({ ...f, user: e.target.value }))}/>
                  </div>
                  <select className="form-control" style={{ width: 200, fontSize: 12 }} value={filtros.entity} onChange={e => setFiltros(f => ({ ...f, entity: e.target.value }))}>
                    <option value="">Em qual tela (todas)</option>
                    {Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select className="form-control" style={{ width: 180, fontSize: 12 }} value={filtros.action} onChange={e => setFiltros(f => ({ ...f, action: e.target.value }))}>
                    <option value="">Tipo de ação (todas)</option>
                    <option value="create">Criou</option>
                    <option value="update">Atualizou</option>
                    <option value="delete">Excluiu</option>
                    <option value="pagar">Marcou pago</option>
                    <option value="emitir">Emitiu</option>
                  </select>
                </div>
              </div>
              <div className="caixa-tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Quem</th>
                      <th>Ação</th>
                      <th>Onde</th>
                      <th>Resultado</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!data.rows || data.rows.length === 0) && (
                      <tr><td colSpan="6" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhum evento</td></tr>
                    )}
                    {(data.rows || []).map(e => {
                      const ok = e.status >= 200 && e.status < 300;
                      return (
                        <tr key={e.id}>
                          <td className="muted tabular" style={{ fontSize: 12 }}>{fmtTs(e.ts)}</td>
                          <td className="strong">{e.user_email || '—'}</td>
                          <td>
                            <span className={`tag ${e.action === 'delete' ? 'neg' : e.action === 'create' ? 'pos' : 'accent'}`}>
                              {labelAction(e.action)}
                            </span>
                          </td>
                          <td>{labelEntity(e.entity)}</td>
                          <td>
                            <span className={`tag ${ok ? 'pos' : 'neg'}`}>{labelStatus(e.status)}</span>
                            {e.duration_ms && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{e.duration_ms}ms</span>}
                          </td>
                          <td className="mono muted" style={{ fontSize: 11 }}>{e.ip || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="tbl-foot">
                <span>{(data.rows || []).length} eventos exibidos · {data.total || 0} no total</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.Auditoria = Auditoria;
