import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Select, Textarea } from '../../components/ui/controls';
import { useToast } from '../../components/ui/toast/ToastContext';
import type { BudgetItem } from './types';
import { useCreateBudgetItem, useUpdateBudgetItem } from './queries';

const TIPOS = [
  { value: 'mao_de_obra', label: 'Mão de Obra' },
  { value: 'material', label: 'Material' },
  { value: 'hospedagem', label: 'Hospedagem' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'base', label: 'Custo BASE' },
  { value: 'outros', label: 'Outros' },
];

interface OrcamentoModalProps {
  contractId: string;
  item: BudgetItem | null;
  onClose: () => void;
}

/** Modal de criação/edição de item de orçamento. */
export default function OrcamentoModal({
  contractId,
  item,
  onClose,
}: OrcamentoModalProps) {
  const toast = useToast();
  const criar = useCreateBudgetItem();
  const editar = useUpdateBudgetItem();
  const isEdit = Boolean(item);

  const [description, setDescription] = useState(item?.description ?? '');
  const [type, setType] = useState(item?.type ?? 'mao_de_obra');
  const [value, setValue] = useState(String(item?.value ?? ''));
  const [notes, setNotes] = useState(item?.notes ?? '');

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
      notes: notes.trim(),
    };
    const handlers = {
      onSuccess: () => {
        toast.show(isEdit ? 'Item atualizado' : 'Item adicionado', 'success');
        onClose();
      },
      onError: (e: Error) => toast.show(e.message, 'danger'),
    };
    if (item?.id) {
      editar.mutate({ contractId, budgetId: item.id, input }, handlers);
    } else {
      criar.mutate({ contractId, input }, handlers);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editar Item do Orçamento' : 'Novo Item do Orçamento'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Atualizar' : 'Adicionar'}
          </Button>
        </>
      }
    >
      <FormField label="Descrição *" htmlFor="orc-desc">
        <Input
          id="orc-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: Equipe de campo, aço, diárias..."
        />
      </FormField>
      <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <FormField label="Categoria *" htmlFor="orc-tipo">
            <Select
              id="orc-tipo"
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
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="Valor Orçado (BRL) *" htmlFor="orc-valor">
            <Input
              id="orc-valor"
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
            />
          </FormField>
        </div>
      </div>
      <FormField label="Observações" htmlFor="orc-notes">
        <Textarea
          id="orc-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Detalhes adicionais..."
        />
      </FormField>
    </Modal>
  );
}
