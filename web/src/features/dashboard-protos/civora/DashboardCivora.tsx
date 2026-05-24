/**
 * Protótipo A — estilo "Civora" (Shadcn/UI animado).
 * Referência: github.com/MiladJoodi/Civora-Dashboard
 *
 * Vibe: cards modernos com barra colorida no topo (gradient), ícones em
 * "pílulas" com gradient, hover suave, animações de entrada (framer-motion).
 */
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../../../components/ui/Card';
import Spinner from '../../../components/ui/Spinner';
import { formatBRL, formatBRLk } from '../../../lib/format';
import { useDashboardData } from '../shared/useDashboardData';
import '../shared/protos.css';

function KpiCivora({
  icon,
  label,
  value,
  delta,
  href,
  from,
  to,
  i,
}: {
  icon: string;
  label: string;
  value: string;
  delta: string;
  href?: string;
  from: string;
  to: string;
  i: number;
}) {
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: i * 0.06 }}
      className="kpi"
      style={
        {
          ['--accent-from']: from,
          ['--accent-to']: to,
        } as React.CSSProperties
      }
    >
      <div className="kpi-icon" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
        {icon}
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-delta" style={{ color: to }}>
        {delta}
      </div>
    </motion.div>
  );
  return href ? (
    <Link to={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      {card}
    </Link>
  ) : (
    card
  );
}

export default function DashboardCivora() {
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
    <div className="proto-civora">
      <div className="page-header" style={{ alignItems: 'center' }}>
        <div>
          <span className="proto-banner">Protótipo A · Civora</span>
          <h1 className="page-title" style={{ marginTop: 8 }}>
            {data.saudacao}, {data.nome} 👋
          </h1>
          <p className="page-subtitle">Visão consolidada · {new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KpiCivora
          i={0}
          icon="💰"
          label="Saldo em caixa"
          value={formatBRL(data.saldo)}
          delta={`Cobertura ${data.coberturaMeses.toFixed(1)} meses`}
          from="#6366F1"
          to="#8B5CF6"
          href="/caixa"
        />
        <KpiCivora
          i={1}
          icon="📈"
          label="Receitas (mês)"
          value={formatBRL(data.receitasMes)}
          delta={`A receber ${formatBRLk(data.aReceber)}`}
          from="#10B981"
          to="#34D399"
          href="/notas-fiscais"
        />
        <KpiCivora
          i={2}
          icon="📉"
          label="Custos (acum.)"
          value={formatBRL(data.custosAcum)}
          delta={`A pagar ${formatBRLk(data.aPagar)}`}
          from="#F59E0B"
          to="#FB923C"
          href="/contas-pagar"
        />
        <KpiCivora
          i={3}
          icon="🎯"
          label="Margem média"
          value={`${data.margem.toFixed(1)}%`}
          delta={`${data.contratosAtivos} contratos ativos`}
          from="#EC4899"
          to="#F472B6"
          href="/contratos"
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <Card style={{ padding: 20, height: '100%' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>📊 Fluxo de Caixa</h3>
            <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Histórico real · projeção próximos 30 dias
            </p>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fluxoData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cvGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cvBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.25)" />
                  <XAxis
                    dataKey="data"
                    fontSize={11}
                    tickFormatter={(d: string) => {
                      const dt = new Date(d);
                      return Number.isNaN(dt.getTime())
                        ? d
                        : `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
                    }}
                    minTickGap={20}
                  />
                  <YAxis fontSize={11} tickFormatter={(v: number) => formatBRLk(v)} width={56} />
                  <Tooltip
                    labelFormatter={(d) => {
                      const dt = new Date(String(d));
                      return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('pt-BR');
                    }}
                    formatter={(v, n) => {
                      const num = Number(v);
                      return [Number.isFinite(num) ? formatBRL(num) : '—', String(n) === 'real' ? 'Real' : 'Projeção'];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="real"
                    stroke="#10B981"
                    strokeWidth={2}
                    fill="url(#cvGreen)"
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="proj"
                    stroke="#6366F1"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    fill="url(#cvBlue)"
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card style={{ padding: 20, height: '100%' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>🎯 Saúde financeira</h3>
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 800,
                  background: `linear-gradient(135deg, ${data.scoreValor >= 75 ? '#10B981' : data.scoreValor >= 50 ? '#F59E0B' : '#EF4444'}, ${data.scoreValor >= 75 ? '#34D399' : data.scoreValor >= 50 ? '#FB923C' : '#F87171'})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  lineHeight: 1,
                }}
              >
                {data.scoreValor}
              </div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>{data.scoreLabel}</div>
            </div>
            <h4 style={{ margin: '20px 0 8px', fontSize: 13, fontWeight: 700, color: '#475569' }}>
              Pipeline
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { l: 'Rascunho', v: data.pipeline.rascunho, c: '#94A3B8' },
                { l: 'Aguard. emissão', v: data.pipeline.aguardEmissao, c: '#F59E0B' },
                { l: 'NF emitida', v: data.pipeline.nfEmitida, c: '#6366F1' },
                { l: 'Recebida', v: data.pipeline.recebida, c: '#10B981' },
              ].map((s, idx) => {
                const total = Math.max(1, data.pipeline.rascunho + data.pipeline.aguardEmissao + data.pipeline.nfEmitida + data.pipeline.recebida);
                return (
                  <div key={s.l}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span>{s.l}</span>
                      <strong>{s.v}</strong>
                    </div>
                    <div
                      style={{
                        height: 6,
                        background: 'rgba(148,163,184,.15)',
                        borderRadius: 3,
                        marginTop: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(s.v / total) * 100}%` }}
                        transition={{ duration: 0.6, delay: 0.4 + idx * 0.08 }}
                        style={{ height: '100%', background: s.c }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
