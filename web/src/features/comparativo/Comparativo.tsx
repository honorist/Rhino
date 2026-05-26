import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Spinner from '../../components/ui/Spinner';
import { formatBRL } from '../../lib/format';
import { useBase, useCaixa, useNotasFiscais, useRecursos } from '../resources';
import { useContracts, useSaidas } from '../contracts/queries';
import { calcMetrics, type ComparativoMetrics } from './metrics';

type Filtro = 'ativos' | 'concluidos' | 'todos';

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

  const columns = useMemo((): Column<ComparativoMetrics>[] => [
    {
      id: 'nome',
      header: 'Contrato',
      sortable: true,
      sortAccessor: (m) => m.nome,
      cell: (m) => (
        <>
          <strong>{m.nome}</strong>
          {m.contractNumber && (
            <div className="text-muted" style={{ fontSize: 12 }}>
              #{m.contractNumber}
            </div>
          )}
        </>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      sortable: true,
      sortAccessor: (m) => m.cliente ?? '',
      cell: (m) => m.cliente || '—',
    },
    {
      id: 'valor',
      header: 'Valor',
      align: 'right',
      sortable: true,
      sortAccessor: (m) => m.valor,
      cell: (m) => <span style={{ fontWeight: 600 }}>{formatBRL(m.valor)}</span>,
    },
    {
      id: 'pctMedido',
      header: '% Medido',
      align: 'right',
      sortable: true,
      sortAccessor: (m) => m.pctMedido,
      cell: (m) => (
        <span style={{ color: corPct(m.pctMedido, 100) }}>
          {m.pctMedido.toFixed(1)}%
        </span>
      ),
    },
    {
      id: 'pctMargem',
      header: '% Margem',
      align: 'right',
      sortable: true,
      sortAccessor: (m) => m.pctMargem,
      cell: (m) => (
        <span style={{ fontWeight: 700, color: corPct(m.pctMargem, 20) }}>
          {m.pctMargem.toFixed(1)}%
        </span>
      ),
    },
    {
      id: 'margemReais',
      header: 'Margem R$',
      align: 'right',
      sortable: true,
      sortAccessor: (m) => m.margemReais,
      cell: (m) => (
        <span
          style={{
            color:
              m.margemReais >= 0
                ? 'var(--color-success)'
                : 'var(--color-danger)',
          }}
        >
          {formatBRL(m.margemReais)}
        </span>
      ),
    },
    {
      id: 'desvioOrcado',
      header: 'Desvio Orç.',
      align: 'right',
      sortable: true,
      sortAccessor: (m) => m.desvioOrcado,
      cell: (m) =>
        m.orcado > 0
          ? `${m.desvioOrcado >= 0 ? '+' : ''}${m.desvioOrcado.toFixed(1)}%`
          : '—',
    },
    {
      id: 'atrasoDias',
      header: 'Atraso',
      align: 'right',
      sortable: true,
      sortAccessor: (m) => m.atrasoDias,
      cell: (m) =>
        m.atrasoDias === 0 ? (
          '—'
        ) : (
          <span
            style={{
              color:
                m.atrasoDias > 0
                  ? 'var(--color-danger)'
                  : 'var(--color-success)',
            }}
          >
            {`${m.atrasoDias > 0 ? '+' : ''}${m.atrasoDias}d`}
          </span>
        ),
    },
    {
      id: 'equipeAtual',
      header: 'Equipe',
      align: 'right',
      sortable: true,
      sortAccessor: (m) => m.equipeAtual,
      cell: (m) => m.equipeAtual,
    },
    {
      id: 'rdosUltimos30',
      header: 'RDOs 30d',
      align: 'right',
      sortable: true,
      sortAccessor: (m) => m.rdosUltimos30,
      cell: (m) => m.rdosUltimos30,
    },
  ], []);

  const handleRowClick = useCallback(
    (m: ComparativoMetrics) => navigate(`/contratos/${m.id}`),
    [navigate],
  );

  if (contractsQuery.isLoading) {
    return <Spinner label="Carregando..." />;
  }

  const totalValor = metrics.reduce((s, m) => s + m.valor, 0);
  const totalCusto = metrics.reduce((s, m) => s + m.totalCusto, 0);
  const totalMedido = metrics.reduce((s, m) => s + m.totalMedido, 0);
  const totalMargem = totalMedido - totalCusto;
  const pctMargemAg = totalValor > 0 ? (totalMargem / totalValor) * 100 : 0;

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

      <DataTable
        rows={metrics}
        columns={columns}
        rowKey={(m) => m.id}
        onRowClick={handleRowClick}
        emptyMessage="Nenhum contrato no filtro selecionado."
      />
    </>
  );
}
