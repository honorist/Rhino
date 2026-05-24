import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { formatBRL } from '../../lib/format';
import { useBase, useCaixa, useNotasFiscais, useRecursos } from '../resources';
import { useContracts, useSaidas } from '../contracts/queries';
import { calcMetrics, type ComparativoMetrics } from './metrics';

type SortKey = keyof Pick<
  ComparativoMetrics,
  | 'nome'
  | 'cliente'
  | 'valor'
  | 'pctMedido'
  | 'pctMargem'
  | 'margemReais'
  | 'desvioOrcado'
  | 'atrasoDias'
  | 'equipeAtual'
  | 'rdosUltimos30'
>;
type Filtro = 'ativos' | 'concluidos' | 'todos';

const COLUNAS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: 'nome', label: 'Contrato' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'valor', label: 'Valor', right: true },
  { key: 'pctMedido', label: '% Medido', right: true },
  { key: 'pctMargem', label: '% Margem', right: true },
  { key: 'margemReais', label: 'Margem R$', right: true },
  { key: 'desvioOrcado', label: 'Desvio Orç.', right: true },
  { key: 'atrasoDias', label: 'Atraso', right: true },
  { key: 'equipeAtual', label: 'Equipe', right: true },
  { key: 'rdosUltimos30', label: 'RDOs 30d', right: true },
];

function corPct(p: number, ref: number): string {
  if (p >= ref) return 'var(--color-success)';
  if (p >= 0) return '#F59E0B';
  return 'var(--color-danger)';
}

/** Comparativo de Contratos — ranking ordenável (porte de Comparativo.js). */
export default function Comparativo() {
  const navigate = useNavigate();
  const contractsQuery = useContracts();
  const saidasQuery = useSaidas();
  const baseQuery = useBase();
  const caixaQuery = useCaixa();
  const nfsQuery = useNotasFiscais();
  const recursosQuery = useRecursos();

  const [sortBy, setSortBy] = useState<SortKey>('margemReais');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filtro, setFiltro] = useState<Filtro>('ativos');

  const metrics = useMemo(() => {
    const contratos = (contractsQuery.data ?? []).filter((c) => {
      if (filtro === 'ativos') return c.status === 'ativo';
      if (filtro === 'concluidos') return c.status === 'concluido';
      return true;
    });
    const input = {
      saidas: saidasQuery.data ?? [],
      base: baseQuery.data ?? [],
      caixa: caixaQuery.data ?? [],
      notasFiscais: nfsQuery.data ?? [],
      recursos: recursosQuery.data ?? [],
    };
    return contratos.map((c) => calcMetrics(c, input));
  }, [
    contractsQuery.data,
    saidasQuery.data,
    baseQuery.data,
    caixaQuery.data,
    nfsQuery.data,
    recursosQuery.data,
    filtro,
  ]);

  if (contractsQuery.isLoading) {
    return <Spinner label="Carregando..." />;
  }

  const ordenados = [...metrics].sort((a, b) => {
    const va = a[sortBy];
    const vb = b[sortBy];
    const dir = sortDir === 'asc' ? 1 : -1;
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb) * dir;
    }
    return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
  });

  const totalValor = metrics.reduce((s, m) => s + m.valor, 0);
  const totalCusto = metrics.reduce((s, m) => s + m.totalCusto, 0);
  const totalMedido = metrics.reduce((s, m) => s + m.totalMedido, 0);
  const totalMargem = totalMedido - totalCusto;
  const pctMargemAg = totalValor > 0 ? (totalMargem / totalValor) * 100 : 0;

  function ordenarPor(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  }
  const seta = (key: SortKey) =>
    sortBy !== key ? ' ↕' : sortDir === 'asc' ? ' ↑' : ' ↓';

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Comparativo de Contratos</h1>
          <p className="page-subtitle">
            Ranking por margem, atraso, execução — clique nas colunas para
            ordenar
          </p>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--sp-lg)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            {
              l: 'Total em contratos',
              v: formatBRL(totalValor),
              c: 'var(--color-primary)',
              s: `${metrics.length} contrato(s)`,
            },
            {
              l: 'Total medido (BMs)',
              v: formatBRL(totalMedido),
              c: 'var(--color-success)',
            },
            { l: 'Total custo', v: formatBRL(totalCusto), c: '#F59E0B' },
            {
              l: 'Margem agregada',
              v: formatBRL(totalMargem),
              c: corPct(pctMargemAg, 20),
              s: `${pctMargemAg.toFixed(1)}% (meta ≥20%)`,
            },
          ].map((kpi, i) => (
            <div
              key={i}
              style={{
                padding: 'var(--sp-lg)',
                borderRight:
                  i < 3 ? '1px solid var(--color-border)' : undefined,
                borderTop: `3px solid ${kpi.c}`,
              }}
            >
              <div className="text-muted" style={{ fontSize: 13 }}>
                {kpi.l}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: kpi.c }}>
                {kpi.v}
              </div>
              {kpi.s && (
                <div className="text-muted" style={{ fontSize: 13 }}>
                  {kpi.s}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--sp-md)' }}>
        {(['ativos', 'concluidos', 'todos'] as Filtro[]).map((f) => (
          <Button
            key={f}
            variant={filtro === f ? 'primary' : 'secondary'}
            onClick={() => setFiltro(f)}
          >
            {f === 'ativos' ? 'Ativos' : f === 'concluidos' ? 'Concluídos' : 'Todos'}
          </Button>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {COLUNAS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => ordenarPor(col.key)}
                    style={{
                      cursor: 'pointer',
                      textAlign: col.right ? 'right' : 'left',
                      userSelect: 'none',
                    }}
                  >
                    {col.label}
                    {seta(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenados.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUNAS.length}
                    className="text-muted"
                    style={{ textAlign: 'center', padding: 'var(--sp-xl)' }}
                  >
                    Nenhum contrato no filtro selecionado.
                  </td>
                </tr>
              ) : (
                ordenados.map((m) => (
                  <tr
                    key={m.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/contratos/${m.id}`)}
                  >
                    <td>
                      <strong>{m.nome}</strong>
                      {m.contractNumber && (
                        <div className="text-muted" style={{ fontSize: 12 }}>
                          #{m.contractNumber}
                        </div>
                      )}
                    </td>
                    <td>{m.cliente || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatBRL(m.valor)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        color: corPct(m.pctMedido, 100),
                      }}
                    >
                      {m.pctMedido.toFixed(1)}%
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: corPct(m.pctMargem, 20),
                      }}
                    >
                      {m.pctMargem.toFixed(1)}%
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        color:
                          m.margemReais >= 0
                            ? 'var(--color-success)'
                            : 'var(--color-danger)',
                      }}
                    >
                      {formatBRL(m.margemReais)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {m.orcado > 0
                        ? `${m.desvioOrcado >= 0 ? '+' : ''}${m.desvioOrcado.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        color:
                          m.atrasoDias > 0
                            ? 'var(--color-danger)'
                            : 'var(--color-success)',
                      }}
                    >
                      {m.atrasoDias === 0
                        ? '—'
                        : `${m.atrasoDias > 0 ? '+' : ''}${m.atrasoDias}d`}
                    </td>
                    <td style={{ textAlign: 'right' }}>{m.equipeAtual}</td>
                    <td style={{ textAlign: 'right' }}>{m.rdosUltimos30}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
