/**
 * Protótipo B — estilo "Procore" (enterprise denso).
 * Referência: github.com/incastil/construction-dashboard
 *
 * Vibe: strip horizontal de 6 KPIs compactos, tabela "Obras em risco" com
 * badges de cor, Recharts sóbrio. Paleta cinza/azul institucional.
 */
import { Link } from 'react-router-dom';
import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../../../components/ui/Card';
import Spinner from '../../../components/ui/Spinner';
import { formatBRL, formatBRLk } from '../../../lib/format';
import { useContracts } from '../../contracts/queries';
import { useDashboardData } from '../shared/useDashboardData';
import '../shared/protos.css';

interface ObraRisco {
  id: string;
  nome: string;
  margem: number;
  ritmo: 'low' | 'med' | 'high';
}

function calcRisco(margem: number): 'low' | 'med' | 'high' {
  if (margem >= 20) return 'low';
  if (margem >= 10) return 'med';
  return 'high';
}

export default function DashboardProcore() {
  const data = useDashboardData(30);
  const contractsQuery = useContracts();

  if (!data.ready) return <Spinner label="Carregando dashboard…" />;

  const contracts = (contractsQuery.data ?? []) as Array<{
    id: string;
    name?: string;
    margem?: number;
    status?: string;
  }>;
  const obras: ObraRisco[] = contracts
    .filter((c) => c.status === 'ativo' || !c.status)
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      nome: c.name ?? '—',
      margem: Number(c.margem) || 0,
      ritmo: calcRisco(Number(c.margem) || 0),
    }))
    .sort((a, b) => a.margem - b.margem);

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
    <div className="proto-procore">
      <div className="page-header" style={{ alignItems: 'center' }}>
        <div>
          <span className="proto-banner">Protótipo B · Procore</span>
          <h1 className="page-title" style={{ marginTop: 8 }}>Visão executiva</h1>
          <p className="page-subtitle">
            {data.saudacao}, {data.nome} · {new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>
      </div>

      <div className="strip" style={{ marginBottom: 20 }}>
        <Link to="/caixa" className="strip-cell" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="strip-label">Saldo</div>
          <div className="strip-value">{formatBRLk(data.saldo)}</div>
          <div className="strip-diff" style={{ color: data.saldo >= 0 ? '#166534' : '#991B1B' }}>
            {data.coberturaMeses.toFixed(1)}mo cobertura
          </div>
        </Link>
        <Link to="/notas-fiscais" className="strip-cell" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="strip-label">A receber</div>
          <div className="strip-value">{formatBRLk(data.aReceber)}</div>
          <div className="strip-diff" style={{ color: '#475569' }}>{data.pipeline.nfEmitida + data.pipeline.aguardEmissao} NFs</div>
        </Link>
        <Link to="/contas-pagar" className="strip-cell" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="strip-label">A pagar</div>
          <div className="strip-value">{formatBRLk(data.aPagar)}</div>
          <div className="strip-diff" style={{ color: '#475569' }}>vencendo</div>
        </Link>
        <Link to="/contratos" className="strip-cell" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="strip-label">Contratos ativos</div>
          <div className="strip-value">{data.contratosAtivos}</div>
          <div className="strip-diff" style={{ color: '#475569' }}>portfólio</div>
        </Link>
        <div className="strip-cell">
          <div className="strip-label">Margem</div>
          <div className="strip-value" style={{ color: data.margem >= 20 ? '#166534' : data.margem >= 10 ? '#92400E' : '#991B1B' }}>
            {data.margem.toFixed(1)}%
          </div>
          <div className="strip-diff" style={{ color: '#475569' }}>média ponderada</div>
        </div>
        <div className="strip-cell">
          <div className="strip-label">Saúde</div>
          <div className="strip-value" style={{ color: data.scoreValor >= 75 ? '#166534' : data.scoreValor >= 50 ? '#92400E' : '#991B1B' }}>
            {data.scoreValor}
          </div>
          <div className="strip-diff" style={{ color: '#475569' }}>{data.scoreLabel}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Obras por risco (margem)</h3>
            <span className="text-muted" style={{ fontSize: 11 }}>menor margem → maior risco</span>
          </div>
          <table className="risk">
            <thead>
              <tr>
                <th>Obra</th>
                <th style={{ textAlign: 'right' }}>Margem</th>
                <th style={{ textAlign: 'center' }}>Risco</th>
              </tr>
            </thead>
            <tbody>
              {obras.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 16, color: '#94A3B8' }}>Nenhuma obra ativa</td></tr>
              ) : (
                obras.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/contratos/${o.id}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}>
                        {o.nome}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{o.margem.toFixed(1)}%</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`risk-badge risk-${o.ritmo}`}>
                        {o.ritmo === 'low' ? 'Baixo' : o.ritmo === 'med' ? 'Médio' : 'Alto'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        <Card style={{ padding: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>Fluxo de Caixa</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fluxoData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="data"
                  fontSize={10}
                  tickFormatter={(d: string) => {
                    const dt = new Date(d);
                    return Number.isNaN(dt.getTime()) ? d : `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
                  }}
                  minTickGap={24}
                />
                <YAxis fontSize={10} tickFormatter={(v: number) => formatBRLk(v)} width={50} />
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
                <Area type="monotone" dataKey="real" stroke="#1E40AF" strokeWidth={1.6} fill="#1E40AF" fillOpacity={0.15} connectNulls />
                <Area type="monotone" dataKey="proj" stroke="#1E40AF" strokeWidth={1.6} strokeDasharray="4 3" fillOpacity={0} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
