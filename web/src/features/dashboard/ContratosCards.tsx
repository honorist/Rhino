import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import DataTable, { type Column } from '../../components/ui/DataTable';
import { formatBRL } from '../../lib/format';

const MARGEM_COLUMNS: Column<ContratoComMargem>[] = [
  {
    id: 'contrato',
    header: 'Contrato',
    cell: (c) => (
      <div>
        <Link
          to={`/contratos/${c.id}`}
          style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}
        >
          {c.name}
        </Link>
        <div className="text-muted" style={{ fontSize: 12 }}>{c.client ?? ''}</div>
      </div>
    ),
  },
  {
    id: 'gasto',
    header: 'Gasto',
    cell: (c) => <>{formatBRL(c.totalSaidas)}</>,
  },
  {
    id: 'margem',
    header: 'Margem',
    sortable: true,
    sortAccessor: (c) => Number(c.marginPct) || 0,
    cell: (c) => {
      const pct = Number(c.marginPct) || 0;
      const cor = pct < 0 ? '#DC2626' : pct < 20 ? '#D97706' : '#16A34A';
      return (
        <div>
          <span style={{ fontWeight: 700, color: cor }}>{pct.toFixed(1)}%</span>
          <div style={{ marginTop: 4, width: 80, height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(Math.abs(pct), 100)}%`, height: '100%', background: cor }} />
          </div>
        </div>
      );
    },
  },
];

export interface ContratoAVencer {
  id: string;
  name: string;
  client?: string;
  endDate: string;
  diasRestantes: number;
}

export interface ContratoComMargem {
  id: string;
  name: string;
  client?: string;
  totalSaidas: number;
  marginPct: number | string;
}

/**
 * Dois cards lado a lado: Contratos a Vencer (30d) + Contratos por Margem.
 * Porte de js/views/Dashboard.js (linhas 667-732).
 */
export default function ContratosCards({
  aVencer,
  comMargem,
}: {
  aVencer: ContratoAVencer[];
  comMargem: ContratoComMargem[];
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: 'var(--sp-lg)',
      }}
    >
      {/* Contratos a Vencer */}
      <Card style={{ padding: 'var(--sp-lg)' }}>
        <h3 style={{ margin: '0 0 var(--sp-md)', fontSize: 16 }}>
          Contratos a Vencer (30 dias)
        </h3>
        {aVencer.length === 0 ? (
          <p className="text-muted" style={{ padding: 'var(--sp-md) 0' }}>
            Nenhum contrato vence nos próximos 30 dias
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            {aVencer.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--sp-md)',
                  background:
                    c.diasRestantes <= 7
                      ? 'rgba(229,62,62,.06)'
                      : 'rgba(214,158,46,.06)',
                  borderRadius: 6,
                  borderLeft: `3px solid ${c.diasRestantes <= 7 ? '#DC2626' : '#D69E2E'}`,
                }}
              >
                <div>
                  <Link
                    to={`/contratos/${c.id}`}
                    style={{
                      fontWeight: 600,
                      color: 'var(--color-primary)',
                      textDecoration: 'none',
                    }}
                  >
                    {c.name}
                  </Link>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {c.client ?? ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: c.diasRestantes <= 7 ? '#DC2626' : '#D69E2E',
                    }}
                  >
                    {c.diasRestantes}d
                  </div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {new Date(c.endDate).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Contratos por Margem */}
      <Card style={{ padding: 'var(--sp-lg)' }}>
        <h3 style={{ margin: '0 0 var(--sp-md)', fontSize: 16 }}>
          Contratos por Margem
        </h3>
        <DataTable
          rows={comMargem}
          columns={MARGEM_COLUMNS}
          rowKey={(c) => c.id}
          emptyMessage="Nenhum contrato"
        />
      </Card>
    </div>
  );
}

