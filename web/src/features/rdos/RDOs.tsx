import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/button';
import DataTable, { type Column } from '../../components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import Spinner from '../../components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Combobox } from '../../components/ui/combobox';
import { toast } from 'sonner';
import { downloadCsv } from '../../lib/downloadCsv';
import RdoDetailModal from '../contracts/RdoDetailModal';
import { useContracts } from '../contracts/queries';
import { useRdos } from './queries';
import type { Rdo, RdoStats } from './types';

const PAGE_SIZE = 50;

/** Converte `YYYY-MM-DD` em `DD/MM/YYYY`. */
function fmtData(d?: string | null): string {
  if (!d) return '—';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
}

/** Cor do indicador conforme o percentual de aderência. */
function corAderencia(pct: number): string {
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#f59e0b';
  return '#dc2626';
}

interface KpiCardProps {
  label: string;
  value: string | number;
  color: string;
}

function KpiCard({ label, value, color }: KpiCardProps) {
  return (
    <div
      style={{
        padding: 'var(--sp-md)',
        background: 'var(--color-surface)',
        borderRadius: 8,
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 6 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

/** Gráfico de aderência diária — barras verticais em CSS (sem Chart.js). */
function AderenciaChart({ stats }: { stats: RdoStats }) {
  if (stats.aderenciaDiaria.length === 0) return null;
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 'var(--sp-md)',
        marginBottom: 'var(--sp-lg)',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          marginBottom: 'var(--sp-sm)',
          color: 'var(--color-text)',
        }}
      >
        Aderência diária — últimos {stats.diasUteisAvaliados} dias úteis
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          height: 160,
        }}
      >
        {stats.aderenciaDiaria.map((d) => (
          <div
            key={d.data}
            title={`${d.feitos}/${d.esperados} obras (${d.pct}%)`}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              height: '100%',
              justifyContent: 'flex-end',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {d.pct}%
            </span>
            <div
              style={{
                width: '100%',
                height: `${Math.max(d.pct, 2)}%`,
                background: corAderencia(d.pct),
                borderRadius: 4,
                minHeight: 2,
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {fmtData(d.data).slice(0, 5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Modal de seleção de contrato para lançar um novo RDO. */
function PickerContratoModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const contractsQuery = useContracts();
  const [contractId, setContractId] = useState('');

  const ativos = (contractsQuery.data ?? [])
    .filter((c) => c.status === 'ativo')
    .map((c) => ({
      id: c.id,
      name: String(c.name ?? ''),
      client: String(c.client ?? ''),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  function continuar() {
    if (!contractId) {
      toast.error('Selecione um contrato.');
      return;
    }
    onClose();
    navigate(`/contratos/${contractId}`);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>+ Novo RDO</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p
            style={{
              margin: '0 0 var(--sp-md)',
              fontSize: 14,
              color: 'var(--color-text-muted)',
            }}
          >
            Escolha o contrato para o qual você quer lançar um RDO. Os dados (MOI,
            MOD, equipamentos, atividades, etc.) são preenchidos na tela do contrato.
          </p>
          {contractsQuery.isLoading ? (
            <Spinner label="Carregando contratos..." />
          ) : ativos.length === 0 ? (
            <p className="text-muted">Nenhum contrato ativo encontrado.</p>
          ) : (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Contrato *</label>
              <Combobox
                options={ativos.map((c) => ({
                  value: c.id,
                  label: c.client ? `${c.name} — ${c.client}` : c.name,
                }))}
                value={contractId}
                onChange={setContractId}
                placeholder="— selecione —"
                searchPlaceholder="Pesquisar contrato..."
                emptyText="Nenhum contrato encontrado."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={continuar}>Continuar →</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Visão global de RDOs — lista flat + dashboard de aderência. */
export default function RDOs() {
  const navigate = useNavigate();
  const rdosQuery = useRdos();
  // Para abrir o RdoDetailModal precisamos do contrato + RDO completos
  // (a lista global tem só sumário). Carregamos os contracts no mount.
  const contractsQuery = useContracts();

  const [filterContract, setFilterContract] = useState('');
  const [filterMes, setFilterMes] = useState('');
  const [page, setPage] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailRdoId, setDetailRdoId] = useState<{ rdoId: string; contractId: string } | null>(null);

  const rdos = useMemo(() => rdosQuery.data?.rdos ?? [], [rdosQuery.data]);
  const stats = rdosQuery.data?.stats;

  const contratos = useMemo(() => {
    const mapa = new Map<string, { id: string; name: string; client: string }>();
    for (const r of rdos) {
      if (!mapa.has(r.contractId)) {
        mapa.set(r.contractId, {
          id: r.contractId,
          name: r.contractName || '',
          client: r.contractClient || '',
        });
      }
    }
    return [...mapa.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rdos]);

  const filtrados = useMemo(
    () =>
      rdos.filter((r) => {
        if (filterContract && r.contractId !== filterContract) return false;
        if (filterMes && !String(r.data ?? '').startsWith(filterMes)) {
          return false;
        }
        return true;
      }),
    [rdos, filterContract, filterMes],
  );

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const slice = filtrados.slice(
    pageSafe * PAGE_SIZE,
    (pageSafe + 1) * PAGE_SIZE,
  );

  if (rdosQuery.isLoading) {
    return <Spinner label="Carregando RDOs..." />;
  }
  if (rdosQuery.isError || !stats) {
    return <div className="error-banner">Erro ao carregar os RDOs.</div>;
  }

  function exportarSemRdo() {
    const rows: (string | number)[][] = [['Contrato', 'Cliente', 'Último RDO']];
    for (const o of stats!.obrasSemRdoOntem) {
      rows.push([o.name, o.client ?? '', o.ultimoRdo ?? 'nunca']);
    }
    downloadCsv(`obras-sem-rdo-${stats!.ultimoDiaUtil}.csv`, rows);
  }

  function exportarAtrasadas() {
    const rows: (string | number)[][] = [
      ['Contrato', 'Cliente', 'Dias úteis sem RDO', 'Último RDO'],
    ];
    for (const o of stats!.obrasAtrasadas) {
      rows.push([
        o.name,
        o.client ?? '',
        o.nuncaFezRdo ? 'nunca fez' : String(o.diasUteisSemRdo ?? ''),
        o.ultimoRdo ?? '—',
      ]);
    }
    downloadCsv(`obras-atrasadas-${stats!.hoje}.csv`, rows);
  }

  const columns: Column<Rdo>[] = [
    { header: 'Data', width: '120px', cell: (r) => fmtData(r.data) },
    { header: 'Nº', width: '90px', cell: (r) => String(r.numero ?? '') },
    { header: 'Contrato', cell: (r) => r.contractName || '' },
    { header: 'Cliente', cell: (r) => r.contractClient || '' },
    { header: 'OS', width: '120px', cell: (r) => r.osNumero || '' },
    {
      header: 'Atualizado',
      width: '160px',
      cell: (r) => (
        <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          {r.updatedAt
            ? new Date(r.updatedAt).toLocaleString('pt-BR')
            : '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">RDOs — Todos os Contratos</h1>
        <Button onClick={() => setPickerOpen(true)}>+ Novo RDO</Button>
      </div>

      {stats.ehFimDeSemana && (
        <div
          style={{
            background: '#dbeafe',
            color: '#1e3a8a',
            padding: 'var(--sp-md) var(--sp-lg)',
            borderRadius: 8,
            marginBottom: 'var(--sp-lg)',
            border: '1px solid #93c5fd',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 20 }}>📅</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              Hoje é fim de semana — RDO é ocasional, não obrigatório.
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              Os alertas abaixo se referem ao último dia útil (
              {fmtData(stats.ultimoDiaUtil)}).
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <KpiCard label="Obras ativas" value={stats.obrasAtivas} color="#3b82f6" />
        <KpiCard
          label="Sem RDO ontem"
          value={stats.obrasSemRdoOntem.length}
          color={stats.obrasSemRdoOntem.length > 0 ? '#dc2626' : '#10b981'}
        />
        <KpiCard
          label="Atrasadas (>2 dias úteis)"
          value={stats.obrasAtrasadas.length}
          color={stats.obrasAtrasadas.length > 0 ? '#f59e0b' : '#10b981'}
        />
        <KpiCard
          label={`Aderência ${stats.diasUteisAvaliados} dias úteis`}
          value={`${stats.aderencia7d}%`}
          color={corAderencia(stats.aderencia7d)}
        />
      </div>

      <AderenciaChart stats={stats} />

      {stats.obrasSemRdoOntem.length > 0 && (
        <div
          style={{
            background: '#dc2626',
            color: '#fff',
            padding: 'var(--sp-md) var(--sp-lg)',
            borderRadius: 8,
            marginBottom: 'var(--sp-lg)',
            boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              ⚠ Obras sem RDO no último dia útil ({fmtData(stats.ultimoDiaUtil)}):
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportarSemRdo}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.4)',
                fontSize: 13,
              }}
            >
              ⬇ Exportar CSV
            </Button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 1.7 }}>
            {stats.obrasSemRdoOntem.map((o) => (
              <li key={o.contractId}>
                <a
                  href={`/contratos/${o.contractId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/contratos/${o.contractId}`);
                  }}
                  style={{ color: '#fff', fontWeight: 700 }}
                >
                  {o.name}
                </a>{' '}
                — {o.client ?? ''}{' '}
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                  (último RDO: {o.ultimoRdo ? fmtData(o.ultimoRdo) : 'nunca'})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.obrasAtrasadas.length > 0 && (
        <div
          style={{
            background: '#f59e0b',
            color: '#1f1300',
            padding: 'var(--sp-md) var(--sp-lg)',
            borderRadius: 8,
            marginBottom: 'var(--sp-lg)',
            boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              📋 Obras com mais de 2 dias úteis sem RDO:
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportarAtrasadas}
              style={{
                background: 'rgba(0,0,0,0.15)',
                color: '#1f1300',
                border: '1px solid rgba(0,0,0,0.3)',
                fontSize: 13,
              }}
            >
              ⬇ Exportar CSV
            </Button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 1.7 }}>
            {stats.obrasAtrasadas.map((o) => (
              <li key={o.contractId}>
                <a
                  href={`/contratos/${o.contractId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/contratos/${o.contractId}`);
                  }}
                  style={{ color: '#1f1300', fontWeight: 700 }}
                >
                  {o.name}
                </a>{' '}
                —{' '}
                <strong>
                  {o.nuncaFezRdo
                    ? 'nunca fez RDO'
                    : `${o.diasUteisSemRdo} dias úteis sem RDO`}
                </strong>
                {o.ultimoRdo && (
                  <span
                    style={{ color: 'rgba(31,19,0,0.7)', fontSize: 13 }}
                  >
                    {' '}
                    (último: {fmtData(o.ultimoRdo)})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 'var(--sp-md)',
          alignItems: 'end',
          marginBottom: 'var(--sp-md)',
          flexWrap: 'wrap',
        }}
      >
        <div className="form-group" style={{ margin: 0, minWidth: 240 }}>
          <label className="form-label">Contrato</label>
          <Combobox
            options={[
              { value: '', label: '— Todos —' },
              ...contratos.map((c) => ({
                value: c.id,
                label: c.client ? `${c.name} (${c.client})` : c.name,
              })),
            ]}
            value={filterContract}
            onChange={(val) => {
              setFilterContract(val);
              setPage(0);
            }}
            placeholder="— Todos —"
            searchPlaceholder="Pesquisar contrato..."
            emptyText="Nenhum contrato encontrado."
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Mês</label>
          <Input
            type="month"
            value={filterMes}
            onChange={(e) => {
              setFilterMes(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setFilterContract('');
            setFilterMes('');
            setPage(0);
          }}
        >
          Limpar
        </Button>
        <div
          style={{
            marginLeft: 'auto',
            color: 'var(--color-text-muted)',
            fontSize: 14,
          }}
        >
          {filtrados.length} RDOs encontrados
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={slice}
        rowKey={(r) => r.id}
        onRowClick={(r) =>
          setDetailRdoId({ rdoId: r.id, contractId: r.contractId })
        }
        emptyMessage="Nenhum RDO"
        showColumnToggle
      />

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
            disabled={pageSafe === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Anterior
          </Button>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              color: 'var(--color-text-muted)',
            }}
          >
            Página {pageSafe + 1} de {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={pageSafe >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Próxima →
          </Button>
        </div>
      )}

      {pickerOpen && <PickerContratoModal onClose={() => setPickerOpen(false)} />}

      {/* Modal de detalhe do RDO ao clicar numa linha */}
      {detailRdoId &&
        (() => {
          const contract = (contractsQuery.data ?? []).find(
            (c) => c.id === detailRdoId.contractId,
          );
          const rdo = contract
            ? ((contract.rdos as Array<{ id?: string }> | undefined) ?? []).find(
                (r) => r?.id === detailRdoId.rdoId,
              )
            : null;
          if (!contract || !rdo) {
            // Fallback: ainda carregando ou contrato/RDO sumiu — navega para
            // o contrato pra não deixar o usuário travado.
            navigate(`/contratos/${detailRdoId.contractId}`);
            setDetailRdoId(null);
            return null;
          }
          return (
            <RdoDetailModal
              rdo={rdo as Parameters<typeof RdoDetailModal>[0]['rdo']}
              contract={contract}
              onClose={() => setDetailRdoId(null)}
            />
          );
        })()}
    </>
  );
}
