import { useState } from 'react';
import Button from '../../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import Card from '../../components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/native-select';
import { toast } from 'sonner';
import { formatBRL } from '../../lib/format';
import { useContracts } from '../contracts/queries';
import { useFornecedores } from '../resources';
import type { SolCotacao, SolItem, SolicitacaoCompra } from '../../types/domain';
import { useAvaliarSolicitacao, useCancelarSolicitacao } from './queries';
import { fmtDataHora, parseItens } from './etapa';

/** Item com cotações garantidas (estado de edição). */
interface ItemAvaliacao extends SolItem {
  cotacoes: SolCotacao[];
  cotacaoEscolhidaIdx: number;
}

const COTACAO_VAZIA: SolCotacao = {
  fornecedorId: '',
  fornecedorNome: '',
  precoUnit: 0,
  link: '',
  observacoes: '',
};

interface AvaliarModalProps {
  solicitacao: SolicitacaoCompra;
  onClose: () => void;
}

/** Modal de avaliação/precificação — cotações por item (2ª etapa). */
export default function AvaliarModal({
  solicitacao: s,
  onClose,
}: AvaliarModalProps) {
  const avaliar = useAvaliarSolicitacao();
  const cancelar = useCancelarSolicitacao();
  const fornecedoresQuery = useFornecedores();
  const contractsQuery = useContracts();

  const [itens, setItens] = useState<ItemAvaliacao[]>(() =>
    parseItens(s.itens).map((it) => ({
      ...it,
      cotacoes:
        it.cotacoes && it.cotacoes.length > 0
          ? it.cotacoes.map((c) => ({ ...c }))
          : [{ ...COTACAO_VAZIA }],
      cotacaoEscolhidaIdx: it.cotacaoEscolhidaIdx ?? 0,
    })),
  );

  const fornecedores = fornecedoresQuery.data ?? [];
  const contrato = (contractsQuery.data ?? []).find(
    (c) => c.id === s.contractId,
  );
  const pending = avaliar.isPending || cancelar.isPending;

  const total = itens.reduce((sum, it) => {
    const c = it.cotacoes[it.cotacaoEscolhidaIdx];
    return sum + it.qtd * (Number(c?.precoUnit) || 0);
  }, 0);

  function patchItem(i: number, patch: Partial<ItemAvaliacao>) {
    setItens((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function patchCotacao(i: number, j: number, patch: Partial<SolCotacao>) {
    setItens((arr) =>
      arr.map((it, idx) =>
        idx === i
          ? {
              ...it,
              cotacoes: it.cotacoes.map((c, cj) =>
                cj === j ? { ...c, ...patch } : c,
              ),
            }
          : it,
      ),
    );
  }
  function addCotacao(i: number) {
    setItens((arr) =>
      arr.map((it, idx) =>
        idx === i ? { ...it, cotacoes: [...it.cotacoes, { ...COTACAO_VAZIA }] } : it,
      ),
    );
  }
  function removeCotacao(i: number, j: number) {
    setItens((arr) =>
      arr.map((it, idx) => {
        if (idx !== i) return it;
        if (it.cotacoes.length === 1) {
          toast.error('Item precisa de ao menos uma cotação');
          return it;
        }
        const cotacoes = it.cotacoes.filter((_, cj) => cj !== j);
        const escolhida = Math.min(it.cotacaoEscolhidaIdx, cotacoes.length - 1);
        return { ...it, cotacoes, cotacaoEscolhidaIdx: escolhida };
      }),
    );
  }

  function handleEnviar() {
    for (const it of itens) {
      const esc = it.cotacoes[it.cotacaoEscolhidaIdx];
      if (!esc || !esc.fornecedorId || !(Number(esc.precoUnit) > 0)) {
        toast.error(`Escolha uma cotação válida para "${it.descricao}"`);
        return;
      }
    }
    avaliar.mutate(
      { id: s.id, itens },
      {
        onSuccess: () => {
          toast.success('Enviada para aprovação do gerente');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function handleCancelar() {
    const motivo = window.prompt('Motivo do cancelamento:');
    if (!motivo || !motivo.trim()) return;
    cancelar.mutate(
      { id: s.id, motivo },
      {
        onSuccess: () => {
          toast.success('Solicitação cancelada');
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
          <DialogTitle>Avaliar / Precificar</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <p style={{ margin: '0 0 var(--sp-md)', fontSize: 13, color: 'var(--color-text-muted)' }}>
        Solicitante: {s.solicitanteNome || '—'} · {fmtDataHora(s.createdAt)}
      </p>
      {s.justificativa && (
        <div
          style={{
            padding: 10,
            background: 'var(--color-surface-2)',
            borderRadius: 6,
            marginBottom: 'var(--sp-md)',
          }}
        >
          <strong>Justificativa:</strong>
          <br />
          {s.justificativa}
        </div>
      )}
      <div
        style={{
          padding: 10,
          background: '#EFF6FF',
          borderLeft: '3px solid #3B82F6',
          borderRadius: 4,
          marginBottom: 'var(--sp-md)',
          fontSize: 14,
        }}
      >
        <strong>Destino:</strong>{' '}
        {contrato
          ? `🏗️ ${String(contrato.name ?? '')}`
          : '🏢 Sede / Almoxarifado Central'}
      </div>

      <h3 style={{ margin: 'var(--sp-lg) 0 var(--sp-sm)', fontSize: 16 }}>
        Cotações por item
      </h3>
      {itens.map((it, i) => (
        <Card key={i} style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-md)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <div>
              <strong>{it.descricao}</strong>
              {it.tipo === 'aluguel' && ' 🔑'}
              <span
                style={{
                  marginLeft: 8,
                  color: 'var(--color-text-muted)',
                  fontSize: 13,
                }}
              >
                qtd: {it.qtd}
              </span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => addCotacao(i)}>
              + Cotação
            </Button>
          </div>
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ width: 30 }}>✓</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead style={{ width: 120 }}>Preço unit.</TableHead>
                  <TableHead>Link / observação</TableHead>
                  <TableHead style={{ width: 110, textAlign: 'right' }}>Subtotal</TableHead>
                  <TableHead style={{ width: 30 }} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {it.cotacoes.map((c, j) => (
                  <TableRow key={j}>
                    <TableCell style={{ textAlign: 'center' }}>
                      <input
                        type="radio"
                        name={`esc-${i}`}
                        checked={it.cotacaoEscolhidaIdx === j}
                        onChange={() => patchItem(i, { cotacaoEscolhidaIdx: j })}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={c.fornecedorId}
                        onChange={(e) => {
                          const f = fornecedores.find(
                            (x) => x.id === e.target.value,
                          );
                          patchCotacao(i, j, {
                            fornecedorId: e.target.value,
                            fornecedorNome: f ? String(f.nome ?? '') : '',
                          });
                        }}
                      >
                        <option value="">— Selecionar —</option>
                        {fornecedores.map((f) => (
                          <option key={f.id} value={f.id}>
                            {String(f.nome ?? '')}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={c.precoUnit}
                        onChange={(e) =>
                          patchCotacao(i, j, {
                            precoUnit: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={c.link ?? ''}
                        onChange={(e) =>
                          patchCotacao(i, j, { link: e.target.value })
                        }
                        placeholder="link, condições, prazo..."
                      />
                    </TableCell>
                    <TableCell style={{ textAlign: 'right', fontWeight: 700 }}>
                      {formatBRL(it.qtd * (Number(c.precoUnit) || 0))}
                    </TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => removeCotacao(i, j)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#DC2626',
                        }}
                      >
                        ✕
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ))}

      <div
        style={{
          marginTop: 'var(--sp-md)',
          textAlign: 'right',
          fontSize: 18,
          fontWeight: 800,
          background: 'var(--color-surface-2)',
          padding: 12,
          borderRadius: 6,
        }}
      >
        Total estimado: {formatBRL(total)}
      </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Fechar
          </Button>
          <Button variant="danger" onClick={handleCancelar} disabled={pending}>
            Cancelar solicitação
          </Button>
          <Button onClick={handleEnviar} disabled={pending}>
            Enviar para aprovação →
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
