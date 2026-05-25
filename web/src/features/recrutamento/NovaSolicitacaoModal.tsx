import { useState } from 'react';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '../../components/ui/combobox';
import { toast } from 'sonner';
import { useContracts } from '../contracts/queries';
import { useCriarSolicitacao } from './queries';
import type { VagaInput } from './types';

/**
 * US-05 — Encarregado abre solicitação de contratação com 1+ vagas.
 * Cada vaga tem cargo + quantidade. RH é notificado in-app na criação.
 */
export default function NovaSolicitacaoModal({ onClose }: { onClose: () => void }) {
  const criar = useCriarSolicitacao();
  const contractsQuery = useContracts();

  const [contractId, setContractId] = useState<string>('');
  const [observacoes, setObservacoes] = useState('');
  const [vagas, setVagas] = useState<VagaInput[]>([{ cargo: '', qtdTotal: 1 }]);

  function addVaga() {
    setVagas((v) => [...v, { cargo: '', qtdTotal: 1 }]);
  }
  function rmVaga(i: number) {
    setVagas((v) => v.filter((_, j) => j !== i));
  }
  function patchVaga(i: number, p: Partial<VagaInput>) {
    setVagas((v) => v.map((x, j) => (j === i ? { ...x, ...p } : x)));
  }

  async function handleSubmit() {
    const vagasValidas = vagas
      .map((v) => ({ cargo: v.cargo.trim(), qtdTotal: Number(v.qtdTotal) || 0 }))
      .filter((v) => v.cargo);
    if (vagasValidas.length === 0) {
      toast.error('Informe pelo menos uma vaga com cargo.');
      return;
    }
    if (vagasValidas.some((v) => v.qtdTotal <= 0)) {
      toast.error('Quantidade de cada vaga deve ser maior que zero.');
      return;
    }
    try {
      await criar.mutateAsync({
        contractId: contractId || null,
        observacoes: observacoes.trim() || undefined,
        vagas: vagasValidas,
      });
      toast.success('Solicitação criada. RH foi notificado.');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[920px]">
        <DialogHeader>
          <DialogTitle>Nova solicitação de contratação</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <FormField label="Obra / Contrato (opcional)" htmlFor="sol-contrato">
        <Combobox
          id="sol-contrato"
          options={[
            { value: '', label: '— Sem contrato específico —' },
            ...(contractsQuery.data ?? []).map((c) => ({
              value: c.id,
              label: c.client ? `${c.name} · ${c.client}` : c.name,
            })),
          ]}
          value={contractId}
          onChange={setContractId}
          placeholder="— Sem contrato específico —"
          searchPlaceholder="Pesquisar contrato..."
          emptyText="Nenhum contrato encontrado."
        />
      </FormField>

      <div
        style={{
          marginTop: 'var(--sp-md)',
          padding: 'var(--sp-md)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--sp-sm)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>Vagas necessárias</h3>
          <Button size="sm" onClick={addVaga}>
            + Vaga
          </Button>
        </div>
        <table style={{ width: '100%', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: 12, color: '#64748B' }}>Cargo</th>
              <th style={{ width: 100, textAlign: 'left', fontSize: 12, color: '#64748B' }}>
                Qtd
              </th>
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {vagas.map((v, i) => (
              <tr key={i}>
                <td style={{ padding: '4px 0' }}>
                  <Input
                    value={v.cargo}
                    onChange={(e) => patchVaga(i, { cargo: e.target.value })}
                    placeholder="Ex.: Pedreiro, Servente, Eletricista"
                  />
                </td>
                <td style={{ padding: '4px 0' }}>
                  <Input
                    type="number"
                    min={1}
                    value={String(v.qtdTotal)}
                    onChange={(e) =>
                      patchVaga(i, { qtdTotal: Number(e.target.value) || 0 })
                    }
                  />
                </td>
                <td style={{ padding: '4px 0', textAlign: 'center' }}>
                  {vagas.length > 1 && (
                    <a
                      className="action-link danger"
                      style={{ cursor: 'pointer' }}
                      onClick={() => rmVaga(i)}
                    >
                      ✕
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 'var(--sp-md)' }}>
        <FormField label="Observações" htmlFor="sol-obs">
          <Textarea
            id="sol-obs"
            rows={3}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Urgência, requisitos especiais, jornada, etc."
          />
        </FormField>
      </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={criar.isPending}>
            {criar.isPending ? 'Enviando…' : 'Criar solicitação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
