import { useState, type ReactNode } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '../../components/ui/date-picker';
import { Combobox } from '../../components/ui/combobox';
import { toast } from 'sonner';
import { formatBRL } from '../../lib/format';
import { formatDateBR, todayISO } from '../../lib/formatDate';
import { useContracts } from '../contracts/queries';
import { useCreateManutencao, useUpdateManutencao } from '../resources';
import type { Manutencao } from '../../types/domain';
import {
  useAprovarManutencao,
  useAvaliarManutencao,
  useRejeitarManutencao,
  useRetornoManutencao,
} from './queries';

/** Parágrafo de subtítulo padrão dos modais. */
function ModalSub({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: '0 0 var(--sp-md)',
        fontSize: 13,
        color: 'var(--color-text-muted)',
      }}
    >
      {children}
    </p>
  );
}

/** Linha de duas colunas (porte de `.form-row`). */
function Row({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

// ── 1ª etapa: solicitar / editar ──────────────────────────────────────────

interface NovaModalProps {
  manutencao: Manutencao | null;
  onClose: () => void;
}

/** Modal de solicitação (ou edição) de manutenção. */
export function NovaManutencaoModal({ manutencao, onClose }: NovaModalProps) {
  const criar = useCreateManutencao();
  const editar = useUpdateManutencao();
  const contractsQuery = useContracts();
  const isEdit = Boolean(manutencao);

  const [equipamento, setEquipamento] = useState(manutencao?.equipamento ?? '');
  const [problema, setProblema] = useState(manutencao?.problema ?? '');
  const [contractId, setContractId] = useState(manutencao?.contractId ?? '');
  const [observacoes, setObservacoes] = useState(manutencao?.observacoes ?? '');

  const contratos = (contractsQuery.data ?? []).filter(
    (c) => c.status === 'ativo' || c.status === 'pausado',
  );
  const pending = criar.isPending || editar.isPending;

  function submit() {
    const eq = equipamento.trim();
    if (!eq) {
      toast.error('Informe o equipamento');
      return;
    }
    const input = {
      equipamento: eq,
      problema: problema.trim(),
      contractId: contractId || null,
      observacoes: observacoes.trim(),
    };
    const handlers = {
      onSuccess: () => {
        toast.success(
          isEdit ? 'Solicitação atualizada' : 'Manutenção solicitada'
);
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    };
    if (manutencao) editar.mutate({ id: manutencao.id, input }, handlers);
    else criar.mutate(input, handlers);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Solicitação' : 'Solicitar Manutenção'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <ModalSub>
            A equipe de compras vai definir oficina, prazo e custo.
          </ModalSub>
          <FormField label="Equipamento *" htmlFor="man-equip">
            <Input
              id="man-equip"
              value={equipamento}
              onChange={(e) => setEquipamento(e.target.value)}
              placeholder="Ex: Máquina de solda Bambozzi"
              required
            />
          </FormField>
          <FormField label="Problema / defeito relatado" htmlFor="man-prob">
            <Textarea
              id="man-prob"
              rows={2}
              value={problema}
              onChange={(e) => setProblema(e.target.value)}
              placeholder="O que está acontecendo com o equipamento?"
            />
          </FormField>
          <FormField label="Origem do equipamento" htmlFor="man-origem">
            <Combobox
              id="man-origem"
              options={[
                { value: '', label: '🏢 Sede' },
                ...contratos.map((c) => ({ value: c.id, label: `🏗️ ${String(c.name ?? '')}` })),
              ]}
              value={contractId ?? ''}
              onChange={setContractId}
              placeholder="🏢 Sede"
              searchPlaceholder="Pesquisar obra..."
              emptyText="Nenhuma obra encontrada."
            />
          </FormField>
          <FormField label="Observações" htmlFor="man-obs">
            <Textarea
              id="man-obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas adicionais (opcional)"
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Enviar solicitação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 2ª etapa: equipe de compras avalia ────────────────────────────────────

interface ModalProps {
  manutencao: Manutencao;
  onClose: () => void;
  nomeOrigem: string;
}

/** Modal de avaliação — define oficina, prazo e custo. */
export function AvaliarModal({ manutencao, onClose, nomeOrigem }: ModalProps) {
  const avaliar = useAvaliarManutencao();

  const [oficina, setOficina] = useState(manutencao.oficina ?? '');
  const [custoEstimado, setCustoEstimado] = useState(
    String(manutencao.custoEstimado ?? ''),
  );
  const [dataEnvio, setDataEnvio] = useState(
    manutencao.dataEnvio ? manutencao.dataEnvio.slice(0, 10) : todayISO(),
  );
  const [dataRetornoPrevista, setDataRetornoPrevista] = useState(
    manutencao.dataRetornoPrevista
      ? manutencao.dataRetornoPrevista.slice(0, 10)
      : '',
  );
  const [observacoes, setObservacoes] = useState(manutencao.observacoes ?? '');

  function submit() {
    const of = oficina.trim();
    if (!of) {
      toast.error('Informe a oficina / empresa');
      return;
    }
    avaliar.mutate(
      {
        id: manutencao.id,
        input: {
          oficina: of,
          custoEstimado: Number(custoEstimado) || 0,
          dataEnvio: dataEnvio || null,
          dataRetornoPrevista: dataRetornoPrevista || null,
          observacoes: observacoes.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success('Avaliação enviada para aprovação');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Avaliar Manutenção</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <ModalSub>
            Defina oficina, prazo e custo para a aprovação gerencial.
          </ModalSub>
          <div
            style={{
              background: 'var(--color-bg)',
              borderRadius: 6,
              padding: 'var(--sp-sm) var(--sp-md)',
              marginBottom: 'var(--sp-md)',
              fontSize: 14,
            }}
          >
            <strong>{manutencao.equipamento}</strong>
            {manutencao.problema && (
              <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                {manutencao.problema}
              </div>
            )}
            <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
              Origem: {nomeOrigem}
            </div>
          </div>
          <FormField label="Oficina / empresa que vai reparar *" htmlFor="av-of">
            <Input
              id="av-of"
              value={oficina}
              onChange={(e) => setOficina(e.target.value)}
              placeholder="Quem vai consertar"
              required
            />
          </FormField>
          <Row>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FormField label="Custo estimado (R$)" htmlFor="av-custo">
                <Input
                  id="av-custo"
                  type="number"
                  step="0.01"
                  min={0}
                  value={custoEstimado}
                  onChange={(e) => setCustoEstimado(e.target.value)}
                  placeholder="0,00"
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FormField label="Data de envio" htmlFor="av-envio">
                <DatePicker
                  id="av-envio"
                  value={dataEnvio}
                  onChange={(val) => setDataEnvio(val)}
                />
              </FormField>
            </div>
          </Row>
          <FormField label="Previsão de retorno" htmlFor="av-prev">
            <DatePicker
              id="av-prev"
              value={dataRetornoPrevista}
              onChange={(val) => setDataRetornoPrevista(val)}
            />
          </FormField>
          <FormField label="Observações da avaliação" htmlFor="av-obs">
            <Textarea
              id="av-obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Diagnóstico, garantia, prazo combinado..."
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={avaliar.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={avaliar.isPending}>
            {avaliar.isPending ? 'Salvando…' : 'Enviar para aprovação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 3ª etapa: gerência aprova / rejeita ───────────────────────────────────

/** Linha rótulo/valor do resumo de aprovação. */
function ResumoLinha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        borderBottom: '1px solid var(--color-border)',
        fontSize: 14,
      }}
    >
      <span style={{ color: 'var(--color-text-muted)' }}>{rotulo}</span>
      <strong>{valor}</strong>
    </div>
  );
}

/** Modal de aprovação — aprovar direto ou rejeitar com motivo. */
export function AprovarModal({ manutencao, onClose }: ModalProps) {
  const aprovar = useAprovarManutencao();
  const rejeitar = useRejeitarManutencao();
  const [motivo, setMotivo] = useState('');
  const pending = aprovar.isPending || rejeitar.isPending;

  function handleAprovar() {
    aprovar.mutate(manutencao.id, {
      onSuccess: () => {
        toast.success('Manutenção aprovada');
        onClose();
      },
      onError: (e) => toast.error(e.message),
    });
  }

  function handleRejeitar() {
    if (!window.confirm('Rejeitar esta solicitação de manutenção?')) return;
    rejeitar.mutate(
      { id: manutencao.id, motivo: motivo.trim() },
      {
        onSuccess: () => {
          toast.success('Manutenção rejeitada');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Aprovar Manutenção</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <ModalSub>Pré-avaliada pela equipe de compras.</ModalSub>
          <div style={{ marginBottom: 'var(--sp-md)' }}>
            <ResumoLinha rotulo="Equipamento" valor={manutencao.equipamento} />
            {manutencao.problema && (
              <ResumoLinha rotulo="Problema" valor={manutencao.problema} />
            )}
            <ResumoLinha rotulo="Oficina" valor={manutencao.oficina || '—'} />
            <ResumoLinha
              rotulo="Custo estimado"
              valor={formatBRL(Number(manutencao.custoEstimado) || 0)}
            />
            <ResumoLinha rotulo="Envio" valor={formatDateBR(manutencao.dataEnvio)} />
            <ResumoLinha
              rotulo="Previsão de retorno"
              valor={formatDateBR(manutencao.dataRetornoPrevista)}
            />
            {manutencao.avaliadorNome && (
              <ResumoLinha rotulo="Avaliado por" valor={manutencao.avaliadorNome} />
            )}
          </div>
          <FormField
            label="Motivo (preencha apenas se for rejeitar)"
            htmlFor="ap-motivo"
          >
            <Textarea
              id="ap-motivo"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo da rejeição..."
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleRejeitar} disabled={pending}>
            {rejeitar.isPending ? 'Rejeitando…' : 'Rejeitar'}
          </Button>
          <Button onClick={handleAprovar} disabled={pending}>
            {aprovar.isPending ? 'Aprovando…' : 'Aprovar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Encerramento: registrar retorno ───────────────────────────────────────

/** Modal de registro do retorno do equipamento. */
export function RetornoModal({ manutencao, onClose }: ModalProps) {
  const retorno = useRetornoManutencao();

  const [dataRetorno, setDataRetorno] = useState(todayISO());
  const [custo, setCusto] = useState(String(manutencao.custoEstimado ?? ''));
  const [observacoes, setObservacoes] = useState(manutencao.observacoes ?? '');

  function submit() {
    if (!dataRetorno) {
      toast.error('Informe a data de retorno');
      return;
    }
    retorno.mutate(
      {
        id: manutencao.id,
        input: {
          dataRetorno,
          custo: Number(custo) || 0,
          observacoes: observacoes.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success('Retorno registrado');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Registrar Retorno</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <ModalSub>
            {manutencao.equipamento} · oficina: {manutencao.oficina || '—'}
          </ModalSub>
          <Row>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FormField label="Data de retorno *" htmlFor="rt-data">
                <DatePicker
                  id="rt-data"
                  value={dataRetorno}
                  onChange={(val) => setDataRetorno(val)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FormField label="Custo final (R$)" htmlFor="rt-custo">
                <Input
                  id="rt-custo"
                  type="number"
                  step="0.01"
                  min={0}
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                  placeholder="0,00"
                />
              </FormField>
            </div>
          </Row>
          <FormField label="Observações do retorno" htmlFor="rt-obs">
            <Textarea
              id="rt-obs"
              rows={3}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="O que foi feito, condição do equipamento, garantia..."
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={retorno.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={retorno.isPending}>
            {retorno.isPending ? 'Salvando…' : 'Confirmar retorno'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
