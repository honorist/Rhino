import { useMemo } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import { useBase, useCaixa } from '../resources';
import { useSaidas } from './queries';
import { linhasSaidas } from './financeiro';

interface DetalheComposicaoModalProps {
  contractId: string;
  /** Categoria a detalhar (chave de realizadoPorTipo). */
  tipo: string;
  tipoLabel: string;
  onClose: () => void;
}

/** Drill-down de uma categoria da composição do gasto — lista os lançamentos. */
export default function DetalheComposicaoModal({
  contractId,
  tipo,
  tipoLabel,
  onClose,
}: DetalheComposicaoModalProps) {
  const saidasQuery = useSaidas();
  const baseQuery = useBase();
  const caixaQuery = useCaixa();

  const linhas = useMemo(
    () =>
      linhasSaidas(contractId, {
        saidas: saidasQuery.data ?? [],
        base: baseQuery.data ?? [],
        caixa: caixaQuery.data ?? [],
      }).filter((l) => l.type === tipo),
    [contractId, tipo, saidasQuery.data, baseQuery.data, caixaQuery.data],
  );

  const total = linhas.reduce((s, l) => s + l.value, 0);

  return (
    <Modal
      open
      title={`${tipoLabel} — Detalhamento`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {linhas.length === 0 ? (
        <p
          className="text-muted"
          style={{ textAlign: 'center', padding: 'var(--sp-lg)' }}
        >
          📭 Nenhum lançamento encontrado para esta categoria.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Origem</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={`${l.kind}-${l.id}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {formatDateBR(l.date)}
                  </td>
                  <td>
                    <strong>{l.description}</strong>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                    {l.origem}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {formatBRL(l.value)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: 'var(--sp-md)' }}>
                  Total realizado
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    padding: 'var(--sp-md)',
                    color: 'var(--color-primary)',
                  }}
                >
                  {formatBRL(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Modal>
  );
}
