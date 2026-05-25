import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Spinner from '../../components/ui/Spinner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/native-select';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatDateBR } from '../../lib/formatDate';
import type { Contract } from '../contracts/types';
import { useContracts } from '../contracts/queries';
import { useRecursos, useRemoveRecurso } from '../resources';
import type { Recurso } from '../../types/domain';
import { calcProximaFolga, normalizeCargo } from './proximaFolga';
import RecursoModal from './RecursoModal';
import FolgasModal from './FolgasModal';
import DistanciasModal from './DistanciasModal';
import MapaGeralModal from './MapaGeralModal';
import DocumentosModal from '../documentos/DocumentosModal';

const STATUS_BADGE: Record<string, { bg: string; cor: string; texto: string }> = {
  funcionario: { bg: '#D1FAE5', cor: '#065F46', texto: 'Funcionário' },
  candidato: { bg: '#DBEAFE', cor: '#1E40AF', texto: 'Candidato' },
  ex_funcionario: { bg: '#E5E7EB', cor: '#374151', texto: 'Ex-Funcionário' },
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

/** Célula de próxima folga. */
function FolgaCell({ recurso }: { recurso: Recurso }) {
  if (recurso.status !== 'funcionario' || !recurso.alocacaoAtual) return <>—</>;
  const info = calcProximaFolga(recurso);
  if (!info) return <>—</>;
  const { diasRestantes, dataProxima } = info;
  if (diasRestantes < 0) {
    return (
      <strong style={{ color: '#DC2626' }}>
        Vencida há {Math.abs(diasRestantes)}d
      </strong>
    );
  }
  if (diasRestantes === 0) {
    return <strong style={{ color: '#D97706' }}>Hoje</strong>;
  }
  const cor = diasRestantes <= 5 ? '#D97706' : '#059669';
  return (
    <span style={{ color: cor }}>
      {diasRestantes}d — {formatDateBR(dataProxima)}
    </span>
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
  | { type: 'novo' }
  | { type: 'mapa' }
  | { type: 'editar' | 'folgas' | 'docs' | 'distancias'; recurso: Recurso }
  | null;

/** Recursos Humanos — cadastro de colaboradores, folgas e alocação. */
export default function Recursos() {
  const toast = useToast();
  const recursosQuery = useRecursos();
  const contractsQuery = useContracts();
  const remover = useRemoveRecurso();

  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroProfissao, setFiltroProfissao] = useState('');
  const [modal, setModal] = useState<ModalState>(null);

  const recursos = useMemo(
    () => recursosQuery.data ?? [],
    [recursosQuery.data],
  );
  const contratosPorId = useMemo(() => {
    const mapa = new Map<string, Contract>();
    for (const c of contractsQuery.data ?? []) mapa.set(c.id, c);
    return mapa;
  }, [contractsQuery.data]);

  const profissoes = useMemo(() => {
    const set = new Set<string>();
    for (const r of recursos) {
      const c = normalizeCargo(r.profissao);
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [recursos]);

  if (recursosQuery.isLoading) {
    return <Spinner label="Carregando..." />;
  }
  if (recursosQuery.isError) {
    return (
      <div className="error-banner">
        Erro ao carregar recursos. Tente novamente.
      </div>
    );
  }

  const termo = busca.toLowerCase().trim();
  const filtrados = recursos.filter((r) => {
    const matchBusca =
      !termo ||
      [r.nome, r.cpf, r.profissao, r.endereco].some((c) =>
        String(c ?? '').toLowerCase().includes(termo),
      );
    const matchStatus = !filtroStatus || r.status === filtroStatus;
    const matchCargo =
      !filtroProfissao || normalizeCargo(r.profissao) === filtroProfissao;
    return matchBusca && matchStatus && matchCargo;
  });

  const ativos = recursos.filter((r) => r.status === 'funcionario').length;
  const candidatos = recursos.filter((r) => r.status === 'candidato').length;
  const exFunc = recursos.filter((r) => r.status === 'ex_funcionario').length;
  const alertasFolga = recursos.filter((r) => {
    if (r.status !== 'funcionario' || !r.alocacaoAtual) return false;
    const info = calcProximaFolga(r);
    return info != null && info.diasRestantes <= 5;
  }).length;

  function handleExcluir(r: Recurso) {
    if (!window.confirm('Excluir este cadastro?')) return;
    remover.mutate(r.id, {
      onSuccess: () => toast.show('Cadastro removido', 'success'),
      onError: (e) => toast.show(e.message, 'danger'),
    });
  }

  const columns: Column<Recurso>[] = [
    {
      header: 'Nome',
      cell: (r) => (
        <>
          <strong>{r.nome || '—'}</strong>
          {r.cpf && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                fontFamily: 'monospace',
              }}
            >
              {r.cpf}
            </div>
          )}
        </>
      ),
    },
    { header: 'Profissão', cell: (r) => normalizeCargo(r.profissao) || '—' },
    {
      header: 'Status',
      cell: (r) => {
        const b = STATUS_BADGE[r.status ?? ''];
        return b ? (
          <Badge style={{ background: b.bg, color: b.cor }}>
            {b.texto}
          </Badge>
        ) : (
          '—'
        );
      },
    },
    {
      header: 'Obra Atual',
      cell: (r) => {
        const id = r.alocacaoAtual?.contractId;
        const c = id ? contratosPorId.get(id) : undefined;
        return c ? String(c.name ?? '') : '—';
      },
    },
    { header: 'Próxima Folga', cell: (r) => <FolgaCell recurso={r} /> },
    {
      header: 'Ações',
      cell: (r) => (
        <div className="actions-cell" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {r.status === 'funcionario' && (
            <ActionLink
              label="Folgas"
              color="#7C3AED"
              onClick={() => setModal({ type: 'folgas', recurso: r })}
            />
          )}
          <ActionLink
            label="Docs"
            color="#2563EB"
            onClick={() => setModal({ type: 'docs', recurso: r })}
          />
          {r.lat && r.lng && (
            <ActionLink
              label="Distâncias"
              onClick={() => setModal({ type: 'distancias', recurso: r })}
            />
          )}
          <ActionLink
            label="Editar"
            onClick={() => setModal({ type: 'editar', recurso: r })}
          />
          <ActionLink
            label="Excluir"
            danger
            onClick={() => handleExcluir(r)}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Recursos Humanos</h1>
          <p className="page-subtitle">
            {recursos.length} pessoa{recursos.length !== 1 ? 's' : ''} cadastrada
            {recursos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => setModal({ type: 'mapa' })}
          >
            🗺 Mapa Geral
          </Button>
          <Button size="lg" onClick={() => setModal({ type: 'novo' })}>
            + Novo Cadastro
          </Button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <StatCard label="Funcionários Ativos" value={ativos} cor="#059669" icon="◉" />
        <StatCard label="Candidatos" value={candidatos} cor="#3182CE" icon="◎" />
        <StatCard label="Ex-Funcionários" value={exFunc} cor="#718096" icon="⊗" />
        {alertasFolga > 0 ? (
          <StatCard
            label="Folgas Próximas"
            value={alertasFolga}
            cor="#DC2626"
            icon="⚑"
          />
        ) : (
          <StatCard
            label="Total"
            value={recursos.length}
            cor="var(--color-primary)"
            icon="⊕"
          />
        )}
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
            placeholder="Buscar por nome, CPF, profissão..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <Select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            style={{ width: 200 }}
          >
            <option value="">Todos os status</option>
            <option value="funcionario">Funcionário Ativo</option>
            <option value="candidato">Candidato</option>
            <option value="ex_funcionario">Ex-Funcionário</option>
          </Select>
          <Select
            value={filtroProfissao}
            onChange={(e) => setFiltroProfissao(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="">Todas as funções</option>
            {profissoes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={filtrados}
        rowKey={(r) => r.id}
        emptyMessage="Nenhum cadastro encontrado"
        showColumnToggle
      />

      {modal?.type === 'novo' && (
        <RecursoModal recurso={null} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'editar' && (
        <RecursoModal recurso={modal.recurso} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'folgas' && (
        <FolgasModal
          recursoId={modal.recurso.id}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'docs' && (
        <DocumentosModal
          recursoId={modal.recurso.id}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'distancias' && (
        <DistanciasModal
          recurso={modal.recurso}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'mapa' && (
        <MapaGeralModal onClose={() => setModal(null)} />
      )}
    </>
  );
}
