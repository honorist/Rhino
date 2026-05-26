import { useMemo } from 'react';
import Card from '../../components/ui/Card';
import { Badge } from '../../components/ui/badge';
import { formatBRL } from '../../lib/format';
import { formatDateBR, todayISO } from '../../lib/formatDate';
import { useContasPagar } from '../resources';
import type { ContratoTabProps } from './ContratoDetail';
import DataTable, { type Column } from '../../components/ui/DataTable';

type Registro = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;

/**
 * Aba Pendências do contrato — passagens pendentes (contas a pagar com
 * categoria "passagem" e status "pendente" vinculadas ao contrato).
 */
export default function PendenciasTab({ contract }: ContratoTabProps) {
  const contasQuery = useContasPagar();
  const hoje = todayISO();

  const passagens = useMemo(() => {
    return ((contasQuery.data ?? []) as unknown[])
      .map((c) => c as Registro)
      .filter(
        (c) =>
          c.contractId === contract.id &&
          c.category === 'passagem' &&
          c.status === 'pendente',
      )
      .sort((a, b) =>
        String(a.dataVencimento ?? '').localeCompare(
          String(b.dataVencimento ?? ''),
        ),
      );
  }, [contasQuery.data, contract.id]);

  const total = passagens.reduce((s, c) => s + n(c.valor), 0);

  const passagemColumns = useMemo((): Column<Registro>[] => [
    { id: 'colaborador', header: 'Colaborador', cell: (c) => <strong>{String(c.descricao ?? '—')}</strong> },
    { id: 'obs', header: 'Observações', cell: (c) => <span className="text-muted">{String(c.observacoes ?? '—')}</span> },
    { id: 'vencimento', header: 'Vencimento', sortable: true, sortAccessor: (c) => String(c.dataVencimento ?? ''), cell: (c) => formatDateBR(String(c.dataVencimento ?? '')) },
    {
      id: 'valor', header: 'Valor Previsto', align: 'right', sortable: true,
      sortAccessor: (c) => n(c.valor),
      cell: (c) => <span style={{ fontWeight: 700, color: '#7C3AED' }}>{formatBRL(n(c.valor))}</span>,
    },
    {
      id: 'status', header: 'Status',
      cell: (c) => {
        const venc = String(c.dataVencimento ?? '');
        const vencido = venc && venc < hoje;
        return (
          <Badge style={{ background: vencido ? '#FEE2E2' : '#EDE9FE', color: vencido ? '#991B1B' : '#5B21B6' }}>
            {vencido ? '⚠ Vencida' : '⏳ Pendente'}
          </Badge>
        );
      },
    },
  ] as Column<Registro>[], [hoje]);

  if (passagens.length === 0) {
    return (
      <Card style={{ padding: 'var(--sp-2xl)', textAlign: 'center' }}>
        <div style={{ fontSize: 38, opacity: 0.5 }}>✓</div>
        <div style={{ fontWeight: 600, marginTop: 8 }}>Nenhuma pendência</div>
        <div className="text-muted" style={{ fontSize: 13 }}>
          Este contrato não possui passagens pendentes no momento.
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--sp-md) var(--sp-lg)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>
          ✈ Previsão de Desembolso — Passagens Pendentes
        </h3>
        <strong style={{ color: '#7C3AED' }}>{formatBRL(total)}</strong>
      </div>
      <DataTable
        rows={passagens}
        columns={passagemColumns}
        rowKey={(c) => String(c.id ?? Math.random())}
        emptyMessage="Nenhuma passagem pendente."
      />
      <div style={{ padding: 'var(--sp-md) var(--sp-lg)', fontWeight: 700, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Total previsto em passagens</span>
        <span style={{ color: '#7C3AED' }}>{formatBRL(total)}</span>
      </div>
    </Card>
  );
}
