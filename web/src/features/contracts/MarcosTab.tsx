import { useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
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
import { formatDateBR, todayISO } from '../../lib/formatDate';
import type { ContratoTabProps } from './ContratoDetail';
import type { Marco } from './types';
import { useCreateMarco, useDeleteMarco, useUpdateMarco } from './queries';

function MarcoModal({
  contractId,
  marco,
  onClose,
}: {
  contractId: string;
  marco: Marco | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const criar = useCreateMarco();
  const editar = useUpdateMarco();
  const isEdit = Boolean(marco);

  const [titulo, setTitulo] = useState(marco?.titulo ?? '');
  const [descricao, setDescricao] = useState(marco?.descricao ?? '');
  const [prazo, setPrazo] = useState(marco?.prazo ?? '');
  const [ordem, setOrdem] = useState(String(marco?.ordem ?? 0));
  const pending = criar.isPending || editar.isPending;

  function submit() {
    if (!titulo.trim()) {
      toast.show('Título obrigatório', 'danger');
      return;
    }
    const input = {
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      prazo,
      ordem: Number(ordem) || 0,
    };
    const handlers = {
      onSuccess: () => {
        toast.show(isEdit ? 'Marco atualizado' : 'Marco criado', 'success');
        onClose();
      },
      onError: (e: Error) => toast.show(e.message, 'danger'),
    };
    if (marco) {
      editar.mutate({ contractId, itemId: marco.id, input }, handlers);
    } else {
      criar.mutate({ contractId, input }, handlers);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Marco' : 'Novo Marco'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <FormField label="Título *" htmlFor="mc-titulo">
            <Input
              id="mc-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </FormField>
          <FormField label="Descrição" htmlFor="mc-desc">
            <Textarea
              id="mc-desc"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </FormField>
          <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Prazo" htmlFor="mc-prazo">
                <DatePicker
                  id="mc-prazo"
                  value={prazo}
                  onChange={(val) => setPrazo(val)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <FormField label="Ordem" htmlFor="mc-ordem">
                <Input
                  id="mc-ordem"
                  type="number"
                  value={ordem}
                  onChange={(e) => setOrdem(e.target.value)}
                />
              </FormField>
            </div>
          </div>
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

/** Aba Marcos do contrato — checklist com prazos. */
export default function MarcosTab({ contract }: ContratoTabProps) {
  const toast = useToast();
  const editar = useUpdateMarco();
  const excluir = useDeleteMarco();
  const [modal, setModal] = useState<{ marco: Marco | null } | null>(null);

  const marcos = (contract.marcos as Marco[] | undefined) ?? [];
  const done = marcos.filter((m) => m.concluido).length;
  const pct = marcos.length > 0 ? (done / marcos.length) * 100 : 0;
  const hoje = todayISO();

  function toggle(m: Marco) {
    editar.mutate(
      { contractId: contract.id, itemId: m.id, input: { concluido: !m.concluido } },
      { onError: (e) => toast.show(e.message, 'danger') },
    );
  }
  function handleExcluir(m: Marco) {
    if (!window.confirm('Excluir este marco?')) return;
    excluir.mutate(
      { contractId: contract.id, itemId: m.id },
      {
        onSuccess: () => toast.show('Marco excluído', 'success'),
        onError: (e) => toast.show(e.message, 'danger'),
      },
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
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Checklist de Marcos</h3>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {done}/{marcos.length} concluídos · {pct.toFixed(0)}%
          </span>
        </div>
        <Button size="sm" onClick={() => setModal({ marco: null })}>
          + Novo Marco
        </Button>
      </div>
      {marcos.length > 0 && (
        <div style={{ padding: '0 var(--sp-lg) var(--sp-md)' }}>
          <div
            style={{
              height: 6,
              background: 'var(--color-surface-2)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: 'var(--color-success)',
              }}
            />
          </div>
        </div>
      )}
      {marcos.length === 0 ? (
        <p
          className="text-muted"
          style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}
        >
          Nenhum marco cadastrado.
        </p>
      ) : (
        marcos.map((m) => {
          const vencido = !m.concluido && m.prazo && m.prazo < hoje;
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--sp-md)',
                padding: 'var(--sp-md) var(--sp-lg)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(m.concluido)}
                onChange={() => toggle(m)}
                style={{ marginTop: 2, width: 18, height: 18 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    textDecoration: m.concluido ? 'line-through' : 'none',
                    color: m.concluido ? 'var(--color-text-muted)' : 'inherit',
                  }}
                >
                  {m.titulo}
                </div>
                {m.descricao && (
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    {m.descricao}
                  </div>
                )}
                {m.prazo && (
                  <div
                    style={{
                      fontSize: 12,
                      color: vencido
                        ? 'var(--color-danger)'
                        : 'var(--color-text-muted)',
                    }}
                  >
                    {vencido ? '⚠ Vencido — ' : ''}Prazo: {formatDateBR(m.prazo)}
                  </div>
                )}
              </div>
              <div className="actions-cell">
                <a
                  className="action-link"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setModal({ marco: m })}
                >
                  Editar
                </a>
                <a
                  className="action-link danger"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleExcluir(m)}
                >
                  Excluir
                </a>
              </div>
            </div>
          );
        })
      )}

      {modal && (
        <MarcoModal
          contractId={contract.id}
          marco={modal.marco}
          onClose={() => setModal(null)}
        />
      )}
    </Card>
  );
}
