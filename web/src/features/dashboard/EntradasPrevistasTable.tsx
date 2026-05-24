import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
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
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={th()}>Data de Recebimento</th>
              <th style={th()}>NF</th>
              <th style={th()}>Contrato</th>
              <th style={th()}>Prazo</th>
              <th style={{ ...th(), textAlign: 'right' }}>Valor Esperado</th>
            </tr>
          </thead>
          <tbody>
            {todasEntradas.map((e) => {
              const diasAte = Math.floor(
                (new Date(e.data).getTime() - Date.now()) / 86400000,
              );
              const urgCor =
                diasAte <= 7
                  ? '#16A34A'
                  : diasAte <= 30
                    ? '#3182CE'
                    : '#64748B';
              return (
                <tr
                  key={e.nfId}
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <td style={td()}>
                    <strong style={{ color: urgCor }}>
                      {new Date(e.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </strong>
                    <div style={{ fontSize: 12, color: '#64748B' }}>
                      em {diasAte} dia{diasAte !== 1 ? 's' : ''}
                    </div>
                  </td>
                  <td style={td()}>
                    <strong>NF {e.numero}</strong>
                  </td>
                  <td style={td()}>
                    <Link
                      to={`/contratos/${e.contractId}`}
                      style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                    >
                      {e.contractName ?? '—'}
                    </Link>
                    <div style={{ fontSize: 12, color: '#64748B' }}>
                      {e.contractClient ?? ''}
                    </div>
                  </td>
                  <td style={td()}>{e.prazoRecebimento}d após emissão</td>
                  <td
                    style={{
                      ...td(),
                      textAlign: 'right',
                      fontWeight: 700,
                      color: '#16A34A',
                      fontSize: 15,
                    }}
                  >
                    +{formatBRL(e.valor)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const th = (): React.CSSProperties => ({
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  color: '#64748B',
});

const td = (): React.CSSProperties => ({
  padding: '10px 12px',
  verticalAlign: 'top',
});
