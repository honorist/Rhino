import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { Input, Select } from '../../components/ui/controls';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import { downloadCsv } from '../../lib/downloadCsv';
import { useRecursos } from '../resources';
import { useRdos } from '../rdos/queries';
import { useContracts, useDeleteContract, useSaidas, useUpdateContract } from './queries';
import type { Contract, ContractStatus } from './types';
import ContratoModal from './ContratoModal';

const FAVS_KEY = 'rhino-favs';
const PAGE_SIZE = 25;

const STATUS_CHIPS: { v: string; l: string }[] = [
  { v: 'todos', l: 'Todos' },
  { v: 'ativo', l: 'Ativo' },
  { v: 'prospeccao', l: 'Prospecção' },
  { v: 'pausado', l: 'Pausado' },
  { v: 'concluido', l: 'Concluído' },
  { v: 'cancelado', l: 'Cancelado' },
];

const STATUS_VALIDOS: ContractStatus[] = [
  'prospeccao',
  'ativo',
  'pausado',
  'concluido',
  'cancelado',
];

function loadFavs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

type SortField = 'name' | 'client' | 'value' | 'startDate' | 'status';
type ModalState =
  | { type: 'novo' }
  | { type: 'editar' | 'duplicar'; contract: Contract }
  | null;

/** Lista de Contratos — porte de js/views/Contratos.js. */
export default function Contratos() {
  const navigate = useNavigate();
  const toast = useToast();
  const contractsQuery = useContracts();
  const saidasQuery = useSaidas();
  const recursosQuery = useRecursos();
  const rdosQuery = useRdos();
  const deletar = useDeleteContract();
  const atualizar = useUpdateContract();

  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [busca, setBusca] = useState('');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [favs, setFavs] = useState<Set<string>>(loadFavs);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
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

  if (sortField) {
    const field = sortField;
    filtrados = [...filtrados].sort((a, b) => {
      let va: unknown = a[field];
      let vb: unknown = b[field];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      const cmp = (va ?? '') < (vb ?? '') ? -1 : (va ?? '') > (vb ?? '') ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }
  // Favoritos sempre no topo.
  filtrados = [
    ...filtrados.filter((c) => favs.has(c.id)),
    ...filtrados.filter((c) => !favs.has(c.id)),
  ];

  const totalFiltrado = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltrado / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = (pageSafe - 1) * PAGE_SIZE;
  const pagina = filtrados.slice(pageStart, pageStart + PAGE_SIZE);
  const totalAtivos = contratos.filter((c) => c.status === 'ativo').length;

  function toggleFav(id: string) {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAVS_KEY, JSON.stringify([...next]));
      } catch {
        /* localStorage indisponível */
      }
      return next;
    });
  }

  function setSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExcluir(c: Contract) {
    if (!window.confirm(`Excluir o contrato "${c.name}"?`)) return;
    deletar.mutate(c.id, {
      onSuccess: () => toast.show('Contrato excluído', 'success'),
      onError: (e) => toast.show(e.message, 'danger'),
    });
  }

  function exportarCsv(lista: Contract[]) {
    if (lista.length === 0) {
      toast.show('Nenhum contrato para exportar', 'warning');
      return;
    }
    const rows: (string | number)[][] = [
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
    downloadCsv(
      `contratos-${new Date().toISOString().slice(0, 10)}.csv`,
      rows,
    );
    toast.show(`${lista.length} contratos exportados`, 'success');
  }

  function bulkStatus() {
    const novo = window.prompt(
      `Novo status para ${selecionados.size} contrato(s):\n${STATUS_VALIDOS.join(', ')}`,
    );
    if (!novo) return;
    const status = novo.trim().toLowerCase();
    if (!STATUS_VALIDOS.includes(status as ContractStatus)) {
      toast.show('Status inválido', 'warning');
      return;
    }
    for (const id of selecionados) {
      atualizar.mutate({ id, input: { status: status as ContractStatus } });
    }
    toast.show(`${selecionados.size} contrato(s) atualizados`, 'success');
    setSelecionados(new Set());
  }

  function bulkDelete() {
    if (
      !window.confirm(
        `Excluir ${selecionados.size} contrato(s)? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    for (const id of selecionados) deletar.mutate(id);
    toast.show(`${selecionados.size} contrato(s) excluídos`, 'success');
    setSelecionados(new Set());
  }

  const sortIcon = (field: SortField) =>
    sortField !== field ? ' ⇕' : sortDir === 'asc' ? ' ▲' : ' ▼';

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
            <label className="form-label">Buscar</label>
            <Input
              type="search"
              placeholder="Nome, cliente ou número..."
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div style={{ width: 200 }}>
            <label className="form-label">Status</label>
            <Select
              value={filtroStatus}
              onChange={(e) => {
                setFiltroStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="todos">Todos</option>
              {STATUS_VALIDOS.map((s) => (
                <option key={s} value={s}>
                  {s}
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

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '12px 16px 0' }}>
          {STATUS_CHIPS.map((s) => (
            <Button
              key={s.v}
              size="sm"
              variant={filtroStatus === s.v ? 'primary' : 'secondary'}
              onClick={() => {
                setFiltroStatus(s.v);
                setPage(1);
              }}
            >
              {s.l}
            </Button>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSort('name')}
                >
                  Nome{sortIcon('name')}
                </th>
                <th
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSort('client')}
                >
                  Cliente{sortIcon('client')}
                </th>
                <th
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSort('value')}
                >
                  Valor{sortIcon('value')}
                </th>
                <th
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSort('startDate')}
                >
                  Período{sortIcon('startDate')}
                </th>
                <th style={{ textAlign: 'center' }}>Equipe</th>
                <th
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSort('status')}
                >
                  Status{sortIcon('status')}
                </th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pagina.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center text-muted"
                    style={{ padding: 'var(--sp-xl)' }}
                  >
                    Nenhum contrato encontrado
                  </td>
                </tr>
              ) : (
                pagina.map((c) => {
                  const medido = medidoPorContrato.get(c.id) ?? 0;
                  const valor = Number(c.value) || 0;
                  const pct = valor > 0 ? Math.min(100, (medido / valor) * 100) : 0;
                  const equipe = Math.max(
                    (c.organograma ?? []).length,
                    alocadosPorContrato.get(c.id) ?? 0,
                  );
                  return (
                    <tr
                      key={c.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/contratos/${c.id}`)}
                    >
                      <td
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: 36 }}
                      >
                        <input
                          type="checkbox"
                          checked={selecionados.has(c.id)}
                          onChange={() => toggleSelecionado(c.id)}
                        />
                      </td>
                      <td>
                        <strong>{c.name}</strong>
                        {c.status === 'ativo' && semRdoIds.has(c.id) && (
                          <span title="Sem RDO no último dia útil"> 🔴</span>
                        )}
                      </td>
                      <td>{c.client}</td>
                      <td>
                        {formatBRL(valor)}
                        <div
                          style={{
                            marginTop: 4,
                            height: 4,
                            borderRadius: 99,
                            background: 'var(--color-border)',
                            width: 80,
                          }}
                        >
                          <div
                            style={{
                              height: 4,
                              borderRadius: 99,
                              width: `${pct.toFixed(0)}%`,
                              background:
                                pct >= 100
                                  ? 'var(--color-success)'
                                  : 'var(--color-primary)',
                            }}
                          />
                        </div>
                        <div
                          style={{ fontSize: 11, color: 'var(--color-text-muted)' }}
                        >
                          {pct.toFixed(0)}% medido
                        </div>
                      </td>
                      <td>
                        <div>{formatDateBR(c.startDate)}</div>
                        <div
                          style={{ fontSize: 11, color: 'var(--color-text-muted)' }}
                        >
                          até {formatDateBR(c.endDate)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{equipe}</td>
                      <td>
                        <span className={`badge badge-${c.status}`}>
                          {c.status}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="actions-cell">
                          <a
                            className="action-link"
                            style={{ cursor: 'pointer' }}
                            onClick={() => toggleFav(c.id)}
                            title="Favoritar"
                          >
                            {favs.has(c.id) ? '★' : '☆'}
                          </a>
                          <a
                            className="action-link"
                            style={{ cursor: 'pointer' }}
                            onClick={() => navigate(`/contratos/${c.id}`)}
                          >
                            Abrir
                          </a>
                          <a
                            className="action-link"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setModal({ type: 'editar', contract: c })}
                          >
                            Editar
                          </a>
                          <a
                            className="action-link"
                            style={{ cursor: 'pointer' }}
                            onClick={() =>
                              setModal({ type: 'duplicar', contract: c })
                            }
                          >
                            Duplicar
                          </a>
                          <a
                            className="action-link danger"
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleExcluir(c)}
                          >
                            Excluir
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 'var(--sp-sm)',
            marginTop: 'var(--sp-md)',
          }}
        >
          <Button
            variant="secondary"
            disabled={pageSafe === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹ Anterior
          </Button>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            Página {pageSafe} de {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Próxima ›
          </Button>
        </div>
      )}

      {selecionados.size > 0 && (
        <Card
          style={{
            padding: 'var(--sp-md)',
            marginTop: 'var(--sp-md)',
            display: 'flex',
            gap: 'var(--sp-sm)',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <strong>
            {selecionados.size} selecionado{selecionados.size !== 1 ? 's' : ''}
          </strong>
          <Button size="sm" variant="secondary" onClick={bulkStatus}>
            Mudar status
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              exportarCsv(contratos.filter((c) => selecionados.has(c.id)))
            }
          >
            ⬇ CSV
          </Button>
          <Button size="sm" variant="danger" onClick={bulkDelete}>
            🗑 Excluir
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSelecionados(new Set())}
          >
            ✕ Limpar
          </Button>
        </Card>
      )}

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
