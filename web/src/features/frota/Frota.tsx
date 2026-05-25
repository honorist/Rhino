import { useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import { Badge } from '../../components/ui/badge';
import Card from '../../components/ui/Card';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Spinner from '../../components/ui/Spinner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/native-select';
import { Combobox } from '../../components/ui/combobox';
import { toast } from 'sonner';
import type { Contract } from '../contracts/types';
import { useContracts } from '../contracts/queries';
import { useRemoveVeiculo, useVeiculos } from '../resources';
import type { Veiculo } from '../../types/domain';
import { proximaManut, type ProximaManut } from './proximaManut';
import VeiculoModal from './VeiculoModal';
import VeiculoDetalheModal from './VeiculoDetalheModal';
import DistanciasModal from './DistanciasModal';

const BADGE_CFG: Record<ProximaManut['status'], { bg: string; cor: string; label: string }> = {
  vigente: { bg: '#D1FAE5', cor: '#065F46', label: '✓ vigente' },
  proximo: { bg: '#FEF3C7', cor: '#92400E', label: '⚠ próximo' },
  vencido: { bg: '#FEE2E2', cor: '#991B1B', label: '✗ vencido' },
};

/** Badge da situação da próxima manutenção. */
function ManutBadge({ prox }: { prox: ProximaManut | null }) {
  if (!prox) {
    return (
      <Badge style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 12 }}>
        sem plano
      </Badge>
    );
  }
  const cfg = BADGE_CFG[prox.status];
  return (
    <Badge
      title={prox.label}
      style={{ background: cfg.bg, color: cfg.cor, fontSize: 12, fontWeight: 700 }}
    >
      {cfg.label}
    </Badge>
  );
}

function StatKpi({ label, value, cor }: { label: string; value: number; cor?: string }) {
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
    </Card>
  );
}

function statusLabel(status?: string): string {
  if (status === 'manutencao') return '🔧 Manut.';
  if (status === 'inativo') return '⏸ Inativo';
  return '✓ Ativo';
}

type ModalState =
  | { type: 'novo' | 'editar' | 'distancias'; veiculo: Veiculo | null }
  | { type: 'detalhe'; veiculoId: string }
  | null;

/** Frota / Veículos — pool global com plano de manutenção. */
export default function Frota() {
  const veiculosQuery = useVeiculos();
  const contractsQuery = useContracts();
  const remover = useRemoveVeiculo();

  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroContrato, setFiltroContrato] = useState('');
  const [modal, setModal] = useState<ModalState>(null);

  const veiculos = useMemo(
    () => veiculosQuery.data ?? [],
    [veiculosQuery.data],
  );
  const contratosPorId = useMemo(() => {
    const mapa = new Map<string, Contract>();
    for (const c of contractsQuery.data ?? []) mapa.set(c.id, c);
    return mapa;
  }, [contractsQuery.data]);

  if (veiculosQuery.isLoading) {
    return <Spinner label="Carregando frota..." />;
  }
  if (veiculosQuery.isError) {
    return <div className="error-banner">Erro ao carregar a frota.</div>;
  }

  const termo = busca.toLowerCase().trim();
  const lista = veiculos.filter((v) => {
    if (
      termo &&
      ![v.placa, v.modelo, v.marca].some((campo) =>
        String(campo ?? '').toLowerCase().includes(termo),
      )
    ) {
      return false;
    }
    if (filtroStatus && v.status !== filtroStatus) return false;
    if (filtroContrato && v.contractId !== filtroContrato) return false;
    return true;
  });

  const proxs = veiculos.map((v) => proximaManut(v));
  const kpiVencidos = proxs.filter((p) => p?.status === 'vencido').length;
  const kpiProximos = proxs.filter((p) => p?.status === 'proximo').length;
  const kpiManut = veiculos.filter((v) => v.status === 'manutencao').length;

  function handleExcluir(v: Veiculo) {
    if (
      !window.confirm(
        'Excluir este veículo? Histórico de manutenções e plano serão apagados.',
      )
    ) {
      return;
    }
    remover.mutate(v.id, {
      onSuccess: () => toast.success('Veículo excluído'),
      onError: (e) => toast.error(e.message),
    });
  }

  function handleDistancias(v: Veiculo) {
    if (!v.lat || !v.lng) {
      toast.error('Veículo sem localização cadastrada');
      return;
    }
    setModal({ type: 'distancias', veiculo: v });
  }

  const columns: Column<Veiculo>[] = [
    {
      header: 'Placa',
      cell: (v) => <strong>{v.placa || '—'}</strong>,
    },
    {
      header: 'Veículo',
      cell: (v) => (
        <>
          {`${v.marca ?? ''} ${v.modelo ?? ''}`.trim() || '—'}
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {v.tipo ?? ''}
            {v.ano ? ` · ${v.ano}` : ''}
          </div>
        </>
      ),
    },
    {
      header: 'Contrato',
      cell: (v) => {
        const c = v.contractId ? contratosPorId.get(v.contractId) : undefined;
        return c ? String(c.name ?? '') : <span className="text-muted">—</span>;
      },
    },
    {
      header: 'KM atual',
      cell: (v) => `${(v.kmAtual ?? 0).toLocaleString('pt-BR')} km`,
    },
    {
      header: 'Próx. manutenção',
      cell: (v) => {
        const prox = proximaManut(v);
        return (
          <>
            <ManutBadge prox={prox} />
            {prox && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {prox.plano.descricao}
              </div>
            )}
          </>
        );
      },
    },
    {
      header: 'Localização',
      cell: (v) => {
        const cidade = String(v.endereco ?? '')
          .split(',')
          .slice(0, 2)
          .join(', ')
          .trim();
        return cidade ? (
          <span style={{ fontSize: 13 }}>{cidade}</span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    { header: 'Status', cell: (v) => statusLabel(v.status) },
    {
      header: 'Ações',
      cell: (v) => (
        <div
          className="actions-cell"
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
        >
          <a
            className="action-link"
            style={{ cursor: 'pointer' }}
            onClick={() => setModal({ type: 'detalhe', veiculoId: v.id })}
          >
            Detalhes
          </a>
          <a
            className="action-link"
            style={{ cursor: 'pointer' }}
            onClick={() => setModal({ type: 'editar', veiculo: v })}
          >
            Editar
          </a>
          <a
            className="action-link"
            style={{ cursor: 'pointer' }}
            onClick={() => handleDistancias(v)}
          >
            Distâncias
          </a>
          <a
            className="action-link danger"
            style={{ cursor: 'pointer' }}
            onClick={() => handleExcluir(v)}
          >
            Excluir
          </a>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Frota</h1>
          <p className="page-subtitle">
            {veiculos.length} veículo{veiculos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="lg" onClick={() => setModal({ type: 'novo', veiculo: null })}>
          + Novo Veículo
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
        <StatKpi label="Total" value={veiculos.length} />
        <StatKpi label="Em manutenção" value={kpiManut} cor="#92400E" />
        <StatKpi label="Próximas" value={kpiProximos} cor="#92400E" />
        <StatKpi label="Manutenções vencidas" value={kpiVencidos} cor="#991B1B" />
      </div>

      <Card style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-lg)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 200px 240px',
            gap: 'var(--sp-md)',
          }}
        >
          <Input
            placeholder="🔍 Buscar por placa, modelo ou marca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
          >
            <option value="">Todos status</option>
            <option value="ativo">Ativos</option>
            <option value="manutencao">Em manutenção</option>
            <option value="inativo">Inativos</option>
          </Select>
          <Combobox
            options={[
              { value: '', label: 'Todos os contratos' },
              ...(contractsQuery.data ?? []).map((c) => ({ value: c.id, label: String(c.name ?? '') })),
            ]}
            value={filtroContrato}
            onChange={setFiltroContrato}
            placeholder="Todos os contratos"
            searchPlaceholder="Pesquisar contrato..."
            emptyText="Nenhum contrato encontrado."
          />
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={lista}
        rowKey={(v) => v.id}
        emptyMessage="Nenhum veículo cadastrado"
        showColumnToggle
      />

      {(modal?.type === 'novo' || modal?.type === 'editar') && (
        <VeiculoModal
          veiculo={modal.veiculo}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'detalhe' && (
        <VeiculoDetalheModal
          veiculoId={modal.veiculoId}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'distancias' && modal.veiculo && (
        <DistanciasModal
          veiculo={modal.veiculo}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
