// Rhino Hi-fi V5 — Detalhe de Contrato (Visão Geral)
const ContractV5 = () => (
  <div className="hifi-screen">
    <div className="app">
      <Sidebar active="Contratos"/>
      <div className="main">
        <Topbar crumbs={["Contratos", "CT-014 · Veracel"]}/>
        <div className="main-body">

          <div className="ct-header">
            <div className="ct-header-l">
              <div className="ct-header-name">
                <h1 className="h1">Veracel Celulose</h1>
                <span className="tag outline mono">CT-014</span>
                <span className="tag pos"><span className="tag-dot"/> Ativo</span>
              </div>
              <div className="ct-header-meta">
                <span><b>Escopo:</b> Manutenção parada planta 2</span>
                <span><b>Vigência:</b> 02/05 → 30/11/2025</span>
                <span><b>Gestor:</b> João R.</span>
                <span><b>Encarregado:</b> Carlos S.</span>
              </div>
            </div>
            <div className="ct-header-actions">
              <button className="btn"><Icon name="more" size={14}/></button>
              <button className="btn">Editar</button>
              <button className="btn btn-primary"><Icon name="plus" size={14}/> Nova saída/BM</button>
            </div>
          </div>

          <div className="tabs">
            <span className="tab on">Visão Geral</span>
            <span className="tab">Financeiro</span>
            <span className="tab">Equipe <span className="tag outline" style={{ fontSize: 10 }}>18</span></span>
            <span className="tab">RDO</span>
            <span className="tab">Pendências <span className="tag warn">3</span></span>
          </div>

          <div className="ct-stats">
            {[
              ["Valor do contrato", "R$ 2,4M", "Assinado em 02/05/2025"],
              ["Já faturado", "R$ 1,97M", "82% executado"],
              ["Disponível para BM", "R$ 432k", "trava ativa no contrato"],
              ["Resultado parcial", "+ R$ 124k", "margem 18,5%"],
            ].map((s, i) => (
              <div key={i} className="ct-stat">
                <div className="ct-stat-l">{s[0]}</div>
                <div className="ct-stat-v" style={i === 3 ? { color: "var(--pos)" } : {}}>{s[1]}</div>
                <div className="ct-stat-d">{s[2]}</div>
              </div>
            ))}
          </div>

          <div className="ct-overview">
            <div className="col" style={{ gap: 12 }}>
              <div className="card budget">
                <div className="card-h-title">
                  <h2 className="h2">Orçamento — uso do contrato</h2>
                  <small className="muted">novas saídas não podem ultrapassar R$ 2,4M</small>
                </div>
                <div className="budget-stack">
                  <div className="budget-seg recv" style={{ width: "60%" }}>R$ 1,44M recebido</div>
                  <div className="budget-seg emitted" style={{ width: "13%" }}>R$ 312k</div>
                  <div className="budget-seg draft" style={{ width: "9%" }}>R$ 220k</div>
                </div>
                <div className="budget-legend">
                  <span className="bl"><span className="bl-sw" style={{ background: "var(--pos)" }}/> Recebido (60%)</span>
                  <span className="bl"><span className="bl-sw" style={{ background: "var(--accent)" }}/> NF emitida (13%)</span>
                  <span className="bl"><span className="bl-sw" style={{ background: "var(--accent-deep)", opacity: 0.4 }}/> Rascunho (9%)</span>
                  <span className="bl"><span className="bl-sw" style={{ background: "var(--paper-3)", border: "1px solid var(--line)" }}/> Disponível (18%)</span>
                </div>
              </div>

              <div className="card">
                <div className="card-h">
                  <div className="card-h-title">
                    <h2 className="h2">Equipe alocada · 18 pessoas</h2>
                    <small className="muted">2 MOI · 14 MOD · 2 Terceiros</small>
                  </div>
                  <button className="btn btn-sm">Ver todos</button>
                </div>
                <div className="card-body flush">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Pessoa</th><th>Função</th><th>Cat.</th><th>Ciclo</th><th>Próx. folga</th><th>Doc.</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Carlos Silva","encarregado","MOI","21d","08/11","ok","em campo"],
                        ["Marcos Tavares","supervisor","MOI","21d","12/11","ok","em campo"],
                        ["José Pereira","eletricista","MOD","21d","18-25/10","ok","folga"],
                        ["Lucas Mendes","eletricista","MOD","21d","20-27/10","ok","folga"],
                        ["Diego Alves","ajudante","MOD","15d","23-30/10","NR-10 vence","em campo"],
                        ["Renato Borges","eletricista","MOD","28d","22/10-03/11","ok","folga"],
                        ["André Tavares","ajudante","MOD","15d","26/10","ASO vence","em campo"],
                      ].map((r, i) => (
                        <tr key={i}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className="av sm">{r[0].split(" ").map(s => s[0]).slice(0,2).join("")}</span>
                              <span className="strong">{r[0]}</span>
                            </div>
                          </td>
                          <td><span className="muted">{r[1]}</span></td>
                          <td><span className={`equipe-cat ${r[2]}`}>{r[2]}</span></td>
                          <td className="muted tabular">{r[3]}</td>
                          <td className="muted tabular">{r[4]}</td>
                          <td>{r[5] === "ok" ? <span className="doc-badge">OK</span> : <span className="doc-badge warn">{r[5]}</span>}</td>
                          <td>
                            {r[6] === "folga"
                              ? <span className="tag outline">Em folga</span>
                              : <span className="tag pos"><span className="tag-dot"/> Em campo</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="ct-rail">
              <div className="card">
                <div className="card-h">
                  <h2 className="h2">Saídas / BMs</h2>
                  <a className="btn btn-ghost btn-sm" style={{ color: "var(--accent-deep)" }}>Ver todas</a>
                </div>
                <div className="card-body flush">
                  {[
                    ["BM-06","25/10 (prev.)","R$ 184k","draft"],
                    ["BM-05","30/09","R$ 184k","emitted"],
                    ["BM-04","31/08","R$ 220k","received"],
                    ["BM-03","31/07","R$ 198k","received"],
                  ].map((r, i) => (
                    <div key={i} className="bm-list-row">
                      <span className="bm-num mono">{r[0]}</span>
                      <div>
                        <div className="strong tabular">{r[2]}</div>
                        <div className="bm-meta">{r[1]}</div>
                      </div>
                      <span className={`tag ${r[3] === "received" ? "pos" : r[3] === "draft" ? "outline" : "accent"}`}>
                        {r[3] === "received" ? "Recebida" : r[3] === "draft" ? "Rascunho" : "NF emitida"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-h">
                  <h2 className="h2">Pendências</h2>
                  <span className="tag warn">3 abertas</span>
                </div>
                <div className="card-body flush">
                  {[
                    ["Painéis CCM atrasados","fornecedor WEG · 2 dias","crit"],
                    ["Diego A. — NR-10 vence em 8 dias","reagendar treinamento","warn"],
                    ["Aprovação BM-05 com Veracel","aguardando 4 dias","warn"],
                  ].map((p, i) => (
                    <div key={i} className="pend-row">
                      <span className={`status-dot ${p[2]}`}/>
                      <div>
                        <div className="pend-title">{p[0]}</div>
                        <div className="pend-meta">{p[1]}</div>
                      </div>
                      <button className="btn btn-icon"><Icon name="more" size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-h">
                  <h2 className="h2">RDO de hoje</h2>
                  <span className="tag pos"><Icon name="check-c" size={11}/> Lançado</span>
                </div>
                <div className="card-body" style={{ paddingTop: 4 }}>
                  <div style={{ display: "flex", gap: 14 }}>
                    <div>
                      <div className="kpi-label">HH dia</div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>58 h</div>
                    </div>
                    <div>
                      <div className="kpi-label">Pessoas</div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>18</div>
                    </div>
                    <div>
                      <div className="kpi-label">Avanço</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--pos)" }}>+1,8pp</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
);
window.ContractV5 = ContractV5;
