import { useState } from 'react';
import Button from '../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import FormField from '../../components/ui/FormField';
import { Input, Textarea } from '../../components/ui/controls';
import { DatePicker } from '../../components/ui/date-picker';
import { useToast } from '../../components/ui/toast/ToastContext';
import type { Atividade } from './types';
import { useCreateAtividade, useUpdateAtividade } from './queries';

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

interface AtividadeModalProps {
  contractId: string;
  /** Data de início do contrato — sugerida na 1ª etapa. */
  contractStartDate?: string;
  atividade: Atividade | null;
  onClose: () => void;
}

/** Modal de criação/edição de etapa do cronograma. */
export default function AtividadeModal({
  contractId,
  contractStartDate,
  atividade,
  onClose,
}: AtividadeModalProps) {
  const toast = useToast();
  const criar = useCreateAtividade(contractId);
  const editar = useUpdateAtividade(contractId);
  const isEdit = Boolean(atividade);

  const [nome, setNome] = useState(atividade?.nome ?? '');
  const [dataInicioPlan, setDataInicioPlan] = useState(
    atividade?.dataInicioPlan ?? (isEdit ? '' : contractStartDate ?? ''),
  );
  const [dataFimPlan, setDataFimPlan] = useState(atividade?.dataFimPlan ?? '');
  const [pesoPct, setPesoPct] = useState(String(atividade?.pesoPct ?? 0));
  const [execPct, setExecPct] = useState(String(atividade?.execPct ?? 0));
  const [custoPlan, setCustoPlan] = useState(String(atividade?.custoPlan ?? 0));
  const [notas, setNotas] = useState(atividade?.notas ?? '');

  const pending = criar.isPending || editar.isPending;

  function submit() {
    if (!nome.trim()) {
      toast.show('Nome da etapa é obrigatório', 'danger');
      return;
    }
    const input = {
      nome: nome.trim(),
      dataInicioPlan: dataInicioPlan || null,
      dataFimPlan: dataFimPlan || null,
      pesoPct: Number(pesoPct) || 0,
      execPct: Number(execPct) || 0,
      custoPlan: Number(custoPlan) || 0,
      notas: notas.trim(),
    };
    const handlers = {
      onSuccess: () => {
        toast.show(isEdit ? 'Etapa atualizada' : 'Etapa criada', 'success');
        onClose();
      },
      onError: (e: Error) => toast.show(e.message, 'danger'),
    };
    if (atividade) editar.mutate({ id: atividade.id, input }, handlers);
    else criar.mutate(input, handlers);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar etapa do cronograma' : 'Nova etapa do cronograma'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <FormField label="Nome da etapa *" htmlFor="at-nome">
            <Input
              id="at-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Engenharia, Aquisições, Montagem..."
            />
          </FormField>
          <Row>
            <div style={{ flex: 1, minWidth: 150 }}>
              <FormField label="Início planejado" htmlFor="at-ini">
                <DatePicker
                  id="at-ini"
                  value={dataInicioPlan ?? ''}
                  onChange={(val) => setDataInicioPlan(val)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <FormField label="Fim planejado" htmlFor="at-fim">
                <DatePicker
                  id="at-fim"
                  value={dataFimPlan ?? ''}
                  onChange={(val) => setDataFimPlan(val)}
                />
              </FormField>
            </div>
          </Row>
          <Row>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField
                label="Peso (%)"
                htmlFor="at-peso"
                helper="A soma das etapas deve dar 100%."
              >
                <Input
                  id="at-peso"
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={pesoPct}
                  onChange={(e) => setPesoPct(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="% Realizado (0-100)" htmlFor="at-exec">
                <Input
                  id="at-exec"
                  type="number"
                  step="1"
                  min={0}
                  max={100}
                  value={execPct}
                  onChange={(e) => setExecPct(e.target.value)}
                />
              </FormField>
            </div>
          </Row>
          <FormField label="Custo planejado (BRL)" htmlFor="at-custo">
            <Input
              id="at-custo"
              type="number"
              step="0.01"
              min={0}
              value={custoPlan}
              onChange={(e) => setCustoPlan(e.target.value)}
            />
          </FormField>
          <FormField label="Notas" htmlFor="at-notas">
            <Textarea
              id="at-notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
