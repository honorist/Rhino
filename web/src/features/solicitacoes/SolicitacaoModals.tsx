import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Card from '../../components/ui/Card';
import FormField from '../../components/ui/FormField';
import { Input, Textarea, Select } from '../../components/ui/controls';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import { todayISO } from '../../lib/formatDate';
import { useContracts } from '../contracts/queries';
import { useFornecedores } from '../resources';
import type { SolicitacaoCompra } from '../../types/domain';
import {
  useAprovarSolicitacao,
  useComprarSolicitacao,
  useRejeitarSolicitacao,
  useReceberSolicitacao,
} from './queries';
import { fmtDataHora, parseItens } from './etapa';

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

interface ModalProps {
  solicitacao: SolicitacaoCompra;
  onClose: () => void;
}

// ── 3ª etapa: gerente aprova / rejeita ────────────────────────────────────

/** Modal de aprovação de uma solicitação pré-avaliada. */
export function AprovarModal({ solicitacao: s, onClose }: ModalProps) {
  const toast = useToast();
  const aprovar = useAprovarSolicitacao();
  const rejeitar = useRejeitarSolicitacao();
  const contractsQuery = useContracts();

  const itens = parseItens(s.itens);
  const contrato = (contractsQuery.data ?? []).find(
    (c) => c.id === s.contractId,
  );
  const destino = contrato
    ? `🏗️ ${String(contrato.name ?? '')}`
    : '🏢 Sede / Almoxarifado Central';
  const pending = aprovar.isPending || rejeitar.isPending;

  function handleAprovar() {
    if (
      !window.confirm(
        'Aprovar? A equipe de compras poderá então registrar a compra.',
      )
    ) {
      return;
    }
    aprovar.mutate(s.id, {
      onSuccess: () => {
        toast.show('Solicitação aprovada', 'success');
        onClose();
      },
      onError: (e) => toast.show(e.message, 'danger'),
    });
  }

  function handleRejeitar() {
    const motivo = window.prompt('Motivo da rejeição (opcional):');
    if (motivo === null) return;
    rejeitar.mutate(
      { id: s.id, motivo },
      {
        onSuccess: () => {
          toast.show('Solicitação rejeitada', 'success');
          onClose();
        },
        onError: (e) => toast.show(e.message, 'danger'),
      },
    );
  }

  return (
    <Modal
      open
      title="Aprovar Solicitação"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Fechar
          </Button>
          <Button variant="danger" onClick={handleRejeitar} disabled={pending}>
            Rejeitar
          </Button>
          <Button onClick={handleAprovar} disabled={pending}>
            ✅ Aprovar
          </Button>
        </>
      }
    >
      <p style={{ margin: '0 0 var(--sp-md)', fontSize: 13, color: 'var(--color-text-muted)' }}>
        Pré-aprovada pela equipe de compras · Total:{' '}
        <strong>{formatBRL(Number(s.valorTotal) || 0)}</strong>
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 'var(--sp-md)',
          fontSize: 14,
        }}
      >
        <div>
          <strong>Solicitante:</strong> {s.solicitanteNome || '—'}
        </div>
        <div>
          <strong>Avaliado por:</strong> {s.avaliadorNome || '—'}
        </div>
        <div>
          <strong>Destino:</strong> {destino}
        </div>
        <div>
          <strong>Avaliado em:</strong> {fmtDataHora(s.avaliadoEm)}
        </div>
      </div>
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
      <h3 style={{ margin: 'var(--sp-md) 0 8px', fontSize: 15 }}>
        Itens precificados
      </h3>
      {itens.map((it, i) => (
        <Card key={i} style={{ padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <strong>{it.descricao}</strong>
              {it.tipo === 'aluguel' && ' 🔑'}{' '}
              <span style={{ color: 'var(--color-text-muted)' }}>
                qtd {it.qtd} × {formatBRL(Number(it.precoUnit) || 0)}
              </span>
            </div>
            <strong>{formatBRL(it.qtd * (Number(it.precoUnit) || 0))}</strong>
          </div>
        </Card>
      ))}
    </Modal>
  );
}

// ── 4ª etapa: registrar compra ────────────────────────────────────────────

/** Modal de registro de compra (gera Conta a Pagar). */
export function ComprarModal({ solicitacao: s, onClose }: ModalProps) {
  const toast = useToast();
  const comprar = useComprarSolicitacao();
  const fornecedoresQuery = useFornecedores();
  const itens = parseItens(s.itens);

  const fornecedorPadrao =
    s.fornecedorId ||
    itens[0]?.cotacoes?.[itens[0]?.cotacaoEscolhidaIdx ?? 0]?.fornecedorId ||
    '';
  const venc30 = new Date(Date.now() + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [numeroPedido, setNumeroPedido] = useState('');
  const [dataPrevistaEntrega, setDataPrevistaEntrega] = useState('');
  const [fornecedorId, setFornecedorId] = useState(fornecedorPadrao);
  const [dataVencimento, setDataVencimento] = useState(venc30);

  function submit() {
    if (!dataVencimento) {
      toast.show('Informe o vencimento da CP', 'danger');
      return;
    }
    comprar.mutate(
      {
        id: s.id,
        input: { numeroPedido, dataPrevistaEntrega, fornecedorId, dataVencimento },
      },
      {
        onSuccess: () => {
          toast.show('Compra registrada — Conta a Pagar gerada', 'success');
          onClose();
        },
        onError: (e) => toast.show(e.message, 'danger'),
      },
    );
  }

  return (
    <Modal
      open
      title="Registrar compra"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={comprar.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={comprar.isPending}>
            {comprar.isPending ? 'Salvando…' : 'Registrar compra (gera CP)'}
          </Button>
        </>
      }
    >
      <p style={{ margin: '0 0 var(--sp-md)', fontSize: 13, color: 'var(--color-text-muted)' }}>
        Vai gerar a Conta a Pagar de {formatBRL(Number(s.valorTotal) || 0)}.
      </p>
      <Row>
        <div style={{ flex: 1, minWidth: 180 }}>
          <FormField label="Nº do pedido junto ao fornecedor" htmlFor="cp-num">
            <Input
              id="cp-num"
              value={numeroPedido}
              onChange={(e) => setNumeroPedido(e.target.value)}
              placeholder="Ex: OC-2026-007"
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <FormField label="Previsão de entrega" htmlFor="cp-prev">
            <Input
              id="cp-prev"
              type="date"
              value={dataPrevistaEntrega}
              onChange={(e) => setDataPrevistaEntrega(e.target.value)}
            />
          </FormField>
        </div>
      </Row>
      <Row>
        <div style={{ flex: 1, minWidth: 180 }}>
          <FormField label="Fornecedor" htmlFor="cp-forn">
            <Select
              id="cp-forn"
              value={fornecedorId}
              onChange={(e) => setFornecedorId(e.target.value)}
            >
              <option value="">— Selecionar —</option>
              {(fornecedoresQuery.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {String(f.nome ?? '')}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <FormField label="Vencimento da CP *" htmlFor="cp-venc">
            <Input
              id="cp-venc"
              type="date"
              value={dataVencimento}
              onChange={(e) => setDataVencimento(e.target.value)}
            />
          </FormField>
        </div>
      </Row>
    </Modal>
  );
}

// ── 5ª etapa: confirmar recebimento ───────────────────────────────────────

/** Modal de confirmação de chegada (gera entrada de estoque). */
export function ReceberModal({ solicitacao: s, onClose }: ModalProps) {
  const toast = useToast();
  const receber = useReceberSolicitacao();
  const itens = parseItens(s.itens);

  const [dataRecebimento, setDataRecebimento] = useState(todayISO());
  const [nfRecebimento, setNfRecebimento] = useState('');
  const [obsRecebimento, setObsRecebimento] = useState('');

  function submit() {
    if (!dataRecebimento) {
      toast.show('Informe a data de recebimento', 'danger');
      return;
    }
    receber.mutate(
      { id: s.id, input: { dataRecebimento, nfRecebimento, obsRecebimento } },
      {
        onSuccess: () => {
          toast.show(
            'Recebimento confirmado — entrada de estoque gerada',
            'success',
          );
          onClose();
        },
        onError: (e) => toast.show(e.message, 'danger'),
      },
    );
  }

  return (
    <Modal
      open
      title="Confirmar chegada do material"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={receber.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={receber.isPending}>
            {receber.isPending ? 'Salvando…' : 'Confirmar chegada'}
          </Button>
        </>
      }
    >
      <p style={{ margin: '0 0 var(--sp-md)', fontSize: 13, color: 'var(--color-text-muted)' }}>
        {itens.length} {itens.length === 1 ? 'item' : 'itens'} entram no estoque
        ao confirmar.
      </p>
      <Row>
        <div style={{ flex: 1, minWidth: 150 }}>
          <FormField label="Data de recebimento *" htmlFor="rc-data">
            <Input
              id="rc-data"
              type="date"
              value={dataRecebimento}
              onChange={(e) => setDataRecebimento(e.target.value)}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <FormField label="Nº da NF do fornecedor" htmlFor="rc-nf">
            <Input
              id="rc-nf"
              value={nfRecebimento}
              onChange={(e) => setNfRecebimento(e.target.value)}
              placeholder="Opcional"
            />
          </FormField>
        </div>
      </Row>
      <FormField label="Observações" htmlFor="rc-obs">
        <Textarea
          id="rc-obs"
          rows={2}
          value={obsRecebimento}
          onChange={(e) => setObsRecebimento(e.target.value)}
          placeholder="Ex: 1 caixa amassada, conferido por..."
        />
      </FormField>
    </Modal>
  );
}
