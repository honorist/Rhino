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
import { Input } from '@/components/ui/input';

import { Combobox } from '../../components/ui/combobox';
import { toast } from 'sonner';
import type { OrgMembro } from './types';
import { NIVEL_COR, NIVEL_LABEL, inferirNivelOrganograma } from './organograma';
import { useCreateMembroOrg, useUpdateMembroOrg } from './queries';

/** Recurso (funcionário) elegível para o organograma. */
export interface RecursoOrg {
  id: string;
  nome: string;
  profissao?: string;
}

interface MembroModalProps {
  contractId: string;
  membros: OrgMembro[];
  membro: OrgMembro | null;
  recursos: RecursoOrg[];
  onClose: () => void;
}

/** Modal de adição/edição de membro do organograma. */
export default function MembroModal({
  contractId,
  membros,
  membro,
  recursos,
  onClose,
}: MembroModalProps) {
  const criar = useCreateMembroOrg();
  const editar = useUpdateMembroOrg();
  const isEdit = Boolean(membro);

  const [recursoId, setRecursoId] = useState(membro?.recursoId ?? '');
  const [area, setArea] = useState(membro?.area ?? '');
  const [supervisorId, setSupervisorId] = useState(membro?.supervisorId ?? '');

  const pending = criar.isPending || editar.isPending;

  // Recursos disponíveis: funcionários ainda não no organograma (+ o do próprio membro em edição).
  const jaNoOrg = new Set(
    membros.filter((m) => m.id !== membro?.id).map((m) => m.recursoId),
  );
  const disponiveis = recursos.filter(
    (r) => !jaNoOrg.has(r.id) || r.id === membro?.recursoId,
  );

  const recurso = recursos.find((r) => r.id === recursoId);
  const nivel = recursoId
    ? inferirNivelOrganograma(recurso?.profissao)
    : 'profissional';

  // Supervisores possíveis conforme o nível.
  const encarregado = membros.find(
    (m) => m.nivel === 'encarregado' && m.id !== membro?.id,
  );
  const lideres = membros.filter(
    (m) => m.nivel === 'lider_area' && m.id !== membro?.id,
  );
  const nomeRecurso = (rid: string) =>
    recursos.find((r) => r.id === rid)?.nome ?? '(recurso)';

  function submit() {
    if (!recursoId) {
      toast.error('Selecione um recurso');
      return;
    }
    const input = {
      recursoId,
      nivel,
      cargo: recurso?.profissao ?? '',
      supervisorId: nivel === 'encarregado' ? null : supervisorId || null,
      area: nivel === 'lider_area' ? area.trim() || null : null,
    };
    const handlers = {
      onSuccess: () => {
        toast.success(isEdit ? 'Membro atualizado' : 'Membro adicionado');
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    };
    if (membro) {
      editar.mutate({ contractId, membroId: membro.id, input }, handlers);
    } else {
      criar.mutate({ contractId, input }, handlers);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Membro' : 'Adicionar Membro ao Organograma'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <FormField label="Recurso (Funcionário) *" htmlFor="mo-recurso">
            <Combobox
              id="mo-recurso"
              options={disponiveis.map((r) => ({
                value: r.id,
                label: r.nome + (r.profissao ? ` — ${r.profissao}` : ''),
              }))}
              value={recursoId}
              disabled={isEdit}
              onChange={setRecursoId}
              placeholder="— Selecione —"
              searchPlaceholder="Pesquisar recurso..."
              emptyText="Nenhum recurso disponível."
            />
          </FormField>

          <FormField label="Nível (deduzido da profissão)">
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--color-surface-2)',
                borderLeft: `3px solid ${NIVEL_COR[nivel]}`,
                fontWeight: 600,
                color: NIVEL_COR[nivel],
              }}
            >
              {recursoId ? NIVEL_LABEL[nivel] : '— (selecione um recurso)'}
            </div>
          </FormField>

          {nivel === 'lider_area' && (
            <FormField label="Área *" htmlFor="mo-area">
              <Input
                id="mo-area"
                value={area ?? ''}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Ex: Mecânica, Elétrica, Andaimes"
              />
            </FormField>
          )}

          {nivel !== 'encarregado' && (
            <FormField
              label={nivel === 'profissional' ? 'Supervisor Direto *' : 'Supervisor'}
              htmlFor="mo-sup"
            >
              <Combobox
                id="mo-sup"
                options={[
                  ...(nivel === 'lider_area' && encarregado
                    ? [{ value: encarregado.id, label: `${nomeRecurso(encarregado.recursoId)} (Encarregado)` }]
                    : []),
                  ...(nivel === 'profissional'
                    ? lideres.map((l) => ({
                        value: l.id,
                        label: nomeRecurso(l.recursoId) + (l.area ? ` — ${l.area}` : ''),
                      }))
                    : []),
                ]}
                value={supervisorId ?? ''}
                onChange={setSupervisorId}
                placeholder="— Selecione —"
                searchPlaceholder="Pesquisar supervisor..."
                emptyText="Nenhum supervisor disponível."
              />
            </FormField>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
