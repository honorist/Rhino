/**
 * Protótipo C — Dark Glassmorphism mobile-first.
 * Referência: github.com/saurabhrdj50/construction-field-management
 *
 * Vibe: fundo dark gradient, cards translúcidos com blur (glassmorphism),
 * gradients texto vibrante, layout mobile-first (single column scroll), chips
 * horizontais scrolláveis. Visual de "app de campo".
 */
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Spinner from '../../../components/ui/Spinner';
import { formatBRL, formatBRLk } from '../../../lib/format';
import { useDashboardData } from '../shared/useDashboardData';
import '../shared/protos.css';

export default function DashboardGlass() {
  const data = useDashboardData(30);
  if (!data.ready) return <Spinner label="Carregando dashboard…" />;

  const fluxoData = [
    ...data.historico.map((p) => ({ data: p.data, real: p.saldo, proj: null as number | null })),
    ...data.projecao.map((p, idx) => ({
      data: p.data,
      real: idx === 0 && data.historico.length
        ? data.historico[data.historico.length - 1].saldo
        : null,
      proj: p.saldo,
    })),
  ];

  return (
    <div className="proto-glass">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span className="proto-banner">Protótipo C · Glass</span>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '8px 0 4px' }}>
            {data.saudacao}, {data.nome}
          </h1>
          <div style={{ fontSize: 13, color: '#CBD5E1' }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {/* KPIs em chips horizontais (estilo mobile-first) */}
      <div className="glass-chip-row" style={{ marginBottom: 20 }}>
        {[
          { l: 'Cobertura', v: `${data.coberturaMeses.toFixed(1)} mo`, c: '#60A5FA' },
          { l: 'A receber', v: formatBRLk(data.aReceber), c: '#34D399' },
          { l: 'A pagar', v: formatBRLk(data.aPagar), c: '#F87171' },
          { l: 'Margem', v: `${data.margem.toFixed(1)}%`, c: '#FCD34D' },
          { l: 'Score', v: String(data.scoreValor), c: '#A78BFA' },
          { l: 'Contratos', v: String(data.contratosAtivos), c: '#F472B6' },
        ].map((c) => (
          <div key={c.l} className="glass-chip">
            <span style={{ color: '#94A3B8' }}>{c.l}: </span>
            <strong style={{ color: c.c }}>{c.v}</strong>
          </div>
        ))}
      </div>

      {/* KPIs principais em cards glass */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 14,
          marginBottom: 20,
        }}
      >
        {[
          { l: 'Saldo em caixa', v: formatBRL(data.saldo), href: '/caixa' },
          { l: 'Receitas (mês)', v: formatBRL(data.receitasMes), href: '/notas-fiscais' },
          { l: 'Custos (acum.)', v: formatBRL(data.custosAcum), href: '/contas-pagar' },
        ].map((k, i) => (
          <motion.div
            key={k.l}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, delay: i * 0.08 }}
          >
            <Link to={k.href} style={{ textDecoration: 'none' }}>
              <div className="glass-card">
                <div className="glass-label">{k.l}</div>
                <div className="glass-value">{k.v}</div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Fluxo de caixa */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="glass-card"
        style={{ marginBottom: 20 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>📊 Fluxo de Caixa</h3>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>30 dias projetados</span>
        </div>
        <div style={{ height: 220, marginTop: 12 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fluxoData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="glassReal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34D399" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="glassProj" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#A78BFA" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="data"
                fontSize={10}
                stroke="#CBD5E1"
                tickFormatter={(d: string) => {
                  const dt = new Date(d);
                  return Number.isNaN(dt.getTime()) ? d : `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
                }}
                minTickGap={24}
              />
              <YAxis
                fontSize={10}
                stroke="#CBD5E1"
                tickFormatter={(v: number) => formatBRLk(v)}
                width={50}
              />
              <Tooltip
                contentStyle={{ background: 'rgba(15,23,42,.95)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, color: '#F1F5F9' }}
                labelFormatter={(d) => {
                  const dt = new Date(String(d));
                  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('pt-BR');
                }}
                formatter={(v, n) => {
                  const num = Number(v);
                  return [Number.isFinite(num) ? formatBRL(num) : '—', String(n) === 'real' ? 'Real' : 'Projeção'];
                }}
              />
              <Area type="monotone" dataKey="real" stroke="#34D399" strokeWidth={2} fill="url(#glassReal)" connectNulls />
              <Area type="monotone" dataKey="proj" stroke="#A78BFA" strokeWidth={2} strokeDasharray="6 4" fill="url(#glassProj)" connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Pipeline em glass */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        className="glass-card"
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>🔄 Pipeline de Faturamento</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { l: 'Rascunho', v: data.pipeline.rascunho, c: '#94A3B8' },
            { l: 'Aguard. emissão', v: data.pipeline.aguardEmissao, c: '#FBBF24' },
            { l: 'NF emitida', v: data.pipeline.nfEmitida, c: '#60A5FA' },
            { l: 'Recebida', v: data.pipeline.recebida, c: '#34D399' },
          ].map((s) => (
            <div key={s.l}>
              <div style={{ fontSize: 11, color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.l}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.c, marginTop: 4 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
