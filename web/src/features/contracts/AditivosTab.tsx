import { useCallback, useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import FormField from '../../components/ui/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/native-select';

import { DatePicker } from '../../components/ui/date-picker';
import { toast } from 'sonner';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import type { ContratoTabProps } from './ContratoDetail';
import type { Aditivo } from './types';
import { useCreateAditivo, useDeleteAditivo, useUpdateAditivo } from './queries';
import DataTable, { type Column } from '../../components/ui/DataTable';

const n = (v: unknown): number => Number(v) || 0;
const TIPO_LABEL: Record<string, string> = {
  valor: 'Valor',
  prazo: 'Prazo',
  escopo: 'Escopo',
};

function AditivoModal({
  contractId,
  aditivo,
  onClose,
}: {
  contractId: string;
  aditivo: Aditivo | null;
  onClose: () => void;
}) {
  const criar = useCreateAditivo();
  const editar = useUpdateAditivo();
  const isEdit = Boolean(aditivo);

  const [numero, setNumero] = useState(aditivo?.numero ?? '');
  const [tipo, setTipo] = useState(aditivo?.tipo ?? 'valor');
  const [descricao, setDescricao] = useState(aditivo?.descricao ?? '');
  const [valorDelta, setValorDelta] = useState(String(aditivo?.valorDelta ?? 0));
  const [diasDelta, setDiasDelta] = useState(String(aditivo?.diasDelta ?? 0));
  const [data, setData] = useState(aditivo?.data ?? '');
  const [aprovado, setAprovado] = useState(Boolean(aditivo?.aprovado));
  const pending = criar.isPending || editar.isPending;

  function submit() {
    if (!descricao.trim()) {
      toast.error('Descrição obrigatória');
      return;
    }
    const input = {
      numero: numero.trim(),
      tipo,
      descricao: descricao.trim(),
      valorDelta: n(valorDelta),
      diasDelta: n(diasDelta),
      data,
      aprovado,
    };
    const handlers = {
      onSuccess: () => {
        toast.success(isEdit ? 'Aditivo atualizado' : 'Aditivo criado');
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    };
    if (aditivo) {
      editar.mutate({ contractId, itemId: aditivo.id, input }, handlers);
    } else {
      criar.mutate({ contractId, input }, handlers);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Aditivo' : 'Novo Aditivo'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Número" htmlFor="ad-num">
                <Input
                  id="ad-num"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Tipo" htmlFor="ad-tipo">
                <Select
                  id="ad-tipo"
                  value={tipo}
                  onChange={(e) =>
                    setTipo(e.target.value as 'valor' | 'prazo' | 'escopo')
                  }
                >
                  <option value="valor">Valor</option>
                  <option value="prazo">Prazo</option>
                  <option value="escopo">Escopo</option>
                </Select>
              </FormField>
            </div>
          </div>
          <FormField label="Descrição *" htmlFor="ad-desc">
            <Textarea
              id="ad-desc"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </FormField>
          <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 110 }}>
              <FormField label="Valor Δ (R$)" htmlFor="ad-valor">
                <Input
                  id="ad-valor"
                  type="number"
                  step="0.01"
                  value={valorDelta}
                  onChange={(e) => setValorDelta(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <FormField label="Prazo Δ (dias)" htmlFor="ad-dias">
                <Input
                  id="ad-dias"
                  type="number"
                  value={diasDelta}
                  onChange={(e) => setDiasDelta(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Data" htmlFor="ad-data">
                <DatePicker
                  id="ad-data"
                  value={data}
                  onChange={(val) => setData(val)}
                />
              </FormField>
            </div>
          </div>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={aprovado}
              onChange={(e) => setAprovado(e.target.checked)}
            />
            Aprovado
          </label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Aba Aditivos do contrato. */
export default function AditivosTab({ contract }: ContratoTabProps) {
  const excluir = useDeleteAditivo();
  const [modal, setModal] = useState<{ aditivo: Aditivo | null } | null>(null);

  const aditivos = (contract.aditivos as Aditivo[] | undefined) ?? [];
  const totalValor = aditivos.reduce((s, a) => s + n(a.valorDelta), 0);
  const totalDias = aditivos.reduce((s, a) => s + n(a.diasDelta), 0);

  const handleExcluir = useCallback((a: Aditivo) => {
    if (!window.confirm('Excluir este aditivo?')) return;
    excluir.mutate(
      { contractId: contract.id, itemId: a.id },
      {
        onSuccess: () => toast.success('Aditivo excluído'),
        onError: (e) => toast.error(e.message),
      },
    );
  }, [excluir, contract.id]);

  const aditivoColumns = useMemo((): Column<Aditivo>[] => [
    { id: 'numero', header: 'Nº', cell: (a) => a.numero || '—' },
    { id: 'tipo', header: 'Tipo', cell: (a) => TIPO_LABEL[a.tipo ?? ''] ?? a.tipo },
    { id: 'descricao', header: 'Descrição', cell: (a) => a.descricao },
    {
      id: 'valor', header: 'Valor Δ', align: 'right', sortable: true,
      sortAccessor: (a) => n(a.valorDelta),
      cell: (a) => {
        const v = n(a.valorDelta);
        return (
          <span style={{ fontWeight: 700, color: v >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {v >= 0 ? '+' : ''}{formatBRL(v)}
          </span>
        );
      },
    },
    { id: 'prazo', header: 'Prazo Δ', cell: (a) => n(a.diasDelta) ? `${n(a.diasDelta)}d` : '—' },
    { id: 'data', header: 'Data', sortable: true, sortAccessor: (a) => a.data ?? '', cell: (a) => formatDateBR(a.data) },
    {
      id: 'status', header: 'Status',
      cell: (a) => (
        <Badge style={{ background: a.aprovado ? '#D1FAE5' : '#FEF3C7', color: a.aprovado ? '#065F46' : '#92400E' }}>
          {a.aprovado ? 'Aprovado' : 'Pendente'}
        </Badge>
      ),
    },
    {
      id: 'acoes', header: '', hideable: false,
      cell: (a) => (
        <div className="actions-cell" onClick={(e) => e.stopPropagation()}>
          <a className="action-link" style={{ cursor: 'pointer' }} onClick={() => setModal({ aditivo: a })}>Editar</a>
          <a className="action-link danger" style={{ cursor: 'pointer' }} onClick={() => handleExcluir(a)}>Excluir</a>
        </div>
      ),
    },
  ] as Column<Aditivo>[], [handleExcluir, setModal]);

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
        <h3 style={{ margin: 0, fontSize: 15 }}>Aditivos de Contrato</h3>
        <Button size="sm" onClick={() => setModal({ aditivo: null })}>
          + Novo Aditivo
        </Button>
      </div>
      <DataTable
        rows={aditivos}
        columns={aditivoColumns}
        rowKey={(a) => a.id}
        emptyMessage="Nenhum aditivo cadastrado."
      />
      {aditivos.length > 0 && (
        <div style={{ padding: 'var(--sp-md) var(--sp-lg)', fontWeight: 700, borderTop: '1px solid var(--color-border)', display: 'flex', gap: 24 }}>
          <span>Total aditado</span>
          <span>{formatBRL(totalValor)}</span>
          {totalDias !== 0 && <span>{totalDias > 0 ? '+' : ''}{totalDias} dias</span>}
        </div>
      )}

      {modal && (
        <AditivoModal
          contractId={contract.id}
          aditivo={modal.aditivo}
          onClose={() => setModal(null)}
        />
      )}
    </Card>
  );
}
