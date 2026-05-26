import { useState, type ComponentType } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/button';
import Card from '../../components/ui/card';
import Spinner from '../../components/ui/spinner';
import { toast } from 'sonner';
import { formatDateBR } from '../../lib/formatDate';
import { useContracts, useDeleteContract } from './queries';
import type { Contract } from './types';
import ContratoModal from './ContratoModal';
import GerarDocumentoModal from './GerarDocumentoModal';
import VisaoGeralTab from './VisaoGeralTab';
import FinanceiroTab from './FinanceiroTab';
import CronogramaTab from './CronogramaTab';
import OrganogramaTab from './OrganogramaTab';
import RdoTab from './RdoTab';
import PendenciasTab from './PendenciasTab';
import AditivosTab from './AditivosTab';
import MarcosTab from './MarcosTab';
import OcorrenciasTab from './OcorrenciasTab';
import TimelineTab from './TimelineTab';

/** Props recebidas por cada aba do detalhe de contrato. */
export interface ContratoTabProps {
  contract: Contract;
}

interface TabDef {
  id: string;
  label: string;
  /** Componente da aba; ausente = ainda não migrada (Placeholder). */
  Component?: ComponentType<ContratoTabProps>;
}

/**
 * Abas do detalhe de contrato. Cada turno da Onda E migra uma e preenche
 * `Component`. Enquanto isso, a aba renderiza um aviso "em construção".
 */
const TABS: TabDef[] = [
  { id: 'visao', label: 'Visão Geral', Component: VisaoGeralTab },
  { id: 'financeiro', label: 'Financeiro', Component: FinanceiroTab },
  { id: 'cronograma', label: 'Cronograma', Component: CronogramaTab },
  { id: 'equipe', label: 'Equipe', Component: OrganogramaTab },
  { id: 'rdo', label: 'RDO', Component: RdoTab },
  { id: 'pendencias', label: 'Pendências', Component: PendenciasTab },
  { id: 'aditivos', label: 'Aditivos', Component: AditivosTab },
  { id: 'marcos', label: 'Marcos', Component: MarcosTab },
  { id: 'ocorrencias', label: 'Ocorrências', Component: OcorrenciasTab },
  { id: 'timeline', label: 'Timeline', Component: TimelineTab },
];

function TabPlaceholder({ label }: { label: string }) {
  return (
    <Card style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🚧</div>
      <div style={{ fontWeight: 600 }}>Aba "{label}" em migração</div>
      <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
        Esta seção será migrada num dos próximos turnos da Onda E.
      </div>
    </Card>
  );
}

/** Editor de detalhe do contrato — orquestrador de abas (porte de ContratoDetail.js). */
function ContratoDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const contractsQuery = useContracts();
  const deletar = useDeleteContract();
  const [tab, setTab] = useState('visao');
  const [editando, setEditando] = useState(false);
  const [gerandoDoc, setGerandoDoc] = useState(false);

  const contract = (contractsQuery.data ?? []).find((c) => c.id === id);

  if (contractsQuery.isLoading) {
    return <Spinner label="Carregando contrato..." />;
  }
  if (contractsQuery.isError || !contract) {
    return <div className="error-banner">Contrato não encontrado.</div>;
  }

  function handleExcluir() {
    if (!contract) return;
    if (!window.confirm(`Excluir o contrato "${contract.name}"?`)) return;
    deletar.mutate(contract.id, {
      onSuccess: () => {
        toast.success('Contrato excluído');
        navigate('/contratos');
      },
      onError: (e) => toast.error(e.message),
    });
  }

  const ativo = TABS.find((t) => t.id === tab) ?? TABS[0];
  const ActiveTab = ativo.Component;

  return (
    <>
      <nav
        style={{
          fontSize: 13,
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--sp-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Link
          to="/contratos"
          style={{ color: 'var(--color-primary)', fontWeight: 600 }}
        >
          Contratos
        </Link>
        <span style={{ opacity: 0.5 }}>›</span>
        <span style={{ color: 'var(--color-text)' }}>{contract.name}</span>
        {contract.contractNumber && (
          <>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
              #{contract.contractNumber}
            </span>
          </>
        )}
      </nav>

      <div className="page-header" style={{ marginBottom: 'var(--sp-md)' }}>
        <div>
          <h1 className="page-title">{contract.name}</h1>
          <p className="page-subtitle">{contract.client}</p>
          <div style={{ marginTop: 6 }}>
            <Badge
              variant={
                contract.status === 'ativo' ? 'success' :
                contract.status === 'cancelado' || contract.status === 'nao_aprovado' ? 'destructive' :
                contract.status === 'pausado' || contract.status === 'nao_iniciado' ? 'warning' : 'secondary'
              }
            >
              {contract.status.replace('_', ' ').toUpperCase()}
            </Badge>
            {(contract.startDate || contract.endDate) && (
              <span
                className="text-muted"
                style={{ marginLeft: 'var(--sp-md)', fontSize: 13 }}
              >
                {formatDateBR(contract.startDate)} até{' '}
                {formatDateBR(contract.endDate)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setGerandoDoc(true)}>
            📋 Template
          </Button>
          <Button variant="secondary" onClick={() => setEditando(true)}>
            ✏️ Editar Dados
          </Button>
          <Button
            variant="danger"
            onClick={handleExcluir}
            disabled={deletar.isPending}
          >
            🗑️ Excluir
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/contratos">← Voltar</Link>
          </Button>
        </div>
      </div>

      <Card
        style={{ padding: 0, marginBottom: 16 }}
      >
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e2e8f0',
            overflowX: 'auto',
            padding: '0 8px',
          }}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  padding: '14px 18px',
                  border: 'none',
                  background: 'none',
                  fontWeight: active ? 600 : 400,
                  color: active ? '#1F497D' : '#64748b',
                  borderBottom: `3px solid ${active ? '#1F497D' : 'transparent'}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="tab-content">
        {ActiveTab ? (
          <ActiveTab contract={contract} />
        ) : (
          <TabPlaceholder label={ativo.label} />
        )}
      </div>

      {editando && (
        <ContratoModal
          contract={contract}
          isEdit
          onClose={() => setEditando(false)}
        />
      )}
      {gerandoDoc && (
        <GerarDocumentoModal
          contract={contract}
          onClose={() => setGerandoDoc(false)}
        />
      )}
    </>
  );
}

/**
 * Detalhe do Contrato (/contratos/:id) — porte de js/views/ContratoDetail.js.
 * `key={id}` força remontagem (estado de aba limpo) ao trocar de contrato.
 */
export default function ContratoDetail() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <div className="error-banner">Contrato não informado.</div>;
  }
  return <ContratoDetailView key={id} id={id} />;
}
