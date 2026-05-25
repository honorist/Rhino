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
import { Input, Select, Textarea } from '../../components/ui/controls';
import { useToast } from '../../components/ui/toast/ToastContext';
import { useContracts } from '../contracts/queries';
import {
  useCreateSolicitacaoCompra,
  useUpdateSolicitacaoCompra,
} from '../resources';
import type { SolicitacaoCompra } from '../../types/domain';
import { parseItens } from './etapa';

interface ItemRascunho {
  descricao: string;
  tipo: 'compra' | 'aluguel';
  qtd: string;
  observacoes: string;
}

const ITEM_VAZIO: ItemRascunho = {
  descricao: '',
  tipo: 'compra',
  qtd: '1',
  observacoes: '',
};

interface CriarSolicitacaoModalProps {
  solicitacao: SolicitacaoCompra | null;
  onClose: () => void;
}

/** Modal de criação/edição de solicitação de compra (1ª etapa). */
export default function CriarSolicitacaoModal({
  solicitacao,
  onClose,
}: CriarSolicitacaoModalProps) {
  const toast = useToast();
  const criar = useCreateSolicitacaoCompra();
  const editar = useUpdateSolicitacaoCompra();
  const contractsQuery = useContracts();
  const isEdit = Boolean(solicitacao);

  const contratos = (contractsQuery.data ?? []).filter(
    (c) => c.status === 'ativo' || c.status === 'pausado',
  );

  const [destino, setDestino] = useState(
    solicitacao?.contractId ? `obra:${solicitacao.contractId}` : 'sede',
  );
  const [justificativa, setJustificativa] = useState(
    solicitacao?.justificativa ?? '',
  );
  const [itens, setItens] = useState<ItemRascunho[]>(() => {
    const base = solicitacao ? parseItens(solicitacao.itens) : [];
    return base.length > 0
      ? base.map((it) => ({
          descricao: it.descricao ?? '',
          tipo: it.tipo === 'aluguel' ? 'aluguel' : 'compra',
          qtd: String(it.qtd ?? 1),
          observacoes: it.observacoes ?? '',
        }))
      : [{ ...ITEM_VAZIO }];
  });

  const pending = criar.isPending || editar.isPending;

  function editarItem(idx: number, patch: Partial<ItemRascunho>) {
    setItens((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function submit() {
    const itensValidos = itens
      .map((it) => ({
        descricao: it.descricao.trim(),
        qtd: Number(it.qtd) || 0,
        observacoes: it.observacoes.trim(),
        tipo: it.tipo,
      }))
      .filter((it) => it.descricao && it.qtd > 0);
    if (itensValidos.length === 0) {
      toast.show('Adicione pelo menos um item válido', 'danger');
      return;
    }
    if (!justificativa.trim()) {
      toast.show('Justificativa obrigatória', 'danger');
      return;
    }
    const contractId = destino.startsWith('obra:')
      ? destino.slice(5)
      : null;
    const input = {
      itens: itensValidos,
      justificativa: justificativa.trim(),
      contractId,
      almoxarifadoDestinoId: contractId
        ? `auto-obra:${contractId}`
        : 'auto-central',
    };
    const handlers = {
      onSuccess: () => {
        toast.show(
          isEdit
            ? 'Solicitação atualizada'
            : 'Solicitação enviada para avaliação',
          'success',
        );
        onClose();
      },
      onError: (e: Error) => toast.show(e.message, 'danger'),
    };
    if (solicitacao) editar.mutate({ id: solicitacao.id, input }, handlers);
    else criar.mutate(input, handlers);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Solicitação' : 'Nova Solicitação de Compra'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <p style={{ margin: '0 0 var(--sp-md)', fontSize: 13, color: 'var(--color-text-muted)' }}>
        Informe o que precisa, a quantidade e onde será usado. A equipe de
        compras precifica e o gerente aprova.
      </p>
      <FormField label="Destino *" htmlFor="sc-destino">
        <Select
          id="sc-destino"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
        >
          <option value="sede">🏢 Sede / Almoxarifado Central</option>
          {contratos.map((c) => (
            <option key={c.id} value={`obra:${c.id}`}>
              🏗️ Obra · {String(c.name ?? '')}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Justificativa *" htmlFor="sc-just">
        <Textarea
          id="sc-just"
          rows={2}
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Por que esses materiais são necessários?"
        />
      </FormField>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: 'var(--sp-md) 0 var(--sp-sm)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          Itens solicitados
        </h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setItens((arr) => [...arr, { ...ITEM_VAZIO }])}
        >
          + Adicionar item
        </Button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Descrição *</th>
              <th style={{ width: 120 }}>Tipo</th>
              <th style={{ width: 90 }}>Qtd *</th>
              <th>Observações</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {itens.map((it, idx) => (
              <tr key={idx}>
                <td>
                  <Input
                    value={it.descricao}
                    onChange={(e) =>
                      editarItem(idx, { descricao: e.target.value })
                    }
                    placeholder="Descrição do material"
                  />
                </td>
                <td>
                  <Select
                    value={it.tipo}
                    onChange={(e) =>
                      editarItem(idx, {
                        tipo: e.target.value as 'compra' | 'aluguel',
                      })
                    }
                  >
                    <option value="compra">🛒 Compra</option>
                    <option value="aluguel">🔑 Aluguel</option>
                  </Select>
                </td>
                <td>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={it.qtd}
                    onChange={(e) => editarItem(idx, { qtd: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    value={it.observacoes}
                    onChange={(e) =>
                      editarItem(idx, { observacoes: e.target.value })
                    }
                    placeholder="Notas (opcional)"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() =>
                      setItens((arr) => arr.filter((_, i) => i !== idx))
                    }
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#DC2626',
                      cursor: 'pointer',
                      fontSize: 16,
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Enviando…' : isEdit ? 'Salvar' : 'Enviar para compras'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
