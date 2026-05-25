import { useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { Badge } from '../../components/ui/badge';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Select, Textarea } from '../../components/ui/controls';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import type { ContratoTabProps } from './ContratoDetail';
import type { Aditivo } from './types';
import { useCreateAditivo, useDeleteAditivo, useUpdateAditivo } from './queries';

const n = (v: unknown): number => Number(v) || 0;
const TIPO_LABEL: Record<string, string> = {
  valor: 'Valor',
  prazo: 'Prazo',
  escopo: 'Escopo',
};

function AditivoModal({
  contractId,
  aditivo,
  onClose,
}: {
  contractId: string;
  aditivo: Aditivo | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const criar = useCreateAditivo();
  const editar = useUpdateAditivo();
  const isEdit = Boolean(aditivo);

  const [numero, setNumero] = useState(aditivo?.numero ?? '');
  const [tipo, setTipo] = useState(aditivo?.tipo ?? 'valor');
  const [descricao, setDescricao] = useState(aditivo?.descricao ?? '');
  const [valorDelta, setValorDelta] = useState(String(aditivo?.valorDelta ?? 0));
  const [diasDelta, setDiasDelta] = useState(String(aditivo?.diasDelta ?? 0));
  const [data, setData] = useState(aditivo?.data ?? '');
  const [aprovado, setAprovado] = useState(Boolean(aditivo?.aprovado));
  const pending = criar.isPending || editar.isPending;

  function submit() {
    if (!descricao.trim()) {
      toast.show('Descrição obrigatória', 'danger');
      return;
    }
    const input = {
      numero: numero.trim(),
      tipo,
      descricao: descricao.trim(),
      valorDelta: n(valorDelta),
      diasDelta: n(diasDelta),
      data,
      aprovado,
    };
    const handlers = {
      onSuccess: () => {
        toast.show(isEdit ? 'Aditivo atualizado' : 'Aditivo criado', 'success');
        onClose();
      },
      onError: (e: Error) => toast.show(e.message, 'danger'),
    };
    if (aditivo) {
      editar.mutate({ contractId, itemId: aditivo.id, input }, handlers);
    } else {
      criar.mutate({ contractId, input }, handlers);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editar Aditivo' : 'Novo Aditivo'}
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
      <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 130 }}>
          <FormField label="Número" htmlFor="ad-num">
            <Input
              id="ad-num"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <FormField label="Tipo" htmlFor="ad-tipo">
            <Select
              id="ad-tipo"
              value={tipo}
              onChange={(e) =>
                setTipo(e.target.value as 'valor' | 'prazo' | 'escopo')
              }
            >
              <option value="valor">Valor</option>
              <option value="prazo">Prazo</option>
              <option value="escopo">Escopo</option>
            </Select>
          </FormField>
        </div>
      </div>
      <FormField label="Descrição *" htmlFor="ad-desc">
        <Textarea
          id="ad-desc"
          rows={2}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </FormField>
      <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 110 }}>
          <FormField label="Valor Δ (R$)" htmlFor="ad-valor">
            <Input
              id="ad-valor"
              type="number"
              step="0.01"
              value={valorDelta}
              onChange={(e) => setValorDelta(e.target.value)}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 110 }}>
          <FormField label="Prazo Δ (dias)" htmlFor="ad-dias">
            <Input
              id="ad-dias"
              type="number"
              value={diasDelta}
              onChange={(e) => setDiasDelta(e.target.value)}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <FormField label="Data" htmlFor="ad-data">
            <Input
              id="ad-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </FormField>
        </div>
      </div>
      <label
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={aprovado}
          onChange={(e) => setAprovado(e.target.checked)}
        />
        Aprovado
      </label>
    </Modal>
  );
}

/** Aba Aditivos do contrato. */
export default function AditivosTab({ contract }: ContratoTabProps) {
  const toast = useToast();
  const excluir = useDeleteAditivo();
  const [modal, setModal] = useState<{ aditivo: Aditivo | null } | null>(null);

  const aditivos = (contract.aditivos as Aditivo[] | undefined) ?? [];
  const totalValor = aditivos.reduce((s, a) => s + n(a.valorDelta), 0);
  const totalDias = aditivos.reduce((s, a) => s + n(a.diasDelta), 0);

  function handleExcluir(a: Aditivo) {
    if (!window.confirm('Excluir este aditivo?')) return;
    excluir.mutate(
      { contractId: contract.id, itemId: a.id },
      {
        onSuccess: () => toast.show('Aditivo excluído', 'success'),
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
        <h3 style={{ margin: 0, fontSize: 15 }}>Aditivos de Contrato</h3>
        <Button size="sm" onClick={() => setModal({ aditivo: null })}>
          + Novo Aditivo
        </Button>
      </div>
      {aditivos.length === 0 ? (
        <p
          className="text-muted"
          style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}
        >
          Nenhum aditivo cadastrado.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th style={{ textAlign: 'right' }}>Valor Δ</th>
                <th>Prazo Δ</th>
                <th>Data</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {aditivos.map((a) => (
                <tr key={a.id}>
                  <td>{a.numero || '—'}</td>
                  <td>{TIPO_LABEL[a.tipo ?? ''] ?? a.tipo}</td>
                  <td>{a.descricao}</td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      color:
                        n(a.valorDelta) >= 0
                          ? 'var(--color-success)'
                          : 'var(--color-danger)',
                    }}
                  >
                    {n(a.valorDelta) >= 0 ? '+' : ''}
                    {formatBRL(n(a.valorDelta))}
                  </td>
                  <td>{n(a.diasDelta) ? `${n(a.diasDelta)}d` : '—'}</td>
                  <td>{formatDateBR(a.data)}</td>
                  <td>
                    <Badge
                      style={{
                        background: a.aprovado ? '#D1FAE5' : '#FEF3C7',
                        color: a.aprovado ? '#065F46' : '#92400E',
                      }}
                    >
                      {a.aprovado ? 'Aprovado' : 'Pendente'}
                    </Badge>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <a
                        className="action-link"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setModal({ aditivo: a })}
                      >
                        Editar
                      </a>
                      <a
                        className="action-link danger"
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleExcluir(a)}
                      >
                        Excluir
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: 'var(--sp-md)' }}>
                  Total aditado
                </td>
                <td style={{ textAlign: 'right', padding: 'var(--sp-md)' }}>
                  {formatBRL(totalValor)}
                </td>
                <td colSpan={4} style={{ padding: 'var(--sp-md)' }}>
                  {totalDias !== 0 ? `${totalDias > 0 ? '+' : ''}${totalDias} dias` : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {modal && (
        <AditivoModal
          contractId={contract.id}
          aditivo={modal.aditivo}
          onClose={() => setModal(null)}
        />
      )}
    </Card>
  );
}
