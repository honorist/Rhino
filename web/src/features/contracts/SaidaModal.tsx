import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Select } from '../../components/ui/controls';
import { useToast } from '../../components/ui/toast/ToastContext';
import { todayISO } from '../../lib/formatDate';
import { useCreateSaida, useUpdateSaida } from './queries';

const TIPOS = [
  { value: 'mao_de_obra', label: 'Mão de Obra' },
  { value: 'material', label: 'Material' },
  { value: 'hospedagem', label: 'Hospedagem' },
  { value: 'transporte', label: 'Transporte' },
];

/** Dados de uma saída para edição. */
export interface SaidaEditavel {
  id: string;
  description: string;
  type: string;
  value: number;
  date: string;
}

interface SaidaModalProps {
  contractId: string;
  saida: SaidaEditavel | null;
  onClose: () => void;
}

/** Modal de criação/edição de saída de um contrato. */
export default function SaidaModal({
  contractId,
  saida,
  onClose,
}: SaidaModalProps) {
  const toast = useToast();
  const criar = useCreateSaida();
  const editar = useUpdateSaida();
  const isEdit = Boolean(saida);

  const [description, setDescription] = useState(saida?.description ?? '');
  const [type, setType] = useState(saida?.type ?? 'mao_de_obra');
  const [value, setValue] = useState(String(saida?.value ?? ''));
  const [date, setDate] = useState(saida?.date || todayISO());
  const [prazoRecebimento, setPrazoRecebimento] = useState('30');

  const pending = criar.isPending || editar.isPending;

  function submit() {
    if (!description.trim()) {
      toast.show('Descrição obrigatória', 'danger');
      return;
    }
    const valorNum = Number(value) || 0;
    if (valorNum <= 0) {
      toast.show('Informe um valor válido', 'danger');
      return;
    }
    const input = {
      description: description.trim(),
      type,
      value: valorNum,
      date,
      prazoRecebimento: Number(prazoRecebimento) || 30,
    };
    const handlers = {
      onSuccess: () => {
        toast.show(isEdit ? 'Saída atualizada' : 'Saída adicionada', 'success');
        onClose();
      },
      onError: (e: Error) => toast.show(e.message, 'danger'),
    };
    if (saida) editar.mutate({ id: saida.id, input }, handlers);
    else criar.mutate({ contractId, input }, handlers);
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editar Saída' : 'Nova Saída'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </>
      }
    >
      <FormField label="Descrição *" htmlFor="sd-desc">
        <Input
          id="sd-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <FormField label="Tipo *" htmlFor="sd-tipo">
            <Select
              id="sd-tipo"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <FormField label="Valor (BRL) *" htmlFor="sd-valor">
            <Input
              id="sd-valor"
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
            />
          </FormField>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="Data" htmlFor="sd-data">
            <Input
              id="sd-data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="Prazo recebimento (dias)" htmlFor="sd-prazo">
            <Input
              id="sd-prazo"
              type="number"
              min={0}
              max={365}
              value={prazoRecebimento}
              onChange={(e) => setPrazoRecebimento(e.target.value)}
            />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}
