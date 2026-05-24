import { useMemo } from 'react';
import Card from '../../components/ui/Card';
import { formatBRL } from '../../lib/format';
import { formatDateBR, todayISO } from '../../lib/formatDate';
import { useContasPagar } from '../resources';
import type { ContratoTabProps } from './ContratoDetail';

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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Observações</th>
              <th>Vencimento</th>
              <th style={{ textAlign: 'right' }}>Valor Previsto</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {passagens.map((c, i) => {
              const venc = String(c.dataVencimento ?? '');
              const vencido = venc && venc < hoje;
              return (
                <tr key={String(c.id ?? i)}>
                  <td>
                    <strong>{String(c.descricao ?? '—')}</strong>
                  </td>
                  <td className="text-muted">
                    {String(c.observacoes ?? '—')}
                  </td>
                  <td>{formatDateBR(venc)}</td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      color: '#7C3AED',
                    }}
                  >
                    {formatBRL(n(c.valor))}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: vencido ? '#FEE2E2' : '#EDE9FE',
                        color: vencido ? '#991B1B' : '#5B21B6',
                      }}
                    >
                      {vencido ? '⚠ Vencida' : '⏳ Pendente'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={3} style={{ padding: 'var(--sp-md)' }}>
                Total previsto em passagens
              </td>
              <td
                style={{
                  textAlign: 'right',
                  padding: 'var(--sp-md)',
                  color: '#7C3AED',
                }}
              >
                {formatBRL(total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
