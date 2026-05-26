import { useMemo } from 'react';
import Button from '../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import { useBase, useCaixa } from '../resources';
import { useSaidas } from './queries';
import { linhasSaidas, type LinhaSaida } from './financeiro';
import DataTable, { type Column } from '../../components/ui/DataTable';

const COLUMNS: Column<LinhaSaida>[] = [
  {
    header: 'Data',
    cell: (l) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateBR(l.date)}</span>,
  },
  {
    header: 'Descrição',
    cell: (l) => <strong>{l.description}</strong>,
  },
  {
    header: 'Origem',
    cell: (l) => (
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{l.origem}</span>
    ),
  },
  {
    header: 'Valor',
    align: 'right',
    cell: (l) => <span style={{ fontWeight: 700 }}>{formatBRL(l.value)}</span>,
  },
];

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
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{tipoLabel} — Detalhamento</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6">
          <DataTable
            columns={COLUMNS}
            rows={linhas}
            rowKey={(l) => `${l.kind}-${l.id}`}
            emptyMessage="Nenhum lançamento encontrado para esta categoria."
          />
          {linhas.length > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: 'var(--sp-md)',
                fontWeight: 700,
                borderTop: '1px solid var(--color-border)',
                marginTop: 4,
              }}
            >
              <span>Total realizado</span>
              <span style={{ color: 'var(--color-primary)' }}>{formatBRL(total)}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
