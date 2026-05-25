import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Spinner from '../../components/ui/Spinner';
import { Select } from '../../components/ui/controls';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import type { Contract } from '../contracts/types';
import { useContracts } from '../contracts/queries';
import {
  useRemoveSolicitacaoCompra,
  useSolicitacoesCompra,
} from '../resources';
import type { SolicitacaoCompra } from '../../types/domain';
import { etapaCfg, parseItens } from './etapa';
import {
  useCancelarSolicitacao,
  useRejeitarSolicitacao,
} from './queries';
import CriarSolicitacaoModal from './CriarSolicitacaoModal';
import AvaliarModal from './AvaliarModal';
import DetalheSolicitacaoModal from './DetalheSolicitacaoModal';
import {
  AprovarModal,
  ComprarModal,
  ReceberModal,
} from './SolicitacaoModals';

const FILTRO_STATUS: { value: string; label: string }[] = [
  { value: 'pendente_avaliacao', label: '🟡 Aguardando equipe de compras' },
  { value: 'pendente_aprovacao', label: '🟠 Aguardando gerente' },
  { value: 'aprovada', label: '🔵 Aprovada (a comprar)' },
  { value: 'comprada', label: '📦 Comprada (a receber)' },
  { value: 'recebida', label: '✅ Recebida' },
  { value: 'rejeitada', label: '❌ Rejeitada' },
  { value: 'cancelada', label: '🚫 Cancelada' },
];

function Kpi({
  label,
  value,
  cor,
  sub,
}: {
  label: string;
  value: number;
  cor: string;
  sub?: string;
}) {
  return (
    <Card style={{ padding: 'var(--sp-md)' }}>
      <div
        style={{
          fontSize: 13,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: cor }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {sub}
        </div>
      )}
    </Card>
  );
}

function ActionLink({
  label,
  onClick,
  color,
  danger,
}: {
  label: string;
  onClick: () => void;
  color?: string;
  danger?: boolean;
}) {
  return (
    <a
      className={`action-link${danger ? ' danger' : ''}`}
      style={{ cursor: 'pointer', color }}
      onClick={onClick}
    >
      {label}
    </a>
  );
}

type ModalState =
  | { type: 'criar'; solicitacao: SolicitacaoCompra | null }
  | {
      type: 'avaliar' | 'aprovar' | 'comprar' | 'receber' | 'detalhe';
      solicitacao: SolicitacaoCompra;
    }
  | null;

/** Solicitações de Compra — fluxo de 5 etapas. */
export default function SolicitacoesCompra() {
  const toast = useToast();
  const solQuery = useSolicitacoesCompra();
  const contractsQuery = useContracts();
  const remover = useRemoveSolicitacaoCompra();
  const cancelar = useCancelarSolicitacao();
  const rejeitar = useRejeitarSolicitacao();

  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroContrato, setFiltroContrato] = useState('');
  const [modal, setModal] = useState<ModalState>(null);

  const todas = useMemo(() => solQuery.data ?? [], [solQuery.data]);
  const contratosPorId = useMemo(() => {
    const mapa = new Map<string, Contract>();
    for (const c of contractsQuery.data ?? []) mapa.set(c.id, c);
    return mapa;
  }, [contractsQuery.data]);

  if (solQuery.isLoading) {
    return <Spinner label="Carregando..." />;
  }
  if (solQuery.isError) {
    return <div className="error-banner">Erro ao carregar as solicitações.</div>;
  }

  const lista = todas.filter((s) => {
    if (filtroStatus && s.status !== filtroStatus) return false;
    if (filtroContrato && s.contractId !== filtroContrato) return false;
    return true;
  });

  const contar = (st: string) => todas.filter((s) => s.status === st).length;
  const totalAprovar = todas
    .filter((s) => s.status === 'pendente_aprovacao')
    .reduce((sum, s) => sum + (Number(s.valorTotal) || 0), 0);

  function comMotivo(
    titulo: string,
    fn: (motivo: string) => void,
    opcional = false,
  ) {
    const motivo = window.prompt(titulo);
    if (motivo === null) return;
    if (!opcional && !motivo.trim()) return;
    fn(motivo);
  }

  function handleCancelar(s: SolicitacaoCompra) {
    comMotivo('Motivo do cancelamento:', (motivo) =>
      cancelar.mutate(
        { id: s.id, motivo },
        {
          onSuccess: () => toast.show('Solicitação cancelada', 'success'),
          onError: (e) => toast.show(e.message, 'danger'),
        },
      ),
    );
  }
  function handleRejeitar(s: SolicitacaoCompra) {
    comMotivo(
      'Motivo da rejeição (opcional):',
      (motivo) =>
        rejeitar.mutate(
          { id: s.id, motivo },
          {
            onSuccess: () => toast.show('Solicitação rejeitada', 'success'),
            onError: (e) => toast.show(e.message, 'danger'),
          },
        ),
      true,
    );
  }
  function handleExcluir(s: SolicitacaoCompra) {
    if (!window.confirm('Excluir esta solicitação?')) return;
    remover.mutate(s.id, {
      onSuccess: () => toast.show('Solicitação excluída', 'success'),
      onError: (e) => toast.show(e.message, 'danger'),
    });
  }

  const columns: Column<SolicitacaoCompra>[] = [
    {
      header: 'Data',
      cell: (s) =>
        s.createdAt
          ? new Date(s.createdAt).toLocaleDateString('pt-BR')
          : '—',
    },
    { header: 'Solicitante', cell: (s) => s.solicitanteNome || '—' },
    {
      header: 'Destino',
      cell: (s) => {
        const c = s.contractId ? contratosPorId.get(s.contractId) : undefined;
        return c ? `🏗️ ${String(c.name ?? '')}` : '🏢 Sede';
      },
    },
    {
      header: 'Itens',
      cell: (s) => {
        const n = parseItens(s.itens).length;
        return `${n} ${n === 1 ? 'item' : 'itens'}`;
      },
    },
    {
      header: 'Valor',
      cell: (s) =>
        s.status === 'pendente_avaliacao' ? (
          <span className="text-muted">—</span>
        ) : (
          <strong>{formatBRL(Number(s.valorTotal) || 0)}</strong>
        ),
    },
    {
      header: 'Etapa',
      cell: (s) => {
        const cfg = etapaCfg(s.status);
        return (
          <Badge style={{ background: cfg.bg, color: cfg.color, fontWeight: 700 }}>
            {cfg.label}
          </Badge>
        );
      },
    },
    {
      header: 'Ações',
      cell: (s) => (
        <div
          className="actions-cell"
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
        >
          <ActionLink
            label="Ver"
            onClick={() => setModal({ type: 'detalhe', solicitacao: s })}
          />
          {s.status === 'pendente_avaliacao' && (
            <>
              <ActionLink
                label="Avaliar/Precificar"
                color="#9A3412"
                onClick={() => setModal({ type: 'avaliar', solicitacao: s })}
              />
              <ActionLink
                label="Editar"
                onClick={() => setModal({ type: 'criar', solicitacao: s })}
              />
              <ActionLink
                label="Cancelar"
                color="#6B7280"
                onClick={() => handleCancelar(s)}
              />
              <ActionLink
                label="Excluir"
                danger
                onClick={() => handleExcluir(s)}
              />
            </>
          )}
          {s.status === 'pendente_aprovacao' && (
            <>
              <ActionLink
                label="Aprovar"
                color="#065F46"
                onClick={() => setModal({ type: 'aprovar', solicitacao: s })}
              />
              <ActionLink
                label="Rejeitar"
                color="#991B1B"
                onClick={() => handleRejeitar(s)}
              />
            </>
          )}
          {s.status === 'aprovada' && (
            <ActionLink
              label="Registrar compra"
              color="#1E40AF"
              onClick={() => setModal({ type: 'comprar', solicitacao: s })}
            />
          )}
          {s.status === 'comprada' && (
            <ActionLink
              label="Confirmar chegada"
              color="#3730A3"
              onClick={() => setModal({ type: 'receber', solicitacao: s })}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Solicitações de Compra</h1>
          <p className="page-subtitle">
            {todas.length} solicitaç{todas.length !== 1 ? 'ões' : 'ão'}
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => setModal({ type: 'criar', solicitacao: null })}
        >
          + Nova Solicitação
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <Kpi
          label="🟡 Aguardando equipe de compras"
          value={contar('pendente_avaliacao')}
          cor="#92400E"
        />
        <Kpi
          label="🟠 Aguardando gerente"
          value={contar('pendente_aprovacao')}
          cor="#9A3412"
          sub={`${formatBRL(totalAprovar)} para aprovar`}
        />
        <Kpi label="🔵 A comprar" value={contar('aprovada')} cor="#1E40AF" />
        <Kpi label="📦 A receber" value={contar('comprada')} cor="#3730A3" />
        <Kpi label="✅ Recebidas" value={contar('recebida')} cor="#065F46" />
      </div>

      <Card style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-lg)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--sp-md)',
          }}
        >
          <div>
            <label className="form-label">Etapa</label>
            <Select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              <option value="">Todas</option>
              {FILTRO_STATUS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="form-label">Contrato (após avaliação)</label>
            <Select
              value={filtroContrato}
              onChange={(e) => setFiltroContrato(e.target.value)}
            >
              <option value="">Todos</option>
              {(contractsQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.name ?? '')}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={lista}
        rowKey={(s) => s.id}
        emptyMessage="Nenhuma solicitação encontrada"
      />

      {modal?.type === 'criar' && (
        <CriarSolicitacaoModal
          solicitacao={modal.solicitacao}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'avaliar' && (
        <AvaliarModal
          solicitacao={modal.solicitacao}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'aprovar' && (
        <AprovarModal
          solicitacao={modal.solicitacao}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'comprar' && (
        <ComprarModal
          solicitacao={modal.solicitacao}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'receber' && (
        <ReceberModal
          solicitacao={modal.solicitacao}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'detalhe' && (
        <DetalheSolicitacaoModal
          solicitacao={modal.solicitacao}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
