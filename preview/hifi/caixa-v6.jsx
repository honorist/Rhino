// Rhino Hi-fi V6 — Livro Caixa (conectado aos dados reais)

const CaixaV6 = () => {
  const [data, setData] = React.useState(null);
  const [filtro, setFiltro] = React.useState('tudo');
  const [busca, setBusca] = React.useState('');

  React.useEffect(() => {
    Promise.all([
      fetch('/api/caixa').then(r => r.json()).catch(() => ({ entries: [] })),
    ]).then(([cx]) => {
      setData({ entries: cx.entries || [] });
    });
  }, []);

  if (!data) return <div style={{ padding: 40, fontFamily: 'var(--font-sans)' }}>Carregando…</div>;

  const fmtBRLk = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + 'M';
    if (Math.abs(v) >= 1_000) return Math.round(v / 1000) + 'k';
    return String(Math.round(v));
  };
  const fmtBRL = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const hoje = new Date();
  const mes = hoje.getMonth();
  const ano = hoje.getFullYear();
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // Entradas do mês atual
  const noMes = data.entries.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === mes && d.getFullYear() === ano;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  // Saldo inicial = soma de tudo antes do mês
  const saldoInicial = data.entries
    .filter(e => new Date(e.date) < new Date(ano, mes, 1))
    .reduce((s, e) => e.type === 'entrada' ? s + Number(e.value) : s - Number(e.value), 0);

  const totalEntradas = noMes.filter(e => e.type === 'entrada').reduce((s, e) => s + Number(e.value), 0);
  const totalSaidas = noMes.filter(e => e.type === 'saida').reduce((s, e) => s + Number(e.value), 0);
  const saldoAtual = saldoInicial + totalEntradas - totalSaidas;
  const variacaoMes = totalEntradas - totalSaidas;

  // Filtros
  const filtradas = noMes.filter(e => {
    if (filtro === 'entrada' && e.type !== 'entrada') return false;
    if (filtro === 'saida' && e.type !== 'saida') return false;
    if (busca && !(e.description || '').toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  // Saldo cumulativo (mais recente primeiro: precisa calcular do mais antigo)
  const cronologica = [...filtradas].sort((a, b) => new Date(a.date) - new Date(b.date));
  let saldoAcum = saldoInicial;
  const linhas = cronologica.map(e => {
    saldoAcum += e.type === 'entrada' ? Number(e.value) : -Number(e.value);
    return { ...e, saldoApos: saldoAcum };
  }).reverse();

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="Caixa"/>
        <div className="main">
          <Topbar crumbs={["Financeiro", "Caixa"]}/>
          <div className="main-body">

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <h1 className="h1">Livro caixa</h1>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{meses[mes]} {ano} · {noMes.length} movimentações no período</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a className="btn" href="/#/caixa" target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
            </div>

            <div className="caixa-summary">
              <div className="card caixa-c">
                <div className="caixa-c-l">Saldo inicial</div>
                <div className="caixa-c-v tabular">R$ {fmtBRLk(saldoInicial)}</div>
                <div className="caixa-c-d">01/{String(mes+1).padStart(2,'0')}/{ano}</div>
              </div>
              <div className="card caixa-c in">
                <div className="caixa-c-l">Entradas</div>
                <div className="caixa-c-v tabular">+ R$ {fmtBRLk(totalEntradas)}</div>
                <div className="caixa-c-d">{noMes.filter(e => e.type === 'entrada').length} lançamentos</div>
              </div>
              <div className="card caixa-c out">
                <div className="caixa-c-l">Saídas</div>
                <div className="caixa-c-v tabular">− R$ {fmtBRLk(totalSaidas)}</div>
                <div className="caixa-c-d">{noMes.filter(e => e.type === 'saida').length} lançamentos</div>
              </div>
              <div className="card caixa-c balance">
                <div className="caixa-c-l">Saldo atual</div>
                <div className="caixa-c-v tabular">R$ {fmtBRLk(saldoAtual)}</div>
                <div className="caixa-c-d" style={{ color: variacaoMes >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>
                  {variacaoMes >= 0 ? '↑' : '↓'} R$ {fmtBRLk(Math.abs(variacaoMes))} no mês
                </div>
              </div>
            </div>

            <div className="card">
              <div className="filter-bar" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="filter-row">
                  <div className="input-search">
                    <Icon name="search" size={14}/>
                    <input placeholder="Buscar descrição..." value={busca} onChange={e => setBusca(e.target.value)}/>
                  </div>
                  <span className="filter-label">Tipo</span>
                  <button className={`pill-filter ${filtro === 'tudo' ? 'on' : ''}`} onClick={() => setFiltro('tudo')}>Tudo · {noMes.length}</button>
                  <button className={`pill-filter ${filtro === 'entrada' ? 'on' : ''}`} onClick={() => setFiltro('entrada')}>Entradas · {noMes.filter(e => e.type === 'entrada').length}</button>
                  <button className={`pill-filter ${filtro === 'saida' ? 'on' : ''}`} onClick={() => setFiltro('saida')}>Saídas · {noMes.filter(e => e.type === 'saida').length}</button>
                </div>
              </div>

              <div className="caixa-tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Data</th><th>Tipo</th><th>Descrição</th><th>Origem</th>
                      <th className="num-cell">Entrada</th><th className="num-cell">Saída</th><th className="num-cell">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.length === 0 && (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhuma movimentação no período</td></tr>
                    )}
                    {linhas.slice(0, 50).map((e, i) => {
                      const d = new Date(e.date);
                      const dataStr = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
                      return (
                        <tr key={e.id || i}>
                          <td className="muted tabular">{dataStr}</td>
                          <td>
                            {e.type === "entrada"
                              ? <span className="tag pos"><Icon name="arrow-up" size={10} stroke={2.4}/> Entrada</span>
                              : <span className="tag neg"><Icon name="arrow-down" size={10} stroke={2.4}/> Saída</span>}
                          </td>
                          <td className="strong">{e.description || '—'}</td>
                          <td className="linkbox"><span className="mono muted">{e.origem || e.contractCodigo || ''}</span></td>
                          <td className="num-cell row-pos strong tabular">{e.type === 'entrada' ? '+ ' + fmtBRL(e.value) : ''}</td>
                          <td className="num-cell row-neg strong tabular">{e.type === 'saida' ? '− ' + fmtBRL(e.value) : ''}</td>
                          <td className="num-cell strong tabular">{fmtBRL(e.saldoApos)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="tbl-foot">
                <span>{Math.min(50, linhas.length)} de {linhas.length} movimentações · entradas {fmtBRL(totalEntradas)} · saídas {fmtBRL(totalSaidas)}</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.CaixaV6 = CaixaV6;
