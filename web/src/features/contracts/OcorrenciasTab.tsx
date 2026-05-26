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
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/native-select';

import { DatePicker } from '../../components/ui/date-picker';
import { toast } from 'sonner';
import { formatDateBR, todayISO } from '../../lib/formatDate';
import type { ContratoTabProps } from './ContratoDetail';
import type { Ocorrencia } from './types';
import {
  useCreateOcorrencia,
  useDeleteOcorrencia,
  useUpdateOcorrencia,
} from './queries';
import DataTable, { type Column } from '../../components/ui/DataTable';

const TIPO_LABEL: Record<string, string> = {
  geral: 'Geral',
  seguranca: 'Segurança',
  qualidade: 'Qualidade',
  prazo: 'Prazo',
  financeiro: 'Financeiro',
};
const SEV_COR: Record<string, string> = {
  baixa: '#6B7280',
  media: '#D97706',
  alta: '#DC2626',
  critica: '#7C3AED',
};

function OcorrenciaModal({
  contractId,
  ocorrencia,
  onClose,
}: {
  contractId: string;
  ocorrencia: Ocorrencia | null;
  onClose: () => void;
}) {
  const criar = useCreateOcorrencia();
  const editar = useUpdateOcorrencia();
  const isEdit = Boolean(ocorrencia);

  const [data, setData] = useState(ocorrencia?.data ?? todayISO());
  const [tipo, setTipo] = useState(ocorrencia?.tipo ?? 'geral');
  const [severidade, setSeveridade] = useState(
    ocorrencia?.severidade ?? 'media',
  );
  const [descricao, setDescricao] = useState(ocorrencia?.descricao ?? '');
  const [encerrada, setEncerrada] = useState(Boolean(ocorrencia?.encerrada));
  const pending = criar.isPending || editar.isPending;

  function submit() {
    if (!descricao.trim()) {
      toast.error('Descrição obrigatória');
      return;
    }
    const input = {
      data,
      tipo,
      severidade,
      descricao: descricao.trim(),
      encerrada,
    };
    const handlers = {
      onSuccess: () => {
        toast.success(
          isEdit ? 'Ocorrência atualizada' : 'Ocorrência registrada'
);
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    };
    if (ocorrencia) {
      editar.mutate({ contractId, itemId: ocorrencia.id, input }, handlers);
    } else {
      criar.mutate({ contractId, input }, handlers);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Ocorrência' : 'Nova Ocorrência'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Data" htmlFor="oc-data">
                <DatePicker
                  id="oc-data"
                  value={data}
                  onChange={(val) => setData(val)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <FormField label="Tipo" htmlFor="oc-tipo">
                <Select
                  id="oc-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                >
                  {Object.entries(TIPO_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <FormField label="Severidade" htmlFor="oc-sev">
                <Select
                  id="oc-sev"
                  value={severidade}
                  onChange={(e) =>
                    setSeveridade(
                      e.target.value as 'baixa' | 'media' | 'alta' | 'critica',
                    )
                  }
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </Select>
              </FormField>
            </div>
          </div>
          <FormField label="Descrição *" htmlFor="oc-desc">
            <Textarea
              id="oc-desc"
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </FormField>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={encerrada}
              onChange={(e) => setEncerrada(e.target.checked)}
            />
            Encerrada
          </label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Atualizar' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Aba Ocorrências do contrato. */
export default function OcorrenciasTab({ contract }: ContratoTabProps) {
  const excluir = useDeleteOcorrencia();
  const [modal, setModal] = useState<{ ocorrencia: Ocorrencia | null } | null>(
    null,
  );

  const ocorrencias = (contract.ocorrencias as Ocorrencia[] | undefined) ?? [];
  const abertas = ocorrencias.filter((o) => !o.encerrada).length;

  const handleExcluir = useCallback((o: Ocorrencia) => {
    if (!window.confirm('Excluir esta ocorrência?')) return;
    excluir.mutate(
      { contractId: contract.id, itemId: o.id },
      {
        onSuccess: () => toast.success('Ocorrência excluída'),
        onError: (e) => toast.error(e.message),
      },
    );
  }, [excluir, contract.id]);

  const ocorrenciaColumns = useMemo((): Column<Ocorrencia>[] => [
    { id: 'data', header: 'Data', sortable: true, sortAccessor: (o) => o.data ?? '', cell: (o) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateBR(o.data)}</span> },
    { id: 'tipo', header: 'Tipo', cell: (o) => TIPO_LABEL[o.tipo ?? ''] ?? o.tipo },
    {
      id: 'severidade', header: 'Severidade',
      cell: (o) => (
        <Badge style={{ background: `${SEV_COR[o.severidade ?? 'media']}22`, color: SEV_COR[o.severidade ?? 'media'] }}>
          {(o.severidade ?? 'media').toUpperCase()}
        </Badge>
      ),
    },
    { id: 'descricao', header: 'Descrição', cell: (o) => o.descricao },
    {
      id: 'status', header: 'Status',
      cell: (o) => o.encerrada
        ? <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Encerrada</span>
        : <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>Aberta</span>,
    },
    {
      id: 'acoes', header: '', hideable: false,
      cell: (o) => (
        <div className="actions-cell" onClick={(e) => e.stopPropagation()}>
          <a className="action-link" style={{ cursor: 'pointer' }} onClick={() => setModal({ ocorrencia: o })}>Editar</a>
          <a className="action-link danger" style={{ cursor: 'pointer' }} onClick={() => handleExcluir(o)}>Excluir</a>
        </div>
      ),
    },
  ] as Column<Ocorrencia>[], [handleExcluir, setModal]);

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
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Ocorrências</h3>
          <span
            className="text-muted"
            style={{
              fontSize: 12,
              color: abertas > 0 ? 'var(--color-danger)' : 'var(--color-success)',
            }}
          >
            {abertas > 0 ? `${abertas} aberta(s)` : 'Nenhuma aberta'}
          </span>
        </div>
        <Button size="sm" onClick={() => setModal({ ocorrencia: null })}>
          + Nova Ocorrência
        </Button>
      </div>
      <DataTable
        rows={ocorrencias}
        columns={ocorrenciaColumns}
        rowKey={(o) => o.id}
        emptyMessage="Nenhuma ocorrência registrada."
        searchPlaceholder="Buscar ocorrências..."
        globalFilterFn={(o, q) =>
          [o.descricao, TIPO_LABEL[o.tipo ?? ''] ?? o.tipo].some(
            (v) => String(v ?? '').toLowerCase().includes(q),
          )
        }
      />

      {modal && (
        <OcorrenciaModal
          contractId={contract.id}
          ocorrencia={modal.ocorrencia}
          onClose={() => setModal(null)}
        />
      )}
    </Card>
  );
}
