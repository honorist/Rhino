// Rhino Hi-fi v1 — Componentes compartilhados
// Sidebar, topbar, ícones, helpers numéricos

// ---------- Icons (24px) ----------
const Icon = ({ name, size = 16, stroke = 1.6, color = "currentColor" }) => {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "home": return <svg {...props}><path d="M3 12 12 3l9 9"/><path d="M5 10v10h14V10"/></svg>;
    case "doc": return <svg {...props}><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>;
    case "list": return <svg {...props}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>;
    case "ruler": return <svg {...props}><rect x="3" y="9" width="18" height="6" rx="1"/><path d="M7 9v3M11 9v4M15 9v3M19 9v4"/></svg>;
    case "receipt": return <svg {...props}><path d="M5 3v18l3-2 2 2 2-2 2 2 2-2 3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>;
    case "money": return <svg {...props}><rect x="3" y="6" width="18" height="12" rx="1"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/></svg>;
    case "book": return <svg {...props}><path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h12"/></svg>;
    case "users": return <svg {...props}><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M21 19c0-2.5-1.7-4.5-4-4.5"/></svg>;
    case "wallet": return <svg {...props}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14" r="1.5"/></svg>;
    case "building": return <svg {...props}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/></svg>;
    case "chart": return <svg {...props}><path d="M3 20h18M6 16V8M11 16V4M16 16v-6M21 16v-9"/></svg>;
    case "search": return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case "bell": return <svg {...props}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>;
    case "plus": return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case "filter": return <svg {...props}><path d="M3 5h18l-7 9v6l-4-2v-4z"/></svg>;
    case "download": return <svg {...props}><path d="M12 4v12m0 0-4-4m4 4 4-4"/><path d="M4 20h16"/></svg>;
    case "more": return <svg {...props}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>;
    case "arrow-up": return <svg {...props}><path d="m6 14 6-6 6 6"/></svg>;
    case "arrow-down": return <svg {...props}><path d="m6 10 6 6 6-6"/></svg>;
    case "arrow-right": return <svg {...props}><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
    case "trend-up": return <svg {...props}><path d="m4 17 6-6 4 4 7-7"/><path d="M14 7h7v7"/></svg>;
    case "calendar": return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>;
    case "alert": return <svg {...props}><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/></svg>;
    case "warn-c": return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>;
    case "check-c": return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>;
    case "settings": return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3 1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7 1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></svg>;
    case "rhino": return <svg {...props} viewBox="0 0 32 32"><path d="M3 19c0-2 1-4 3-5l1-2c0-2 2-4 5-4l2-1 4 1 3 1c2 0 4 1 5 3l3 1v3l-2 1-1 4-2 2v3h-4v-3h-7v3h-4v-4l-2-1z" fill="currentColor" stroke="none"/><path d="M22 13l1-2" stroke="white" strokeWidth="1"/><circle cx="22" cy="14.5" r="0.7" fill="white" stroke="none"/></svg>;
    default: return null;
  }
};

// Wordmark
const RhinoLogo = () => (
  <div className="side-mark">
    <svg viewBox="0 0 32 32" width="22" height="22" fill="white">
      <path d="M3 19c0-2 1-4 3-5l1-2c0-2 2-4 5-4l2-1 4 1 3 1c2 0 4 1 5 3l3 1v3l-2 1-1 4-2 2v3h-4v-3h-7v3h-4v-4l-2-1z"/>
      <circle cx="22" cy="14.5" r="0.8" fill="#0c0d10"/>
    </svg>
  </div>
);

// ---------- Sidebar ----------
const Sidebar = ({ active }) => {
  const items = [
    ["Dashboard","home", null],
    ["Contratos","doc", null],
    ["RDOs","list", "2"],
    ["Saídas / BMs","ruler", null],
    ["Notas Fiscais","receipt", null],
    ["Contas a Pagar","money", null],
    ["Caixa","book", null],
    ["Recursos","users", null],
    ["Aportes","wallet", null],
    ["BASE","building", null],
    ["Relatórios","chart", null],
  ];
  return (
    <aside className="side">
      <div className="side-brand">
        <RhinoLogo/>
        <div>
          <div className="side-brand-name">Rhino</div>
          <div className="side-brand-sub">Contratos · Industrial</div>
        </div>
      </div>
      <div className="side-search">
        <Icon name="search" size={14}/>
        <span>Buscar...</span>
        <span className="side-search-k">⌘K</span>
      </div>
      <div className="side-section">Geral</div>
      <nav className="side-nav">
        {items.map(([t, ic, badge], i) => (
          <a key={i} className={`side-i ${t === active ? "on" : ""}`}>
            <span className="side-icon"><Icon name={ic} size={16}/></span>
            <span>{t}</span>
            {badge && <span className="side-badge">{badge}</span>}
          </a>
        ))}
      </nav>
      <div className="side-foot">
        <div className="side-avatar">JR</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="side-foot-name">João R.</div>
          <div className="side-foot-role">Gestor</div>
        </div>
        <button className="topbar-btn btn-icon"><Icon name="settings" size={14}/></button>
      </div>
    </aside>
  );
};

// ---------- Topbar ----------
const Topbar = ({ crumbs = [] }) => (
  <header className="topbar">
    <div className="topbar-crumb">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="topbar-crumb-sep">/</span>}
          {i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}
        </React.Fragment>
      ))}
    </div>
    <div className="topbar-actions">
      <button className="topbar-btn"><Icon name="calendar" size={14}/> Outubro 2025</button>
      <button className="topbar-btn btn-icon"><Icon name="bell" size={15}/><span className="dot-alert"/></button>
    </div>
  </header>
);

// ---------- Helpers ----------
const fmt = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const brl = (n, opts = {}) => {
  const abs = Math.abs(n);
  const v = abs >= 1000000 ? (abs/1000000).toFixed(2).replace(".",",") + "M"
          : abs >= 1000 ? (abs/1000).toFixed(0) + "k"
          : abs.toFixed(0);
  return `${n < 0 ? "− " : ""}R$ ${v}`;
};
const brlFull = (n) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Sparkline
const Sparkline = ({ data, color = "currentColor", h = 22, w = 80 }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i/(data.length-1))*w},${h - ((v-min)/span)*(h-2) - 1}`).join(" ");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

// Score gauge (0-100)
const ScoreGauge = ({ value = 72 }) => {
  const cx = 55, cy = 55, r = 42;
  const start = Math.PI, end = 0;
  const a = start + (1 - value/100) * (end - start) * -1;
  // arc start
  const sx = cx + r*Math.cos(start), sy = cy + r*Math.sin(start);
  const px = cx + r*Math.cos(start - (value/100)*Math.PI);
  const py = cy + r*Math.sin(start - (value/100)*Math.PI);
  const large = value > 50 ? 1 : 0;
  return (
    <svg className="score-gauge" viewBox="0 0 110 70">
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--line)" strokeWidth="8" strokeLinecap="round"/>
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${px} ${py}`} fill="none" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round"/>
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--ink)" fontFamily="var(--font-sans)" letterSpacing="-0.02em">{value}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="9" fontWeight="500" fill="var(--muted)" fontFamily="var(--font-sans)">/ 100</text>
    </svg>
  );
};

// Cashflow: 30d realized + 60d projected, with NF receivables and bills
// Aceita arrays {data, saldo} via props para ligar com dados reais
const CashflowChart = ({ accent = "var(--accent)", realData, projData, recvData, billsData }) => {
  const W = 800, H = 220, P = { l: 44, r: 16, t: 14, b: 28 };
  const fallbackReal = [444,448,442,455,460,470,468,475,480,485,490,495,498,505,512,510,520,525,530,536,540,548,552,560,565,572,575,580,585,592,598,604,612];
  const fallbackProj = [612,620,635,628,640,655,650,665,680,672,690,705,710,725,730,745,752,768,765,780,795,790,805,820,815,830,845,840,855,870,880,895,890,910,925,920,940,955,952,975,990,985,1010,1025,1020,1045,1060,1058,1080,1095,1090,1115,1130,1128,1150,1170,1165,1190,1210];
  // Recebe valores em R$ — converte para milhares (k) para exibir na escala
  const real = realData && realData.length ? realData.map(p => (Number(p.saldo) || 0) / 1000) : fallbackReal;
  const proj = projData && projData.length ? projData.map(p => (Number(p.saldo) || 0) / 1000) : fallbackProj;
  const all = [...real, ...proj];
  const dataMax = Math.max(...all, 1);
  const dataMin = Math.min(...all, 0);
  // Pad 10% acima/abaixo, força mínimo zero se positivo
  const maxV = Math.ceil(dataMax * 1.1 / 100) * 100 || 1000;
  const minV = dataMin < 0 ? Math.floor(dataMin * 1.1 / 100) * 100 : 0;
  const xStep = (W - P.l - P.r) / (all.length - 1);

  const x = i => P.l + i * xStep;
  const y = v => H - P.b - ((v - minV) / (maxV - minV)) * (H - P.t - P.b);

  const realPath = real.map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`).join(" ");
  const projPath = proj.map((v, i) => `${i ? "L" : "M"} ${x(real.length - 1 + i)} ${y(v)}`).join(" ");
  const fillPath = real.map((v, i) => `${i ? "L" : "M"} ${x(i)} ${y(v)}`).join(" ") + ` L ${x(real.length-1)} ${y(0)} L ${x(0)} ${y(0)} Z`;

  // Bills (out) and receivables (in) — aceita props ou usa exemplos
  const bills = billsData && billsData.length ? billsData : [{i:35, v:198, l:"Folha"}, {i:42, v:84, l:"Cabos"}, {i:49, v:43, l:"INSS"}, {i:65, v:142, l:"Painéis"}, {i:78, v:38, l:"Locação"}];
  const recvs = recvData && recvData.length ? recvData : [{i:32, v:184, l:"NF #845"}, {i:38, v:142, l:"NF #846"}, {i:48, v:86, l:"NF #847"}, {i:58, v:220, l:"BM-06"}, {i:75, v:184, l:"BM-07"}];

  // Y grid — 5 ticks distribuídos
  const ticks = (() => {
    const arr = [];
    for (let i = 0; i <= 4; i++) arr.push(Math.round(minV + ((maxV - minV) * i) / 4));
    return arr;
  })();
  // X labels (days)
  const dayLabels = [
    {i:0, l:"21/09"},
    {i:14, l:"05/10"},
    {i:30, l:"hoje"},
    {i:50, l:"10/11"},
    {i:75, l:"05/12"},
    {i:90, l:"20/12"}
  ];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", maxWidth: "100%" }}>
      {/* grid */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--line-2)" strokeWidth="1"/>
          <text x={P.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--font-sans)">{t === 0 ? "0" : (Math.abs(t) >= 1000 ? (t/1000).toFixed(1).replace('.0','') + 'M' : t + 'k')}</text>
        </g>
      ))}
      {/* hoje line */}
      <line x1={x(real.length - 1)} x2={x(real.length - 1)} y1={P.t} y2={H - P.b}
            stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3"/>
      <rect x={x(real.length - 1) - 22} y={P.t - 2} width="44" height="14" rx="3" fill="var(--accent)"/>
      <text x={x(real.length - 1)} y={P.t + 8} textAnchor="middle" fontSize="9" fontWeight="600" fill="white" fontFamily="var(--font-sans)" letterSpacing="0.05em">HOJE</text>

      {/* Receivables (green bars below) */}
      {recvs.map((r, i) => (
        <g key={`r${i}`}>
          <rect x={x(r.i) - 3} y={y(r.v + 100)} width="6" height={y(0) - y(r.v + 100)} fill="var(--pos)" opacity="0.18" rx="2"/>
          <circle cx={x(r.i)} cy={y(r.v + 100)} r="3.5" fill="var(--pos)"/>
        </g>
      ))}
      {/* Bills (red bars below) */}
      {bills.map((b, i) => (
        <g key={`b${i}`}>
          <rect x={x(b.i) - 3} y={y(b.v + 50)} width="6" height={y(0) - y(b.v + 50)} fill="var(--neg)" opacity="0.16" rx="2"/>
          <circle cx={x(b.i)} cy={y(b.v + 50)} r="3.5" fill="var(--neg)"/>
        </g>
      ))}

      {/* Realized fill */}
      <path d={fillPath} fill={accent} opacity="0.12"/>
      {/* Realized line */}
      <path d={realPath} fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Projected line */}
      <path d={projPath} fill="none" stroke={accent} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round"/>

      {/* X labels */}
      {dayLabels.map((d, i) => (
        <text key={i} x={x(d.i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="var(--font-sans)">{d.l}</text>
      ))}

      {/* Last point */}
      <circle cx={x(real.length - 1)} cy={y(real[real.length - 1])} r="4" fill="var(--paper)" stroke={accent} strokeWidth="2"/>
    </svg>
  );
};

// KPI trend mini
const KpiTrend = ({ data, color = "var(--ink-3)", up = true }) => (
  <Sparkline data={data} color={up ? "var(--pos)" : "var(--neg)"} h={28} w={120}/>
);

Object.assign(window, { Icon, RhinoLogo, Sidebar, Topbar, fmt, brl, brlFull, Sparkline, ScoreGauge, CashflowChart, KpiTrend });
