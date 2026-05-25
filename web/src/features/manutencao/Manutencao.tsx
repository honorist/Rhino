import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Spinner from '../../components/ui/Spinner';
import { Select } from '../../components/ui/controls';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatDateBR, todayISO } from '../../lib/formatDate';
import type { Contract } from '../contracts/types';
import { useContracts } from '../contracts/queries';
import { useManutencoes, useRemoveManutencao } from '../resources';
import type { Manutencao, ManutencaoStatus } from '../../types/domain';
import { useCancelarManutencao } from './queries';
import {
  AprovarModal,
  AvaliarModal,
  NovaManutencaoModal,
  RetornoModal,
} from './ManutencaoModals';

interface StatusCfg {
  label: string;
  bg: string;
  cor: string;
}

const STATUS_CFG: Record<ManutencaoStatus, StatusCfg> = {
  solicitada: { label: '📋 A avaliar', bg: '#E0E7FF', cor: '#3730A3' },
  pendente_aprovacao: {
    label: '🟡 Aguardando aprovação',
    bg: '#FEF3C7',
    cor: '#92400E',
  },
  aprovada: { label: '🔧 Em manutenção', bg: '#FFEDD5', cor: '#9A3412' },
  retornado: { label: '✅ Retornado', bg: '#D1FAE5', cor: '#065F46' },
  rejeitada: { label: '❌ Rejeitada', bg: '#FEE2E2', cor: '#991B1B' },
  cancelada: { label: '⛔ Cancelada', bg: '#E5E7EB', cor: '#374151' },
};

const FILTRO_OPCOES: { value: ManutencaoStatus; label: string }[] = [
  { value: 'solicitada', label: '📋 A avaliar' },
  { value: 'pendente_aprovacao', label: '🟡 Aguardando aprovação' },
  { value: 'aprovada', label: '🔧 Em manutenção' },
  { value: 'retornado', label: '✅ Retornado' },
  { value: 'rejeitada', label: '❌ Rejeitada' },
  { value: 'cancelada', label: '⛔ Cancelada' },
];

function statusCfg(status: string): StatusCfg {
  return (
    STATUS_CFG[status as ManutencaoStatus] ?? {
      label: status || '—',
      bg: '#E5E7EB',
      cor: '#374151',
    }
  );
}

/** Manutenção aprovada cuja previsão de retorno já passou. */
function isAtrasada(m: Manutencao): boolean {
  return (
    m.status === 'aprovada' &&
    Boolean(m.dataRetornoPrevista) &&
    String(m.dataRetornoPrevista).slice(0, 10) < todayISO()
  );
}

/** Dias corridos desde uma data até hoje. */
function diasDesde(de?: string): number | null {
  if (!de) return null;
  const d1 = new Date(`${de.slice(0, 10)}T12:00:00`).getTime();
  const d2 = new Date(`${todayISO()}T12:00:00`).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return null;
  return Math.floor((d2 - d1) / 86_400_000);
}

interface StatCardProps {
  label: string;
  value: number;
  cor: string;
  icon: string;
}

function StatCard({ label, value, cor, icon }: StatCardProps) {
  return (
    <Card style={{ padding: 'var(--sp-lg)', textAlign: 'center' }}>
      <div style={{ fontSize: 26, color: cor, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{value}</div>
      <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
        {label}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c = statusCfg(status);
  return (
    <Badge style={{ background: c.bg, color: c.cor }}>
      {c.label}
    </Badge>
  );
}

/** Link de ação inline da tabela. */
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

type ModalType = 'nova' | 'avaliar' | 'aprovar' | 'retorno' | null;

interface ModalState {
  type: ModalType;
  manutencao: Manutencao | null;
}

/** Manutenção de Equipamentos — lista + fluxo de aprovação. */
export default function ManutencaoView() {
  const toast = useToast();
  const manutencoesQuery = useManutencoes();
  const contractsQuery = useContracts();
  const cancelar = useCancelarManutencao();
  const excluir = useRemoveManutencao();

  const [filtroStatus, setFiltroStatus] = useState('');
  const [modal, setModal] = useState<ModalState>({
    type: null,
    manutencao: null,
  });

  const todas = useMemo(
    () => manutencoesQuery.data ?? [],
    [manutencoesQuery.data],
  );
  const contratosPorId = useMemo(() => {
    const mapa = new Map<string, Contract>();
    for (const c of contractsQuery.data ?? []) mapa.set(c.id, c);
    return mapa;
  }, [contractsQuery.data]);

  function nomeOrigem(contractId?: string | null): string {
    if (!contractId) return '🏢 Sede';
    const c = contratosPorId.get(contractId);
    return c ? `🏗️ ${String(c.name ?? 'Obra')}` : '🏗️ Obra';
  }

  if (manutencoesQuery.isLoading) {
    return <Spinner label="Carregando manutenções..." />;
  }
  if (manutencoesQuery.isError) {
    return (
      <div className="error-banner">
        Erro ao carregar manutenções. Tente novamente.
      </div>
    );
  }

  const filtradas = filtroStatus
    ? todas.filter((m) => m.status === filtroStatus)
    : todas;

  const aAvaliar = todas.filter((m) => m.status === 'solicitada').length;
  const aAprovar = todas.filter(
    (m) => m.status === 'pendente_aprovacao',
  ).length;
  const emManutencao = todas.filter((m) => m.status === 'aprovada').length;
  const atrasadas = todas.filter(isAtrasada).length;

  function handleCancelar(m: Manutencao) {
    if (!window.confirm('Cancelar esta manutenção?')) return;
    cancelar.mutate(m.id, {
      onSuccess: () => toast.show('Manutenção cancelada', 'success'),
      onError: (e) => toast.show(e.message, 'danger'),
    });
  }

  function handleExcluir(m: Manutencao) {
    if (
      !window.confirm(
        'Excluir este registro de manutenção? Esta ação não pode ser desfeita.',
      )
    ) {
      return;
    }
    excluir.mutate(m.id, {
      onSuccess: () => toast.show('Registro excluído', 'success'),
      onError: (e) => toast.show(e.message, 'danger'),
    });
  }

  const columns: Column<Manutencao>[] = [
    {
      header: 'Equipamento',
      cell: (m) => (
        <>
          <strong>{m.equipamento || '—'}</strong>
          {m.problema && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {m.problema}
            </div>
          )}
          {m.solicitanteNome && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              por {m.solicitanteNome}
            </div>
          )}
        </>
      ),
    },
    { header: 'Origem', cell: (m) => nomeOrigem(m.contractId) },
    { header: 'Oficina', cell: (m) => m.oficina || '—' },
    {
      header: 'Enviado',
      cell: (m) => {
        const dias = m.status === 'aprovada' ? diasDesde(m.dataEnvio) : null;
        return (
          <>
            {formatDateBR(m.dataEnvio)}
            {dias != null && dias >= 0 && (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                há {dias} dia{dias !== 1 ? 's' : ''}
              </div>
            )}
          </>
        );
      },
    },
    {
      header: 'Previsão',
      cell: (m) => {
        if (!m.dataRetornoPrevista) return '—';
        const atrasada = isAtrasada(m);
        return (
          <span
            style={{
              color: atrasada ? '#DC2626' : 'inherit',
              fontWeight: atrasada ? 700 : 400,
            }}
          >
            {formatDateBR(m.dataRetornoPrevista)}
            {atrasada ? ' ⏰' : ''}
          </span>
        );
      },
    },
    {
      header: 'Retorno',
      cell: (m) =>
        m.status === 'retornado' ? formatDateBR(m.dataRetorno) : '—',
    },
    { header: 'Status', cell: (m) => <StatusBadge status={m.status} /> },
    {
      header: 'Ações',
      cell: (m) => (
        <div className="actions-cell">
          {m.status === 'solicitada' && (
            <>
              <ActionLink
                label="Avaliar"
                color="#4F46E5"
                onClick={() => setModal({ type: 'avaliar', manutencao: m })}
              />
              <ActionLink
                label="Editar"
                onClick={() => setModal({ type: 'nova', manutencao: m })}
              />
              <ActionLink
                label="Cancelar"
                color="#D97706"
                onClick={() => handleCancelar(m)}
              />
            </>
          )}
          {m.status === 'pendente_aprovacao' && (
            <>
              <ActionLink
                label="Aprovar / rejeitar"
                color="#059669"
                onClick={() => setModal({ type: 'aprovar', manutencao: m })}
              />
              <ActionLink
                label="Cancelar"
                color="#D97706"
                onClick={() => handleCancelar(m)}
              />
            </>
          )}
          {m.status === 'aprovada' && (
            <>
              <ActionLink
                label="Registrar retorno"
                color="#059669"
                onClick={() => setModal({ type: 'retorno', manutencao: m })}
              />
              <ActionLink
                label="Cancelar"
                color="#D97706"
                onClick={() => handleCancelar(m)}
              />
            </>
          )}
          <ActionLink label="Excluir" danger onClick={() => handleExcluir(m)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manutenção de Equipamentos</h1>
          <p className="page-subtitle">
            {todas.length} registro{todas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => setModal({ type: 'nova', manutencao: null })}
        >
          + Solicitar Manutenção
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <StatCard label="A avaliar" value={aAvaliar} cor="#4F46E5" icon="📋" />
        <StatCard
          label="Aguardando aprovação"
          value={aAprovar}
          cor="#D97706"
          icon="🟡"
        />
        <StatCard
          label="Em manutenção"
          value={emManutencao}
          cor="#EA580C"
          icon="🔧"
        />
        <StatCard
          label="Atrasados"
          value={atrasadas}
          cor={atrasadas > 0 ? '#DC2626' : '#718096'}
          icon="⏰"
        />
      </div>

      <Card
        className="mb-2xl"
        style={{
          background: 'rgba(49,130,206,.05)',
          borderLeft: '4px solid var(--color-info)',
          padding: 'var(--sp-sm) var(--sp-md)',
        }}
      >
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <strong>ℹ️ Como funciona:</strong> qualquer pessoa{' '}
          <strong>solicita</strong> a manutenção (equipamento + problema). A{' '}
          <strong>equipe de compras</strong> avalia — define oficina, prazo e
          custo. A <strong>gerência</strong> aprova. Depois, registra-se o
          retorno do equipamento.
        </div>
      </Card>

      <Card style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-lg)' }}>
        <Select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          style={{ width: 260 }}
        >
          <option value="">Todos os status</option>
          {FILTRO_OPCOES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Card>

      <DataTable
        columns={columns}
        rows={filtradas}
        rowKey={(m) => m.id}
        emptyMessage={
          filtroStatus
            ? 'Nenhum registro neste status'
            : 'Nenhuma solicitação. Clique em "+ Solicitar Manutenção".'
        }
      />

      {modal.type === 'nova' && (
        <NovaManutencaoModal
          manutencao={modal.manutencao}
          onClose={() => setModal({ type: null, manutencao: null })}
        />
      )}
      {modal.type === 'avaliar' && modal.manutencao && (
        <AvaliarModal
          manutencao={modal.manutencao}
          nomeOrigem={nomeOrigem(modal.manutencao.contractId)}
          onClose={() => setModal({ type: null, manutencao: null })}
        />
      )}
      {modal.type === 'aprovar' && modal.manutencao && (
        <AprovarModal
          manutencao={modal.manutencao}
          nomeOrigem={nomeOrigem(modal.manutencao.contractId)}
          onClose={() => setModal({ type: null, manutencao: null })}
        />
      )}
      {modal.type === 'retorno' && modal.manutencao && (
        <RetornoModal
          manutencao={modal.manutencao}
          nomeOrigem={nomeOrigem(modal.manutencao.contractId)}
          onClose={() => setModal({ type: null, manutencao: null })}
        />
      )}
    </>
  );
}
