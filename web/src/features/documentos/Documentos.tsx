import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Spinner from '../../components/ui/Spinner';
import { Input, Select } from '../../components/ui/controls';
import type { Contract } from '../contracts/types';
import { useContracts } from '../contracts/queries';
import { useRecursos } from '../resources';
import type { Documento, Recurso } from '../../types/domain';
import { conformidade, statusDoc, type ConformidadeStatus } from './conformidade';
import DocumentosModal from './DocumentosModal';
import FichaColaboradorModal from './FichaColaboradorModal';

const STATUS_DOC_COR: Record<string, string> = {
  vigente: '#059669',
  vencendo: '#D97706',
  vencido: '#DC2626',
  pendente: '#9CA3AF',
};

const CONF_LABEL: Record<ConformidadeStatus, { texto: string; cor: string }> = {
  ok: { texto: '● Em dia', cor: '#059669' },
  atencao: { texto: '● Atenção', cor: '#D97706' },
  critico: { texto: '● Crítico', cor: '#DC2626' },
  sem_docs: { texto: '— Sem docs', cor: '#374151' },
};

function StatCard({
  label,
  value,
  cor,
  icon,
}: {
  label: string;
  value: number;
  cor: string;
  icon: string;
}) {
  return (
    <Card style={{ padding: 'var(--sp-lg)', textAlign: 'center' }}>
      <div style={{ fontSize: 28, color: cor, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{value}</div>
      <div style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>
        {label}
      </div>
    </Card>
  );
}

function ScoreBar({ score }: { score: number }) {
  const cor = score === 100 ? '#059669' : score >= 70 ? '#D97706' : '#DC2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: 'var(--color-border)',
          borderRadius: 3,
          overflow: 'hidden',
          minWidth: 60,
        }}
      >
        <div
          style={{ height: '100%', width: `${score}%`, background: cor }}
        />
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color: cor, minWidth: 32 }}>
        {score}%
      </span>
    </div>
  );
}

function DocBadges({ docs }: { docs: Documento[] }) {
  if (docs.length === 0) {
    return (
      <span style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>
        Nenhum
      </span>
    );
  }
  return (
    <>
      {docs.slice(0, 4).map((d) => {
        const cor = STATUS_DOC_COR[statusDoc(d)] ?? '#9CA3AF';
        const label = d.tipoLabel || d.tipo || '?';
        return (
          <span
            key={d.id}
            title={label}
            style={{
              display: 'inline-block',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 15,
              fontWeight: 700,
              background: `${cor}22`,
              color: cor,
              border: `1px solid ${cor}44`,
              margin: 1,
            }}
          >
            {label.length > 7 ? label.slice(0, 7) : label}
          </span>
        );
      })}
      {docs.length > 4 && (
        <span style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>
          {' '}
          +{docs.length - 4}
        </span>
      )}
    </>
  );
}

type ModalState =
  | { type: 'docs' | 'ficha'; recursoId: string }
  | null;

/** Documentação — controle de conformidade documental dos colaboradores. */
export default function Documentos() {
  const navigate = useNavigate();
  const recursosQuery = useRecursos();
  const contractsQuery = useContracts();

  const [busca, setBusca] = useState('');
  const [filtroConf, setFiltroConf] = useState('');
  const [modal, setModal] = useState<ModalState>(null);

  const contratosPorId = useMemo(() => {
    const mapa = new Map<string, Contract>();
    for (const c of contractsQuery.data ?? []) mapa.set(c.id, c);
    return mapa;
  }, [contractsQuery.data]);

  if (recursosQuery.isLoading) {
    return <Spinner label="Carregando..." />;
  }
  if (recursosQuery.isError) {
    return <div className="error-banner">Erro ao carregar. Tente novamente.</div>;
  }

  const funcionarios = (recursosQuery.data ?? []).filter(
    (r) => r.status === 'funcionario',
  );
  const termo = busca.toLowerCase().trim();

  const filtrados = funcionarios.filter((r) => {
    const matchBusca =
      !termo ||
      String(r.nome ?? '').toLowerCase().includes(termo) ||
      String(r.profissao ?? '').toLowerCase().includes(termo);
    const conf = conformidade(r.documentos ?? []);
    const matchConf = !filtroConf || conf.status === filtroConf;
    return matchBusca && matchConf;
  });

  const totalAtivos = funcionarios.length;
  const comDocs = funcionarios.filter(
    (r) => (r.documentos ?? []).length > 0,
  ).length;
  const criticos = funcionarios.filter(
    (r) => conformidade(r.documentos ?? []).status === 'critico',
  ).length;
  const vencendo30 = funcionarios.reduce(
    (acc, r) =>
      acc +
      (r.documentos ?? []).filter((d) => statusDoc(d) === 'vencendo').length,
    0,
  );

  function obraDe(r: Recurso): string {
    const id = r.alocacaoAtual?.contractId;
    if (!id) return '—';
    const c = contratosPorId.get(id);
    return c ? String(c.name ?? '') : '—';
  }

  const columns: Column<Recurso>[] = [
    {
      header: 'Funcionário',
      cell: (r) => (
        <>
          <a
            className="action-link"
            style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15 }}
            onClick={() => setModal({ type: 'ficha', recursoId: r.id })}
          >
            {r.nome || '—'}
          </a>
          {r.profissao && (
            <div style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>
              {r.profissao}
            </div>
          )}
        </>
      ),
    },
    { header: 'Obra Atual', cell: (r) => obraDe(r) },
    {
      header: 'Conformidade',
      cell: (r) => {
        const docs = r.documentos ?? [];
        const conf = conformidade(docs);
        const info = CONF_LABEL[conf.status];
        return (
          <>
            <span style={{ color: info.cor, fontWeight: 600 }}>
              {info.texto}
            </span>
            {docs.length > 0 && <ScoreBar score={conf.score} />}
          </>
        );
      },
    },
    {
      header: 'Documentos',
      cell: (r) => <DocBadges docs={r.documentos ?? []} />,
    },
    {
      header: 'Ações',
      cell: (r) => {
        const n = (r.documentos ?? []).length;
        return (
          <Button
            size="sm"
            onClick={() => setModal({ type: 'docs', recursoId: r.id })}
          >
            {n > 0 ? `Ver ${n} doc${n !== 1 ? 's' : ''}` : '+ Adicionar'}
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Documentação</h1>
          <p className="page-subtitle">
            Controle de conformidade documental — {totalAtivos} funcionário
            {totalAtivos !== 1 ? 's' : ''} ativo{totalAtivos !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="lg" onClick={() => navigate('/configuracao')}>
          Gerenciar Templates
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
        <StatCard
          label="Funcionários Ativos"
          value={totalAtivos}
          cor="var(--color-primary)"
          icon="◉"
        />
        <StatCard
          label="Com Documentação"
          value={comDocs}
          cor="#059669"
          icon="✓"
        />
        {criticos > 0 ? (
          <StatCard
            label="Docs Vencidos"
            value={criticos}
            cor="#DC2626"
            icon="✕"
          />
        ) : (
          <StatCard
            label="Docs em Dia"
            value={totalAtivos - criticos}
            cor="#059669"
            icon="✓"
          />
        )}
        <StatCard
          label="Vencem em 30 dias"
          value={vencendo30}
          cor={vencendo30 > 0 ? '#D97706' : '#059669'}
          icon={vencendo30 > 0 ? '⚑' : '✓'}
        />
      </div>

      <Card style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-lg)' }}>
        <div
          style={{
            display: 'flex',
            gap: 'var(--sp-md)',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Input
            placeholder="Buscar por nome, profissão..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <Select
            value={filtroConf}
            onChange={(e) => setFiltroConf(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="">Todos os funcionários</option>
            <option value="ok">Em dia (100%)</option>
            <option value="atencao">Com atenção</option>
            <option value="critico">Crítico (vencidos)</option>
            <option value="sem_docs">Sem documentos</option>
          </Select>
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={filtrados}
        rowKey={(r) => r.id}
        emptyMessage="Nenhum resultado encontrado"
      />

      {modal?.type === 'docs' && (
        <DocumentosModal
          recursoId={modal.recursoId}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'ficha' && (
        <FichaColaboradorModal
          recursoId={modal.recursoId}
          onClose={() => setModal(null)}
          onVerDocumentos={() =>
            setModal({ type: 'docs', recursoId: modal.recursoId })
          }
        />
      )}
    </>
  );
}
