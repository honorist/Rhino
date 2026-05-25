import { useId, useState } from 'react';
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
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import type { Almoxarifado, EstoqueItem } from './types';
import { saldoTotal } from './saldo';
import { CATEGORIAS_PADRAO, UNIDADES_PADRAO } from './constants';
import { useCriarItem, useEditarItem, useInativarItem } from './queries';

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

interface ItemModalProps {
  item: EstoqueItem | null;
  almoxs: Almoxarifado[];
  onClose: () => void;
}

/** Modal de criação/edição de item de estoque. */
export default function ItemModal({ item, almoxs, onClose }: ItemModalProps) {
  const toast = useToast();
  const criar = useCriarItem();
  const editar = useEditarItem();
  const inativar = useInativarItem();
  const isEdit = Boolean(item);
  const catListId = useId();
  const unidListId = useId();

  const [codigo, setCodigo] = useState(item?.codigo ?? '');
  const [unidade, setUnidade] = useState(item?.unidade ?? '');
  const [descricao, setDescricao] = useState(item?.descricao ?? '');
  const [categoria, setCategoria] = useState(item?.categoria ?? '');
  const [estoqueMinimo, setEstoqueMinimo] = useState(
    String(item?.estoqueMinimo ?? 0),
  );
  const [notas, setNotas] = useState(item?.notas ?? '');

  const pending = criar.isPending || editar.isPending;
  const total = item ? saldoTotal(item) : 0;
  const valorTotal = total * (Number(item?.custoMedio) || 0);

  function submit() {
    if (!descricao.trim()) {
      toast.show('Descrição obrigatória', 'danger');
      return;
    }
    if (!unidade.trim()) {
      toast.show('Unidade obrigatória', 'danger');
      return;
    }
    if (!categoria.trim()) {
      toast.show('Categoria obrigatória', 'danger');
      return;
    }
    const input = {
      codigo: codigo.trim(),
      descricao: descricao.trim(),
      categoria: categoria.trim(),
      unidade: unidade.trim(),
      estoqueMinimo: Number(estoqueMinimo) || 0,
      notas: notas.trim(),
    };
    const handlers = {
      onSuccess: () => {
        toast.show(isEdit ? 'Item atualizado' : 'Item criado', 'success');
        onClose();
      },
      onError: (e: Error) => toast.show(e.message, 'danger'),
    };
    if (item) editar.mutate({ id: item.id, input }, handlers);
    else criar.mutate(input, handlers);
  }

  function handleInativar() {
    if (!item) return;
    if (
      !window.confirm(
        `Inativar "${item.descricao}"? Histórico e saldos preservados.`,
      )
    ) {
      return;
    }
    inativar.mutate(item.id, {
      onSuccess: () => {
        toast.show('Item inativado', 'success');
        onClose();
      },
      onError: (e) => toast.show(e.message, 'danger'),
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? '✏️ Editar item' : '+ Novo item'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {item && (
        <div
          style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 'var(--sp-md)',
            marginBottom: 'var(--sp-lg)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 'var(--sp-sm)',
              fontSize: 14,
            }}
          >
            <div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Saldo total
              </div>
              <strong>
                {total.toFixed(2)} {item.unidade}
              </strong>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Custo médio
              </div>
              <strong>{formatBRL(Number(item.custoMedio) || 0)}</strong>
            </div>
            <div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Valor total
              </div>
              <strong>{formatBRL(valorTotal)}</strong>
            </div>
          </div>
          <div
            style={{
              marginTop: 'var(--sp-sm)',
              paddingTop: 'var(--sp-sm)',
              borderTop: '1px solid var(--color-border)',
              fontSize: 13,
            }}
          >
            {(item.saldos ?? [])
              .filter((s) => s.qtd > 0)
              .map((s) => {
                const a = almoxs.find((x) => x.id === s.almoxId);
                return (
                  <span key={s.almoxId} style={{ marginRight: 12 }}>
                    {a && !a.contractId ? '🏠' : '🏗️'}{' '}
                    {a?.contractName || a?.nome || '?'}:{' '}
                    <strong>{Number(s.qtd).toFixed(2)}</strong>
                  </span>
                );
              })}
          </div>
        </div>
      )}

      <Row>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="Código" htmlFor="it-cod">
            <Input
              id="it-cod"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ex: PRF-001"
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="Unidade *" htmlFor="it-unid">
            <Input
              id="it-unid"
              list={unidListId}
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              placeholder="Selecione ou digite..."
            />
            <datalist id={unidListId}>
              {UNIDADES_PADRAO.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </FormField>
        </div>
      </Row>
      <FormField label="Descrição *" htmlFor="it-desc">
        <Input
          id="it-desc"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex: Parafuso sextavado M8 x 30mm"
        />
      </FormField>
      <Row>
        <div style={{ flex: 1, minWidth: 160 }}>
          <FormField label="Categoria *" htmlFor="it-cat">
            <Input
              id="it-cat"
              list={catListId}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Selecione ou digite..."
            />
            <datalist id={catListId}>
              {CATEGORIAS_PADRAO.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField
            label="Estoque mínimo"
            htmlFor="it-min"
            helper="Alerta quando o saldo total ficar abaixo"
          >
            <Input
              id="it-min"
              type="number"
              step="0.01"
              min={0}
              value={estoqueMinimo}
              onChange={(e) => setEstoqueMinimo(e.target.value)}
            />
          </FormField>
        </div>
      </Row>
      <FormField label="Notas" htmlFor="it-notas">
        <Textarea
          id="it-notas"
          rows={2}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Observações sobre o item"
        />
      </FormField>
        </div>
        <DialogFooter>
          {isEdit && (
            <Button
              variant="danger"
              onClick={handleInativar}
              disabled={inativar.isPending}
              style={{ marginRight: 'auto' }}
            >
              Inativar item
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
