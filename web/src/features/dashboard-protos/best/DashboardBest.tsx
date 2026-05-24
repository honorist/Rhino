/**
 * Protótipo D — "Best Practices" (whitespace + hierarquia visual).
 *
 * Princípios que extraí da pesquisa 2026:
 *   - 3-5 métricas principais lidas primeiro (hero)
 *   - Agrupamento por seção nomeada (Hoje / Saúde / Pipeline)
 *   - Whitespace generoso (melhora compreensão em testes de usuário)
 *   - Progressive disclosure (clicar pra expandir)
 *   - Tipografia hierárquica clara (heading → label → metric)
 *   - Cognitive load gerenciado por grouping + hierarchy
 */
import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import Card from '../../../components/ui/Card';
import Spinner from '../../../components/ui/Spinner';
import { formatBRL, formatBRLk } from '../../../lib/format';
import { useDashboardData } from '../shared/useDashboardData';
import '../shared/protos.css';

export default function DashboardBest() {
  const data = useDashboardData(30);
  const [showDetail, setShowDetail] = useState(false);

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
    <div className="proto-best">
      <div style={{ marginBottom: 32 }}>
        <span className="proto-banner">Protótipo D · Best Practices</span>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: '12px 0 4px', letterSpacing: '-.02em' }}>
          {data.saudacao}, {data.nome}
        </h1>
        <p style={{ fontSize: 15, color: '#64748B', margin: 0 }}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* SEÇÃO 1: 3 métricas HERO — lidas primeiro */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        <Link to="/caixa" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="hero-kpi">
            <div className="hero-label">Saldo em caixa</div>
            <div className="hero-value" style={{ color: data.saldo >= 0 ? '#0F172A' : '#DC2626' }}>
              {formatBRL(data.saldo)}
            </div>
            <div className="hero-meta">
              <span>Cobertura</span>
              <strong>{data.coberturaMeses.toFixed(1)} meses</strong>
            </div>
          </div>
        </Link>
        <Link to="/contratos" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="hero-kpi">
            <div className="hero-label">Margem média</div>
            <div className="hero-value" style={{ color: data.margem >= 20 ? '#15803D' : data.margem >= 10 ? '#A16207' : '#DC2626' }}>
              {data.margem.toFixed(1)}%
            </div>
            <div className="hero-meta">
              <span>{data.contratosAtivos} contratos ativos</span>
            </div>
          </div>
        </Link>
        <div className="hero-kpi">
          <div className="hero-label">Saúde geral</div>
          <div className="hero-value" style={{ color: data.scoreValor >= 75 ? '#15803D' : data.scoreValor >= 50 ? '#A16207' : '#DC2626' }}>
            {data.scoreValor}/100
          </div>
          <div className="hero-meta">
            <span>{data.scoreLabel}</span>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: HOJE */}
      <div className="section-title">Hoje</div>
      <div className="secondary-grid">
        <Link to="/notas-fiscais" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="secondary-tile">
            <div className="secondary-label">A receber</div>
            <div className="secondary-value" style={{ color: '#15803D' }}>{formatBRLk(data.aReceber)}</div>
          </div>
        </Link>
        <Link to="/contas-pagar" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="secondary-tile">
            <div className="secondary-label">A pagar</div>
            <div className="secondary-value" style={{ color: '#DC2626' }}>{formatBRLk(data.aPagar)}</div>
          </div>
        </Link>
        <div className="secondary-tile">
          <div className="secondary-label">Receitas (mês)</div>
          <div className="secondary-value">{formatBRLk(data.receitasMes)}</div>
        </div>
      </div>

      {/* SEÇÃO 3: FLUXO DE CAIXA */}
      <div className="section-title">Caixa — histórico & projeção</div>
      <Card style={{ padding: 24 }}>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={fluxoData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.18)" />
              <XAxis
                dataKey="data"
                fontSize={11}
                tickFormatter={(d: string) => {
                  const dt = new Date(d);
                  return Number.isNaN(dt.getTime()) ? d : `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
                }}
                minTickGap={28}
              />
              <YAxis fontSize={11} tickFormatter={(v: number) => formatBRLk(v)} width={64} />
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
              <Area type="monotone" dataKey="real" stroke="#0F172A" strokeWidth={2} fill="#0F172A" fillOpacity={0.06} connectNulls />
              <Area type="monotone" dataKey="proj" stroke="#64748B" strokeWidth={2} strokeDasharray="6 4" fillOpacity={0} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* SEÇÃO 4: Pipeline — progressive disclosure */}
      <div className="section-title">
        Pipeline de faturamento
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          style={{
            float: 'right',
            background: 'transparent',
            border: 'none',
            color: '#3B82F6',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 600,
            textTransform: 'none',
          }}
        >
          {showDetail ? '— Recolher' : '+ Detalhar'}
        </button>
      </div>
      <div className="secondary-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { l: 'Rascunho', v: data.pipeline.rascunho, c: '#94A3B8' },
          { l: 'Aguard. emissão', v: data.pipeline.aguardEmissao, c: '#A16207' },
          { l: 'NF emitida', v: data.pipeline.nfEmitida, c: '#1E40AF' },
          { l: 'Recebida', v: data.pipeline.recebida, c: '#15803D' },
        ].map((s) => (
          <div key={s.l} className="secondary-tile" style={{ borderLeft: `3px solid ${s.c}` }}>
            <div className="secondary-label">{s.l}</div>
            <div className="secondary-value" style={{ color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>
      {showDetail && (
        <div style={{ marginTop: 16, padding: 16, background: '#F8FAFC', borderRadius: 8, fontSize: 13, color: '#475569' }}>
          <strong>Como funciona:</strong> uma saída de obra começa como <em>Rascunho</em>, vira <em>Aguardando emissão</em>{' '}
          quando é aprovada, <em>NF Emitida</em> quando a fiscal sai, e <em>Recebida</em> quando o dinheiro entra no caixa.
          Total no funil: <strong>
            {data.pipeline.rascunho + data.pipeline.aguardEmissao + data.pipeline.nfEmitida + data.pipeline.recebida} NFs
          </strong>.
        </div>
      )}
    </div>
  );
}
