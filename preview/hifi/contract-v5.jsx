// Rhino Hi-fi V5 — Detalhe de Contrato (conectado aos dados reais)

const ContractV5 = () => {
  const { params } = (window.usePreviewRoute || (() => ({ params: {} })))();
  const wantedId = params.id;
  const [contract, setContract] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [allContracts, setAllContracts] = React.useState([]);
  const [showSaida, setShowSaida] = React.useState(false);
  const [showRDO, setShowRDO] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    setLoading(true);
    fetch('/api/contracts')
      .then(r => r.json())
      .then(({ contracts = [] }) => {
        setAllContracts(contracts);
        let escolhido = null;
        if (wantedId) escolhido = contracts.find(c => c.id === wantedId);
        if (!escolhido) {
          const ativos = contracts.filter(c => c.status === 'ativo');
          escolhido = ativos[0] || contracts[0];
        }
        setContract(escolhido || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [wantedId, tick]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'var(--font-sans)' }}>Carregando…</div>;
  if (!contract) return <div style={{ padding: 40, fontFamily: 'var(--font-sans)' }}>Nenhum contrato encontrado.</div>;

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

  const valorContrato = Number(contract.value) || 0;
  const saidas = contract.saidas || [];
  const totalEmitido = saidas.filter(s => s.status === 'emitida' || s.status === 'recebida').reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  const totalRecebido = saidas.filter(s => s.status === 'recebida').reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  const totalRascunho = saidas.filter(s => s.status === 'rascunho' || !s.status).reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  const disponivel = Math.max(0, valorContrato - totalEmitido - totalRascunho);
  const pctRecebido = valorContrato > 0 ? (totalRecebido / valorContrato) * 100 : 0;
  const pctEmitido = valorContrato > 0 ? ((totalEmitido - totalRecebido) / valorContrato) * 100 : 0;
  const pctRascunho = valorContrato > 0 ? (totalRascunho / valorContrato) * 100 : 0;
  const pctDisp = Math.max(0, 100 - pctRecebido - pctEmitido - pctRascunho);

  // Equipe
  const organograma = contract.organograma || [];
  const moi = organograma.filter(o => (o.categoria || '').toUpperCase() === 'MOI');
  const mod = organograma.filter(o => (o.categoria || '').toUpperCase() === 'MOD');
  const ter = organograma.filter(o => (o.categoria || '').toUpperCase() === 'TER' || (o.categoria || '').toUpperCase() === 'TERCEIRO');

  // RDOs ordenados (mais recentes)
  const rdos = (contract.rdos || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const ultimoRdo = rdos[0];

  // Status badge
  const statusInfo = {
    ativo: { tag: 'pos', label: 'Ativo' },
    pausado: { tag: 'warn', label: 'Pausado' },
    concluido: { tag: 'outline', label: 'Concluído' },
    cancelado: { tag: 'neg', label: 'Cancelado' },
    prospeccao: { tag: 'accent', label: 'Prospecção' },
  }[contract.status] || { tag: 'outline', label: contract.status };

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="Contratos"/>
        <div className="main">
          <Topbar crumbs={["Contratos", (contract.codigo || contract.name) + ' · ' + (contract.client || '')]}/>
          <div className="main-body">

            <div className="ct-header">
              <div className="ct-header-l">
                <div className="ct-header-name">
                  <h1 className="h1">{contract.client || contract.name}</h1>
                  <span className="tag outline mono">{contract.codigo || ''}</span>
                  <span className={`tag ${statusInfo.tag}`}><span className="tag-dot"/> {statusInfo.label}</span>
                </div>
                <div className="ct-header-meta">
                  {contract.name && <span><b>Escopo:</b> {contract.name}</span>}
                  {contract.startDate && <span><b>Vigência:</b> {fmtData(contract.startDate)} → {fmtData(contract.endDate)}</span>}
                  {contract.gestor && <span><b>Gestor:</b> {contract.gestor}</span>}
                </div>
              </div>
              <div className="ct-header-actions">
                <button className="btn" onClick={() => setShowRDO(true)}><Icon name="plus" size={14}/> Novo RDO</button>
                <button className="btn" onClick={() => setShowSaida(true)}><Icon name="plus" size={14}/> Nova saída/BM</button>
                <a className="btn btn-primary" href={'/#/contratos/' + contract.id} target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
              {showSaida && <ModalSaida onClose={() => setShowSaida(false)} onSaved={() => setTick(t => t + 1)} contracts={[contract, ...allContracts.filter(c => c.id !== contract.id && c.status === 'ativo')]}/>}
              {showRDO && <ModalRDO onClose={() => setShowRDO(false)} onSaved={() => setTick(t => t + 1)} contracts={[contract, ...allContracts.filter(c => c.id !== contract.id && c.status === 'ativo')]} initialContractId={contract.id}/>}
            </div>

            <div className="tabs">
              <span className="tab on">Visão Geral</span>
              <span className="tab">Financeiro</span>
              <span className="tab">Equipe <span className="tag outline" style={{ fontSize: 10 }}>{organograma.length}</span></span>
              <span className="tab">RDO <span className="tag outline" style={{ fontSize: 10 }}>{rdos.length}</span></span>
            </div>

            <div className="ct-stats">
              {[
                ["Valor do contrato", fmtBRLk(valorContrato), 'Assinado em ' + fmtData(contract.startDate)],
                ["Já faturado", fmtBRLk(totalEmitido), valorContrato > 0 ? Math.round((totalEmitido / valorContrato) * 100) + '% executado' : ''],
                ["Disponível para BM", fmtBRLk(disponivel), 'trava ativa no contrato'],
                ["Saídas", String(saidas.length), saidas.filter(s => s.status === 'rascunho').length + ' rascunhos'],
              ].map((s, i) => (
                <div key={i} className="ct-stat">
                  <div className="ct-stat-l">{s[0]}</div>
                  <div className="ct-stat-v">{s[1]}</div>
                  <div className="ct-stat-d">{s[2]}</div>
                </div>
              ))}
            </div>

            <div className="ct-overview">
              <div className="col" style={{ gap: 12 }}>
                <div className="card budget">
                  <div className="card-h-title">
                    <h2 className="h2">Orçamento — uso do contrato</h2>
                    <small className="muted">novas saídas não podem ultrapassar {fmtBRLk(valorContrato)}</small>
                  </div>
                  <div className="budget-stack">
                    {pctRecebido > 0 && <div className="budget-seg recv" style={{ width: pctRecebido + "%" }}>{pctRecebido > 8 ? fmtBRLk(totalRecebido) + ' recebido' : ''}</div>}
                    {pctEmitido > 0 && <div className="budget-seg emitted" style={{ width: pctEmitido + "%" }}>{pctEmitido > 6 ? fmtBRLk(totalEmitido - totalRecebido) : ''}</div>}
                    {pctRascunho > 0 && <div className="budget-seg draft" style={{ width: pctRascunho + "%" }}>{pctRascunho > 6 ? fmtBRLk(totalRascunho) : ''}</div>}
                  </div>
                  <div className="budget-legend">
                    <span className="bl"><span className="bl-sw" style={{ background: "var(--pos)" }}/> Recebido ({pctRecebido.toFixed(0)}%)</span>
                    <span className="bl"><span className="bl-sw" style={{ background: "var(--accent)" }}/> NF emitida ({pctEmitido.toFixed(0)}%)</span>
                    <span className="bl"><span className="bl-sw" style={{ background: "var(--accent-deep)", opacity: 0.4 }}/> Rascunho ({pctRascunho.toFixed(0)}%)</span>
                    <span className="bl"><span className="bl-sw" style={{ background: "var(--paper-3)", border: "1px solid var(--line)" }}/> Disponível ({pctDisp.toFixed(0)}%)</span>
                  </div>
                </div>

                <div className="card">
                  <div className="card-h">
                    <div className="card-h-title">
                      <h2 className="h2">Equipe alocada · {organograma.length} pessoas</h2>
                      <small className="muted">{moi.length} MOI · {mod.length} MOD · {ter.length} Terceiros</small>
                    </div>
                  </div>
                  <div className="card-body flush">
                    {organograma.length === 0 ? (
                      <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Nenhum membro no organograma</div>
                    ) : (
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Pessoa</th><th>Função</th><th>Cat.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {organograma.slice(0, 12).map((p, i) => {
                            const nome = p.nome || p.name || '—';
                            const cat = (p.categoria || 'TER').toUpperCase().slice(0,3);
                            return (
                              <tr key={i}>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span className="av sm">{nome.split(" ").map(s => s[0]).slice(0,2).join("")}</span>
                                    <span className="strong">{nome}</span>
                                  </div>
                                </td>
                                <td><span className="muted">{p.funcao || p.cargo || '—'}</span></td>
                                <td><span className={`equipe-cat ${cat}`}>{cat}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>

              <div className="ct-rail">
                <div className="card">
                  <div className="card-h">
                    <h2 className="h2">Saídas / BMs</h2>
                  </div>
                  <div className="card-body flush">
                    {saidas.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Sem saídas registradas</div>
                    ) : saidas.slice(0, 6).map((s, i) => {
                      const st = s.status === 'recebida' ? 'received' : s.status === 'emitida' ? 'emitted' : 'draft';
                      return (
                        <div key={s.id || i} className="bm-list-row">
                          <span className="bm-num mono">{s.numero || ('#' + (i+1))}</span>
                          <div>
                            <div className="strong tabular">{fmtBRLk(s.value)}</div>
                            <div className="bm-meta">{s.dataEmissao ? fmtData(s.dataEmissao) : (s.descricao || '')}</div>
                          </div>
                          <span className={`tag ${st === "received" ? "pos" : st === "draft" ? "outline" : "accent"}`}>
                            {st === "received" ? "Recebida" : st === "draft" ? "Rascunho" : "NF emitida"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="card">
                  <div className="card-h">
                    <h2 className="h2">Último RDO</h2>
                    {ultimoRdo
                      ? <span className="tag pos"><Icon name="check-c" size={11}/> {fmtData(ultimoRdo.data)}</span>
                      : <span className="tag neg">Nunca</span>}
                  </div>
                  <div className="card-body" style={{ paddingTop: 4 }}>
                    {ultimoRdo ? (
                      <div style={{ display: "flex", gap: 14 }}>
                        <div>
                          <div className="kpi-label">MO Total</div>
                          <div style={{ fontSize: 22, fontWeight: 700 }}>
                            {((ultimoRdo.moi || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0)) +
                             ((ultimoRdo.mod || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0))}
                          </div>
                        </div>
                        <div>
                          <div className="kpi-label">Equipamentos</div>
                          <div style={{ fontSize: 22, fontWeight: 700 }}>{(ultimoRdo.equipamentos || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0)}</div>
                        </div>
                        <div>
                          <div className="kpi-label">Atividades</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{(ultimoRdo.atividades || []).length}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: 'var(--muted)', fontSize: 12, padding: 6 }}>Lance o primeiro RDO no app principal.</div>
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-h">
                    <h2 className="h2">Total de RDOs</h2>
                  </div>
                  <div className="card-body" style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{rdos.length}</div>
                    <div className="muted" style={{ fontSize: 11 }}>relatórios diários registrados</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.ContractV5 = ContractV5;
