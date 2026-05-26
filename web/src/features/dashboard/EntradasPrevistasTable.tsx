import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import DataTable, { type Column } from '../../components/ui/DataTable';
import { formatBRL } from '../../lib/format';

interface EntradaPrevista {
  nfId: string;
  numero: string;
  contractId: string;
  contractName?: string;
  contractClient?: string;
  prazoRecebimento: number;
  valor: number;
}
interface ProjecaoDia {
  data: string;
  entradas: EntradaPrevista[];
}

interface EntradasPrevistasTableProps {
  projecaoFutura: ProjecaoDia[];
}

type EntradaRow = EntradaPrevista & { data: string };

const COLUMNS: Column<EntradaRow>[] = [
  {
    id: 'data',
    header: 'Data de Recebimento',
    sortable: true,
    sortAccessor: (e) => e.data,
    cell: (e) => {
      const diasAte = Math.floor((new Date(e.data).getTime() - Date.now()) / 86400000);
      const urgCor = diasAte <= 7 ? '#16A34A' : diasAte <= 30 ? '#3182CE' : '#64748B';
      return (
        <div>
          <strong style={{ color: urgCor }}>
            {new Date(`${e.data}T12:00:00`).toLocaleDateString('pt-BR')}
          </strong>
          <div style={{ fontSize: 12, color: '#64748B' }}>
            em {diasAte} dia{diasAte !== 1 ? 's' : ''}
          </div>
        </div>
      );
    },
  },
  {
    id: 'nf',
    header: 'NF',
    cell: (e) => <strong>NF {e.numero}</strong>,
  },
  {
    id: 'contrato',
    header: 'Contrato',
    cell: (e) => (
      <div>
        <Link
          to={`/contratos/${e.contractId}`}
          style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
        >
          {e.contractName ?? '—'}
        </Link>
        <div style={{ fontSize: 12, color: '#64748B' }}>{e.contractClient ?? ''}</div>
      </div>
    ),
  },
  {
    id: 'prazo',
    header: 'Prazo',
    cell: (e) => <>{e.prazoRecebimento}d após emissão</>,
  },
  {
    id: 'valor',
    header: 'Valor Esperado',
    align: 'right',
    sortable: true,
    sortAccessor: (e) => e.valor,
    cell: (e) => (
      <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 15 }}>
        +{formatBRL(e.valor)}
      </span>
    ),
  },
];

/**
 * Tabela "Entradas Previstas — Recebimento de NFs" — porte do bloco em
 * js/views/Dashboard.js (linhas 580-620).
 */
export default function EntradasPrevistasTable({
  projecaoFutura,
}: EntradasPrevistasTableProps) {
  if (!projecaoFutura || projecaoFutura.length === 0) return null;
  const todasEntradas = projecaoFutura.flatMap((p) =>
    p.entradas.map((e) => ({ ...e, data: p.data })),
  );

  return (
    <Card style={{ padding: 0 }}>
      <div
        style={{
          padding: 'var(--sp-md) var(--sp-lg)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>
          Entradas Previstas — Recebimento de NFs
        </h3>
      </div>
      <DataTable
        rows={todasEntradas}
        columns={COLUMNS}
        rowKey={(e) => e.nfId}
        emptyMessage="Sem entradas previstas."
      />
    </Card>
  );
}
