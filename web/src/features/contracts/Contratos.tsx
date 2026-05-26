import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/button';
import Card from '../../components/ui/card';
import Spinner from '../../components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/native-select';
import { toast } from 'sonner';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import { downloadCsv } from '../../lib/downloadCsv';
import { useRecursos } from '../resources';
import { useRdos } from '../rdos/queries';
import { useContracts, useDeleteContract, useSaidas, useUpdateContract } from './queries';
import type { Contract, ContractStatus } from './types';
import ContratoModal from './ContratoModal';
import DataTable, { type BulkAction, type Column } from '../../components/ui/data-table';

const FAVS_KEY = 'rhino-favs';
const PAGE_SIZE = 25;

const STATUS_CHIPS: { v: string; l: string }[] = [
  { v: 'todos', l: 'Todos' },
  { v: 'ativo', l: 'Ativo' },
  { v: 'prospeccao', l: 'Prospecção' },
  { v: 'nao_aprovado', l: 'Não aprovado' },
  { v: 'nao_iniciado', l: 'Não iniciado' },
  { v: 'pausado', l: 'Pausado' },
  { v: 'concluido', l: 'Concluído' },
  { v: 'cancelado', l: 'Cancelado' },
];

const STATUS_VALIDOS: ContractStatus[] = [
  'prospeccao',
  'nao_aprovado',
  'nao_iniciado',
  'ativo',
  'pausado',
  'concluido',
  'cancelado',
];

const STATUS_LABEL: Record<ContractStatus, string> = {
  prospeccao: 'Prospecção',
  nao_aprovado: 'Não aprovado',
  nao_iniciado: 'Não iniciado',
  ativo: 'Ativo',
  pausado: 'Pausado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

function loadFavs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

type ModalState =
  | { type: 'novo' }
  | { type: 'editar' | 'duplicar'; contract: Contract }
  | null;

/** Lista de Contratos — porte de js/views/Contratos.js. */
export default function Contratos() {
  const navigate = useNavigate();
  const contractsQuery = useContracts();
  const saidasQuery = useSaidas();
  const recursosQuery = useRecursos();
  const rdosQuery = useRdos();
  const deletar = useDeleteContract();
  const atualizar = useUpdateContract();

  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [busca, setBusca] = useState('');
  const [favs, setFavs] = useState<Set<string>>(loadFavs);
  const [modal, setModal] = useState<ModalState>(null);

  const contratos = useMemo(
    () => contractsQuery.data ?? [],
    [contractsQuery.data],
  );

  const medidoPorContrato = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const s of saidasQuery.data ?? []) {
      const cid = String(s.contractId ?? '');
      if (cid) {
        mapa.set(cid, (mapa.get(cid) ?? 0) + (Number(s.value) || 0));
      }
    }
    return mapa;
  }, [saidasQuery.data]);

  const alocadosPorContrato = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of recursosQuery.data ?? []) {
      const cid = r.alocacaoAtual?.contractId;
      if (r.status === 'funcionario' && cid) {
        mapa.set(cid, (mapa.get(cid) ?? 0) + 1);
      }
    }
    return mapa;
  }, [recursosQuery.data]);

  const stats = rdosQuery.data?.stats;
  const semRdoIds = useMemo(
    () => new Set((stats?.obrasSemRdoOntem ?? []).map((o) => o.contractId)),
    [stats],
  );

  const handleExcluir = useCallback((c: Contract) => {
    if (!window.confirm(`Excluir o contrato "${c.name}"?`)) return;
    deletar.mutate(c.id, {
      onSuccess: () => toast.success('Contrato excluído'),
      onError: (e) => toast.error(e.message),
    });
  }, [deletar]);

  const toggleFav = useCallback((id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAVS_KEY, JSON.stringify([...next]));
      } catch { /* localStorage indisponível */ }
      return next;
    });
  }, []);

  const exportarCsv = useCallback((lista: Contract[]) => {
    if (lista.length === 0) {
      toast.warning('Nenhum contrato para exportar');
      return;
    }
    const csvRows: (string | number)[][] = [
      ['Nome', 'Cliente', 'Nº Contrato', 'Status', 'Valor', 'Início', 'Fim'],
      ...lista.map((c) => [
        c.name,
        c.client,
        c.contractNumber ?? '',
        c.status,
        c.value ?? 0,
        c.startDate ?? '',
        c.endDate ?? '',
      ]),
    ];
    downloadCsv(`contratos-${new Date().toISOString().slice(0, 10)}.csv`, csvRows);
    toast.success(`${lista.length} contratos exportados`);
  }, []);

  const bulkStatus = useCallback((rows: Contract[]) => {
    const novo = window.prompt(
      `Novo status para ${rows.length} contrato(s):\n${STATUS_VALIDOS.join(', ')}`,
    );
    if (!novo) return;
    const status = novo.trim().toLowerCase();
    if (!STATUS_VALIDOS.includes(status as ContractStatus)) {
      toast.warning('Status inválido');
      return;
    }
    for (const c of rows) {
      atualizar.mutate({ id: c.id, input: { status: status as ContractStatus } });
    }
    toast.success(`${rows.length} contrato(s) atualizados`);
  }, [atualizar]);

  const bulkDelete = useCallback((rows: Contract[]) => {
    if (!window.confirm(`Excluir ${rows.length} contrato(s)? Esta ação não pode ser desfeita.`)) return;
    for (const c of rows) deletar.mutate(c.id);
    toast.success(`${rows.length} contrato(s) excluídos`);
  }, [deletar]);

  const contratoColumns = useMemo((): Column<Contract>[] => [
    {
      id: 'fav',
      header: '★',
      hideable: false,
      width: '40px',
      cell: (c) => (
        <button
          style={{ background: 'none', border: 'none', padding: 0, fontSize: 16 }}
          onClick={(e) => { e.stopPropagation(); toggleFav(c.id); }}
          title={favs.has(c.id) ? 'Remover favorito' : 'Favoritar'}
        >
          {favs.has(c.id) ? '★' : '☆'}
        </button>
      ),
    },
    {
      id: 'nome',
      header: 'Nome',
      sortable: true,
      sortAccessor: (c) => c.name ?? '',
      cell: (c) => (
        <>
          <strong>{c.name}</strong>
          {c.status === 'ativo' && semRdoIds.has(c.id) && (
            <span title="Sem RDO no último dia útil"> 🔴</span>
          )}
        </>
      ),
    },
    {
      id: 'cliente',
      header: 'Cliente',
      sortable: true,
      sortAccessor: (c) => c.client ?? '',
      cell: (c) => c.client,
    },
    {
      id: 'valor',
      header: 'Valor',
      sortable: true,
      sortAccessor: (c) => Number(c.value) || 0,
      cell: (c) => {
        const medido = medidoPorContrato.get(c.id) ?? 0;
        const valor = Number(c.value) || 0;
        const pct = valor > 0 ? Math.min(100, (medido / valor) * 100) : 0;
        return (
          <>
            {formatBRL(valor)}
            <div style={{ marginTop: 4, height: 4, borderRadius: 99, background: 'var(--color-border)', width: 80 }}>
              <div style={{ height: 4, borderRadius: 99, width: `${pct.toFixed(0)}%`, background: pct >= 100 ? 'var(--color-success)' : 'var(--color-primary)' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{pct.toFixed(0)}% medido</div>
          </>
        );
      },
    },
    {
      id: 'periodo',
      header: 'Período',
      sortable: true,
      sortAccessor: (c) => c.startDate ?? '',
      cell: (c) => (
        <>
          <div>{formatDateBR(c.startDate)}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>até {formatDateBR(c.endDate)}</div>
        </>
      ),
    },
    {
      id: 'equipe',
      header: 'Equipe',
      align: 'center',
      cell: (c) => {
        const equipe = Math.max(
          (c.organograma ?? []).length,
          alocadosPorContrato.get(c.id) ?? 0,
        );
        return equipe || <span className="text-muted">—</span>;
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: (c) => (
        <Badge
          variant={
            c.status === 'ativo' ? 'success' :
            c.status === 'cancelado' || c.status === 'nao_aprovado' ? 'destructive' :
            c.status === 'pausado' || c.status === 'nao_iniciado' ? 'warning' : 'secondary'
          }
        >
          {STATUS_LABEL[c.status] ?? c.status}
        </Badge>
      ),
    },
    {
      id: 'acoes',
      header: 'Ações',
      hideable: false,
      cell: (c) => (
        <div className="actions-cell" onClick={(e) => e.stopPropagation()}>
          <a className="action-link" style={{ cursor: 'pointer' }} onClick={() => navigate(`/contratos/${c.id}`)}>Abrir</a>
          <a className="action-link" style={{ cursor: 'pointer' }} onClick={() => setModal({ type: 'editar', contract: c })}>Editar</a>
          <a className="action-link" style={{ cursor: 'pointer' }} onClick={() => setModal({ type: 'duplicar', contract: c })}>Duplicar</a>
          <a className="action-link danger" style={{ cursor: 'pointer' }} onClick={() => handleExcluir(c)}>Excluir</a>
        </div>
      ),
    },
  ] as Column<Contract>[], [toggleFav, favs, semRdoIds, medidoPorContrato, alocadosPorContrato, handleExcluir, setModal, navigate]);

  if (contractsQuery.isLoading) {
    return <Spinner label="Carregando contratos..." />;
  }
  if (contractsQuery.isError) {
    return <div className="error-banner">Erro ao carregar contratos.</div>;
  }

  const q = busca.toLowerCase().trim();
  let filtrados = contratos.filter((c) => {
    if (filtroStatus !== 'todos' && c.status !== filtroStatus) return false;
    if (!q) return true;
    return [c.name, c.client, c.contractNumber].some((campo) =>
      String(campo ?? '').toLowerCase().includes(q),
    );
  });
  // Favoritos sempre no topo (sem sort ativo).
  filtrados = [
    ...filtrados.filter((c) => favs.has(c.id)),
    ...filtrados.filter((c) => !favs.has(c.id)),
  ];
  const totalFiltrado = filtrados.length;
  const totalAtivos = contratos.filter((c) => c.status === 'ativo').length;

  const bulkActions: BulkAction<Contract>[] = [
    { label: '⬇ CSV', variant: 'secondary', onClick: exportarCsv },
    { label: 'Mudar Status', variant: 'secondary', onClick: bulkStatus },
    { label: '🗑 Excluir', variant: 'danger', onClick: bulkDelete },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Contratos</h1>
          <p className="page-subtitle">Gerenciar contratos de serviços</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => exportarCsv(filtrados)}>
            ⬇ CSV
          </Button>
          <Button size="lg" onClick={() => setModal({ type: 'novo' })}>
            + Novo Contrato
          </Button>
        </div>
      </div>

      {stats &&
        !stats.ehFimDeSemana &&
        stats.obrasSemRdoOntem.length > 0 && (
          <div
            style={{
              background: '#fee2e2',
              color: '#991b1b',
              border: '1px solid #fca5a5',
              padding: '10px 14px',
              borderRadius: 8,
              marginBottom: 'var(--sp-md)',
              fontSize: 14,
            }}
          >
            ⚠ <strong>{stats.obrasSemRdoOntem.length} obra(s)</strong> sem RDO no
            último dia útil — marcadas com 🔴 abaixo.
          </div>
        )}

      <Card style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-md)' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="block text-sm font-medium leading-none text-foreground mb-1.5">Buscar</label>
            <Input
              type="search"
              placeholder="Nome, cliente ou número..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div style={{ width: 200 }}>
            <label className="block text-sm font-medium leading-none text-foreground mb-1.5">Status</label>
            <Select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              <option value="todos">Todos</option>
              {STATUS_VALIDOS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <div
        style={{
          fontSize: 13,
          color: 'var(--color-text-muted)',
          marginBottom: 8,
        }}
      >
        <strong style={{ color: 'var(--color-text)' }}>{totalFiltrado}</strong>{' '}
        contrato{totalFiltrado !== 1 ? 's' : ''}
        {filtroStatus === 'todos' && !q && (
          <>
            {' '}
            ·{' '}
            <strong style={{ color: 'var(--color-success)' }}>
              {totalAtivos}
            </strong>{' '}
            ativo{totalAtivos !== 1 ? 's' : ''}
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {STATUS_CHIPS.map((s) => (
          <Button
            key={s.v}
            size="sm"
            variant={filtroStatus === s.v ? 'primary' : 'secondary'}
            onClick={() => setFiltroStatus(s.v)}
          >
            {s.l}
          </Button>
        ))}
      </div>

      <DataTable
        rows={filtrados}
        columns={contratoColumns}
        rowKey={(c) => c.id}
        onRowClick={(c) => navigate(`/contratos/${c.id}`)}
        emptyMessage="Nenhum contrato encontrado"
        pageSize={PAGE_SIZE}
        selectable
        bulkActions={bulkActions}
        showColumnToggle
      />

      {modal?.type === 'novo' && (
        <ContratoModal
          contract={null}
          isEdit={false}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'editar' && (
        <ContratoModal
          contract={modal.contract}
          isEdit
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'duplicar' && (
        <ContratoModal
          contract={{
            ...modal.contract,
            name: `[Cópia] ${modal.contract.name}`,
            status: 'prospeccao',
            contractNumber: '',
            startDate: '',
            endDate: '',
            tendencyDate: '',
          }}
          isEdit={false}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
