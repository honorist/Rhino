// Rhino Hi-fi V6 — Livro Caixa
const CaixaV6 = () => (
  <div className="hifi-screen">
    <div className="app">
      <Sidebar active="Caixa"/>
      <div className="main">
        <Topbar crumbs={["Financeiro", "Caixa"]}/>
        <div className="main-body">

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <h1 className="h1">Livro caixa</h1>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>Outubro 2025 · 64 movimentações no período</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="view-switch">
                <button>‹ Set</button>
                <button className="on">Out 25</button>
                <button>Nov ›</button>
              </div>
              <button className="btn"><Icon name="download" size={14}/> Exportar</button>
              <button className="btn btn-primary"><Icon name="plus" size={14}/> Lançamento</button>
            </div>
          </div>

          <div className="caixa-summary">
            <div className="card caixa-c">
              <div className="caixa-c-l">Saldo inicial</div>
              <div className="caixa-c-v tabular">R$ 444k</div>
              <div className="caixa-c-d">01/10/2025</div>
            </div>
            <div className="card caixa-c in">
              <div className="caixa-c-l">Entradas</div>
              <div className="caixa-c-v tabular">+ R$ 1,42M</div>
              <div className="caixa-c-d">14 NFs · 2 aportes</div>
            </div>
            <div className="card caixa-c out">
              <div className="caixa-c-l">Saídas</div>
              <div className="caixa-c-v tabular">− R$ 1,38M</div>
              <div className="caixa-c-d">32 contas · 12 BASE</div>
            </div>
            <div className="card caixa-c balance">
              <div className="caixa-c-l">Saldo atual</div>
              <div className="caixa-c-v tabular">R$ 482k</div>
              <div className="caixa-c-d" style={{ color: "var(--pos)", fontWeight: 600 }}>↑ R$ 38k no mês</div>
            </div>
          </div>

          <div className="card">
            <div className="filter-bar" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="filter-row">
                <div className="input-search">
                  <Icon name="search" size={14}/>
                  <input placeholder="Buscar descrição, NF, fornecedor..."/>
                </div>
                <span className="filter-label">Tipo</span>
                <button className="pill-filter on">Tudo · 64</button>
                <button className="pill-filter">Entradas · 16</button>
                <button className="pill-filter">Saídas · 48</button>
                <span className="filter-label" style={{ marginLeft: 8 }}>Vínculo</span>
                <button className="pill-filter">NF</button>
                <button className="pill-filter">Conta a Pagar</button>
                <button className="pill-filter">Aporte</button>
                <button className="pill-filter">BASE</button>
              </div>
              <div className="filter-row">
                <span className="filter-label">Filtros ativos:</span>
                <span className="tag accent">Out 25 ×</span>
                <span className="tag accent">Contrato: todos ×</span>
                <span className="filter-clear">Limpar</span>
              </div>
            </div>

            <div className="caixa-tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Data</th><th>Tipo</th><th>Descrição</th><th>Vínculo</th><th>Contrato</th>
                    <th className="num-cell">Entrada</th><th className="num-cell">Saída</th><th className="num-cell">Saldo</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["21/10","saída","Folha quinzena","Conta a pagar #1208","BASE",null,198400,482140],
                    ["20/10","entrada","Recebimento NF #832","NF Klabin · BM-03","CT-015",86300,null,680540],
                    ["18/10","saída","Cabos Pirelli","Conta a pagar #1205","CT-014",null,84200,594240],
                    ["17/10","entrada","Aporte sócio","Aporte #042","BASE",150000,null,678440],
                    ["16/10","saída","Locação guindaste","Conta a pagar #1203","CT-016",null,28000,528440],
                    ["15/10","entrada","Recebimento NF #830","NF Veracel · BM-04","CT-014",220000,null,556440],
                    ["12/10","saída","Aluguel galpão","BASE #18","BASE",null,18000,336440],
                    ["10/10","entrada","Recebimento NF #828","NF Suzano · BM-02","CT-016",68400,null,354440],
                    ["08/10","saída","INSS folha","Conta a pagar #1198","BASE",null,42640,286040],
                    ["05/10","entrada","Recebimento NF #826","NF Veracel · BM-04","CT-014",184000,null,328680],
                  ].map((r, i) => (
                    <tr key={i}>
                      <td className="muted tabular">{r[0]}</td>
                      <td>
                        {r[1] === "entrada"
                          ? <span className="tag pos"><Icon name="arrow-up" size={10} stroke={2.4}/> Entrada</span>
                          : <span className="tag neg"><Icon name="arrow-down" size={10} stroke={2.4}/> Saída</span>}
                      </td>
                      <td className="strong">{r[2]}</td>
                      <td className="linkbox"><a>{r[3]}</a></td>
                      <td><span className="mono muted">{r[4]}</span></td>
                      <td className="num-cell row-pos strong tabular">{r[5] ? `+ R$ ${r[5].toLocaleString("pt-BR")}` : ""}</td>
                      <td className="num-cell row-neg strong tabular">{r[6] ? `− R$ ${r[6].toLocaleString("pt-BR")}` : ""}</td>
                      <td className="num-cell strong tabular">R$ {r[7].toLocaleString("pt-BR")}</td>
                      <td><button className="btn btn-icon"><Icon name="more" size={14}/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="tbl-foot">
              <span>10 de 64 movimentações · entradas R$ 708k · saídas R$ 371k no período</span>
              <div className="pager">
                <button className="pill-filter">‹ ant.</button>
                <button className="pill-filter on">1</button>
                <button className="pill-filter">2</button>
                <button className="pill-filter">3</button>
                <button className="pill-filter">próx. ›</button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
);
window.CaixaV6 = CaixaV6;
