import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  DollarSign,
  List,
  Send,
  Undo2,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/button';
import DataTable, { type Column, type FacetedFilter } from '../../components/ui/data-table';
import Card from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import FormField from '../../components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Combobox } from '../../components/ui/combobox';
import { DatePicker } from '../../components/ui/date-picker';
import Spinner from '../../components/ui/spinner';
import { toast } from 'sonner';
import { formatBRL } from '../../lib/format';
import type { CaixaEntry, NotaFiscal } from '../../types/domain';
import type { Contract, Saida } from '../contracts/types';
import { useContracts, useSaidas } from '../contracts/queries';
import { useCaixa, useNotasFiscais } from '../resources';
import { diasAteMeioDia, getNotaFiscalStatus } from './status';
import {
  useCancelarEmissao,
  useCreateNotaFiscal,
  useDeleteNotaFiscal,
  useEmitirNotaFiscal,
  useUpdateNotaFiscal,
  type NotaFiscalInput,
} from './queries';

const num = (v: unknown): number => Number(v) || 0;
const PRAZO_PADRAO = 30;

type TabId = 'lista' | 'semanal' | 'mensal';

function formatDate(d?: string): string {
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '—';
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function prazoOf(nf: NotaFiscal): number {
  const p = Number(nf.prazoRecebimento);
  return Number.isFinite(p) ? p : PRAZO_PADRAO;
}

/** Data prevista de recebimento: base (emissão real ou limite) + prazo. */
function dataRecebimento(nf: NotaFiscal): Date | null {
  const base = nf.emitida ? nf.dataEmissaoReal : nf.dataLimite;
  if (!base) return null;
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + prazoOf(nf));
  return d;
}

function contractName(c: Contract | undefined): string {
  return c ? String(c.name ?? '') : '';
}

function contractClient(c: Contract | undefined): string {
  return c ? String(c.client ?? '') : '';
}

/** Tela de Contas a Receber (Notas Fiscais) — migração de js/views/NotasFiscais.js. */
export default function NotasFiscais() {
  const notasQuery = useNotasFiscais();
  const contractsQuery = useContracts();

  const [tab, setTab] = useState<TabId>('lista');
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [nfModal, setNfModal] = useState<{ nf: NotaFiscal | null } | null>(null);
  const [emitirId, setEmitirId] = useState<string | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const notas = notasQuery.data ?? [];
  const contratos = contractsQuery.data ?? [];
  const contractById = (id?: string): Contract | undefined =>
    id ? contratos.find((c) => c.id === id) : undefined;

  const pendentes = notas.filter((nf) => !nf.emitida);
  const emitidas = notas.filter((nf) => nf.emitida);
  const vencidas = pendentes.filter(
    (nf) => getNotaFiscalStatus(nf.dataLimite).status === 'vencida',
  );
  const proximas = pendentes.filter(
    (nf) => getNotaFiscalStatus(nf.dataLimite).status === 'proximo_vencer',
  );
  const noPrazo = pendentes.filter(
    (nf) => getNotaFiscalStatus(nf.dataLimite).status === 'no_prazo',
  );

  const total = notas.length;
  const pctOk =
    total > 0
      ? Math.round(((noPrazo.length + emitidas.length) / total) * 100)
      : 100;
  const statusGeral =
    vencidas.length > 0
      ? { cor: '#E53E3E', bg: 'rgba(229,62,62,.07)', texto: 'Atenção urgente', icone: <AlertCircle className="size-4" /> }
      : proximas.length > 0
        ? { cor: '#D69E2E', bg: 'rgba(214,158,46,.07)', texto: 'Requer atenção', icone: <AlertTriangle className="size-4" /> }
        : { cor: '#38A169', bg: 'rgba(56,161,105,.07)', texto: 'Tudo em dia', icone: <CheckCircle2 className="size-4" /> };

  const proximasTimeline = pendentes
    .filter((nf) => {
      const dias = diasAteMeioDia(nf.dataLimite);
      return dias >= -30 && dias <= 30;
    })
    .slice()
    .sort(
      (a, b) =>
        new Date(a.dataLimite).getTime() - new Date(b.dataLimite).getTime(),
    )
    .slice(0, 5);

  const nfDoModal = emitirId
    ? notas.find((nf) => nf.id === emitirId) ?? null
    : null;
  const nfDetalhe = detalheId
    ? notas.find((nf) => nf.id === detalheId) ?? null
    : null;

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 'var(--sp-xl)',
        }}
      >
        <div>
          <h1 className="page-title">Contas a Receber</h1>
          <p className="page-subtitle">
            Notas fiscais e recebimentos previstos · {total} nota
            {total !== 1 ? 's' : ''} registrada{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="lg" onClick={() => setNfModal({ nf: null })}>
          + Nova Conta a Receber
        </Button>
      </div>

      {notasQuery.isLoading ? (
        <Spinner label="Carregando notas fiscais..." />
      ) : notasQuery.isError ? (
        <Card style={{ padding: 24 }}>
          <p className="text-danger">
            Erro ao carregar notas fiscais. Tente novamente.
          </p>
        </Card>
      ) : (
        <>
          <div
            style={{
              background: statusGeral.bg,
              border: `1px solid ${statusGeral.cor}30`,
              borderRadius: 8,
              padding: 'var(--sp-sm) var(--sp-md)',
              marginBottom: 'var(--sp-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-lg)',
              flexWrap: 'wrap',
            }}
          >
            <PanelMetric icone={<AlertCircle className="size-4" style={{ color: '#E53E3E' }} />} valor={vencidas.length} cor="#E53E3E" rotulo="Vencidas" />
            <PanelDivisor cor={statusGeral.cor} />
            <PanelMetric icone={<AlertTriangle className="size-4" style={{ color: '#D69E2E' }} />} valor={proximas.length} cor="#D69E2E" rotulo="Próx. 7d" />
            <PanelDivisor cor={statusGeral.cor} />
            <PanelMetric icone={<CheckCircle2 className="size-4" style={{ color: '#38A169' }} />} valor={noPrazo.length} cor="#38A169" rotulo="No prazo" />
            <PanelDivisor cor={statusGeral.cor} />
            <PanelMetric icone={<Send className="size-4" style={{ color: '#3182CE' }} />} valor={emitidas.length} cor="#3182CE" rotulo="Emitidas" />
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              <span style={{ fontWeight: 700, color: statusGeral.cor }}>
                {statusGeral.icone} {statusGeral.texto}
              </span>
              <div
                style={{
                  width: 80,
                  height: 6,
                  background: 'rgba(0,0,0,.08)',
                  borderRadius: 99,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pctOk}%`,
                    background: statusGeral.cor,
                    borderRadius: 99,
                  }}
                />
              </div>
              <span style={{ fontWeight: 800, color: statusGeral.cor }}>
                {pctOk}%
              </span>
            </div>
          </div>

          {proximasTimeline.length > 0 && (
            <Card style={{ marginBottom: 'var(--sp-xl)' }}>
              <h3 className="text-[15px] font-semibold tracking-tight px-5 pt-5 pb-4">Próximos Vencimentos</h3>
              <div>
                {proximasTimeline.map((nf, idx) => (
                  <TimelineItem
                    key={nf.id}
                    nf={nf}
                    contrato={contractById(nf.contractId)}
                    ultimo={idx === proximasTimeline.length - 1}
                  />
                ))}
              </div>
            </Card>
          )}

          <div
            style={{
              display: 'flex',
              gap: 'var(--sp-sm)',
              marginBottom: 'var(--sp-lg)',
            }}
          >
            <Button
              size="sm"
              variant={tab === 'lista' ? 'primary' : 'secondary'}
              onClick={() => setTab('lista')}
            >
              <List className="size-4 mr-1.5" /> Lista Geral
            </Button>
            <Button
              size="sm"
              variant={tab === 'semanal' ? 'primary' : 'secondary'}
              onClick={() => setTab('semanal')}
            >
              <Calendar className="size-4 mr-1.5" /> Semanal
            </Button>
            <Button
              size="sm"
              variant={tab === 'mensal' ? 'primary' : 'secondary'}
              onClick={() => setTab('mensal')}
            >
              <Calendar className="size-4 mr-1.5" /> Mensal
            </Button>
          </div>

          {tab === 'lista' && (
            <ListaTab
              notas={notas}
              contractById={contractById}
              onDetalhe={(id) => setDetalheId(id)}
              onEmitir={(id) => setEmitirId(id)}
              onEditar={(nf) => setNfModal({ nf })}
            />
          )}
          {tab === 'semanal' && (
            <SemanalTab notas={notas} contractById={contractById} />
          )}
          {tab === 'mensal' && (
            <MensalTab
              notas={notas}
              currentMonth={currentMonth}
              onChangeMonth={setCurrentMonth}
            />
          )}
        </>
      )}

      {nfModal && (
        <NFModal
          key={nfModal.nf?.id ?? 'new'}
          nf={nfModal.nf}
          contratos={contratos}
          onClose={() => setNfModal(null)}
        />
      )}

      {nfDoModal && (
        <EmitirModal
          nf={nfDoModal}
          contrato={contractById(nfDoModal.contractId)}
          onClose={() => setEmitirId(null)}
        />
      )}

      {nfDetalhe && (
        <DetailModal
          nf={nfDetalhe}
          contrato={contractById(nfDetalhe.contractId)}
          onClose={() => setDetalheId(null)}
          onEmitir={() => {
            setDetalheId(null);
            setEmitirId(nfDetalhe.id);
          }}
        />
      )}
    </>
  );
}

function PanelMetric({
  icone,
  valor,
  cor,
  rotulo,
}: {
  icone: ReactNode;
  valor: number;
  cor: string;
  rotulo: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
      <span className="flex items-center">{icone}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: cor, lineHeight: 1 }}>
        {valor}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {rotulo}
      </span>
    </div>
  );
}

function PanelDivisor({ cor }: { cor: string }) {
  return <div style={{ width: 1, height: 20, background: `${cor}25` }} />;
}

function TimelineItem({
  nf,
  contrato,
  ultimo,
}: {
  nf: NotaFiscal;
  contrato: Contract | undefined;
  ultimo: boolean;
}) {
  const st = getNotaFiscalStatus(nf.dataLimite);
  const dias = diasAteMeioDia(nf.dataLimite);
  const cor =
    st.status === 'vencida'
      ? '#E53E3E'
      : st.status === 'proximo_vencer'
        ? '#D69E2E'
        : '#38A169';
  const diasTxt =
    dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? 'HOJE' : `em ${dias}d`;
  const data = new Date(`${nf.dataLimite}T12:00:00`);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-lg)',
        padding: 'var(--sp-md) 0',
        borderBottom: ultimo ? undefined : '1px solid var(--color-border)',
      }}
    >
      <div style={{ textAlign: 'center', minWidth: 52 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: cor, lineHeight: 1 }}>
          {data.getDate()}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
          }}
        >
          {data.toLocaleDateString('pt-BR', { month: 'short' })}
        </div>
      </div>
      <div
        style={{
          width: 3,
          height: 36,
          background: cor,
          borderRadius: 99,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>NF {nf.numero}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {contractName(contrato) || '—'} · {contractClient(contrato) || '—'}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 800, color: cor }}>{diasTxt}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {formatDate(nf.dataLimite)}
        </div>
      </div>
    </div>
  );
}

interface ListaTabProps {
  notas: NotaFiscal[];
  contractById: (id?: string) => Contract | undefined;
  onDetalhe: (id: string) => void;
  onEmitir: (id: string) => void;
  onEditar: (nf: NotaFiscal) => void;
}

function ListaTab({
  notas,
  contractById,
  onDetalhe,
  onEmitir,
  onEditar,
}: ListaTabProps) {
  const cancelarEmissao = useCancelarEmissao();
  const deleteNF = useDeleteNotaFiscal();

  const handleCancelar = useCallback((id: string) => {
    if (!window.confirm('Desfazer a emissão? Isso vai remover a entrada agendada no caixa.')) return;
    cancelarEmissao.mutate(id, {
      onSuccess: () => toast.success('Emissão desfeita. Entrada removida do caixa.'),
      onError: (error) => toast.error(error.message),
    });
  }, [cancelarEmissao]);

  const handleExcluir = useCallback((nf: NotaFiscal) => {
    const msg = nf.emitida
      ? 'Esta NF está emitida. Excluir também vai remover a entrada no caixa. Continuar?'
      : 'Excluir esta nota fiscal?';
    if (!window.confirm(msg)) return;
    deleteNF.mutate(nf.id, {
      onSuccess: () => toast.success('Nota fiscal removida'),
      onError: (error) => toast.error(error.message),
    });
  }, [deleteNF]);

  const nfColumns = useMemo(
    (): Column<NotaFiscal>[] => [
      {
        header: 'NF',
        sortable: true,
        sortAccessor: (nf) => nf.numero,
        cell: (nf) => <strong className={nf.emitida ? 'opacity-75' : ''}>{nf.numero}</strong>,
      },
      {
        header: 'Contrato/Cliente',
        cell: (nf) => {
          const c = contractById(nf.contractId);
          return (
            <div>
              <div>{contractName(c) || '—'}</div>
              <div className="text-sm text-muted-foreground">{contractClient(c) || '—'}</div>
            </div>
          );
        },
      },
      {
        header: 'Valor',
        align: 'right',
        sortable: true,
        sortAccessor: (nf) => nf.valor,
        cell: (nf) => <span className="font-bold">{formatBRL(num(nf.valor))}</span>,
      },
      {
        header: 'Data Limite',
        sortable: true,
        sortAccessor: (nf) => nf.dataLimite,
        cell: (nf) => formatDate(nf.dataLimite),
      },
      {
        header: 'Recebimento',
        cell: (nf) => {
          const dtRec = dataRecebimento(nf);
          const prazo = prazoOf(nf);
          const diasRec = dtRec
            ? Math.floor((dtRec.getTime() - Date.now()) / 86_400_000)
            : null;
          return (
            <div>
              <div className={`text-sm font-semibold ${nf.emitida ? 'text-blue-600' : 'text-muted-foreground'}`}>
                {dtRec ? dtRec.toLocaleDateString('pt-BR') : '—'}
              </div>
              <div className="text-sm text-muted-foreground">
                {prazo}d após emissão
                {nf.emitida && diasRec !== null && diasRec >= 0
                  ? ` · em ${diasRec}d`
                  : nf.emitida && diasRec !== null && diasRec < 0
                    ? ' · recebido'
                    : ''}
              </div>
            </div>
          );
        },
      },
      {
        header: 'Situação',
        cell: (nf) => {
          if (nf.emitida) {
            return (
              <div>
                <Badge style={{ background: 'rgba(56,161,105,.15)', color: '#38A169' }} className="gap-1"><Check className="size-3" />EMITIDA</Badge>
                <div className="text-sm text-muted-foreground mt-0.5">em {formatDate(nf.dataEmissaoReal)}</div>
              </div>
            );
          }
          const st = getNotaFiscalStatus(nf.dataLimite);
          return (
            <div>
              <Badge variant={st.status === 'vencida' ? 'destructive' : st.status === 'proximo_vencer' ? 'warning' : 'success'} className="gap-1">
                {st.status === 'vencida' ? <><AlertCircle className="size-3" />Vencida</> : st.status === 'proximo_vencer' ? <><AlertTriangle className="size-3" />Próxima</> : <><CheckCircle2 className="size-3" />No prazo</>}
              </Badge>
              <div className="text-sm text-muted-foreground mt-0.5">
                {st.status === 'vencida'
                  ? `${Math.abs(diasAteMeioDia(nf.dataLimite))}d atrás`
                  : `em ${st.dias}d`}
              </div>
            </div>
          );
        },
      },
      {
        header: 'Ações',
        cell: (nf) => (
          <div className="flex flex-wrap gap-2">
            {!nf.emitida ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-green-600 font-semibold"
                onClick={(e) => { e.stopPropagation(); onEmitir(nf.id); }}
              >
                <Check className="size-4 mr-1" /> Marcar Emitida
              </Button>
            ) : (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={(e) => { e.stopPropagation(); handleCancelar(nf.id); }}
              >
                <Undo2 className="size-4 mr-1" /> Desfazer
              </Button>
            )}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={(e) => { e.stopPropagation(); onEditar(nf); }}
            >
              Editar
            </Button>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-destructive"
              onClick={(e) => { e.stopPropagation(); handleExcluir(nf); }}
            >
              Excluir
            </Button>
          </div>
        ),
      },
    ],
    [contractById, onEmitir, onEditar, handleCancelar, handleExcluir],
  );

  const nfFilters = useMemo(
    (): FacetedFilter<NotaFiscal>[] => [
      {
        id: 'situacao',
        label: 'Situação',
        accessor: (nf) => (nf.emitida ? 'emitida' : 'pendente'),
        options: [
          { label: 'Pendente', value: 'pendente' },
          { label: 'Emitida', value: 'emitida' },
        ],
      },
    ],
    [],
  );

  if (notas.length === 0) {
    return (
      <Card>
        <p className="text-muted" style={{ padding: 'var(--sp-lg)' }}>
          Nenhuma nota fiscal registrada
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <DataTable
        rows={notas}
        columns={nfColumns}
        rowKey={(nf) => nf.id}
        onRowClick={(nf) => onDetalhe(nf.id)}
        emptyMessage="Nenhuma nota fiscal encontrada"
        searchPlaceholder="Buscar por NF, contrato ou cliente…"
        globalFilterFn={(nf, q) => {
          const c = contractById(nf.contractId);
          return (
            nf.numero.toLowerCase().includes(q) ||
            contractName(c).toLowerCase().includes(q) ||
            contractClient(c).toLowerCase().includes(q)
          );
        }}
        filters={nfFilters}
      />
    </Card>
  );
}

interface SemanalTabProps {
  notas: NotaFiscal[];
  contractById: (id?: string) => Contract | undefined;
}

function SemanalTab({ notas, contractById }: SemanalTabProps) {
  const semanas = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const lista: { inicio: Date; fim: Date }[] = [];
    for (let s = 0; s < 5; s++) {
      const inicio = new Date(hoje);
      inicio.setDate(hoje.getDate() - hoje.getDay() + s * 7);
      const fim = new Date(inicio);
      fim.setDate(inicio.getDate() + 6);
      lista.push({ inicio, fim });
    }
    return lista;
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      {semanas.map((sem, idx) => {
        const nfsSem = notas
          .filter((nf) => {
            const d = new Date(`${nf.dataLimite}T12:00:00`);
            return d >= sem.inicio && d <= sem.fim;
          })
          .sort(
            (a, b) =>
              new Date(a.dataLimite).getTime() -
              new Date(b.dataLimite).getTime(),
          );
        const temRisco = nfsSem.some(
          (nf) => getNotaFiscalStatus(nf.dataLimite).status !== 'no_prazo',
        );
        const label =
          idx === 0
            ? 'Esta semana'
            : idx === 1
              ? 'Próxima semana'
              : `Em ${idx} semanas`;
        const cor = temRisco
          ? 'var(--color-warning)'
          : nfsSem.length > 0
            ? 'var(--color-primary)'
            : 'var(--color-border)';

        return (
          <Card
            key={idx}
            style={{ borderLeft: `4px solid ${cor}` }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: nfsSem.length > 0 ? 'var(--sp-md)' : 0,
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {sem.inicio.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                  })}{' '}
                  —{' '}
                  {sem.fim.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </div>
              </div>
              <span
                style={{
                  fontWeight: 700,
                  color:
                    nfsSem.length > 0
                      ? 'var(--color-primary)'
                      : 'var(--color-text-muted)',
                }}
              >
                {nfsSem.length} NF{nfsSem.length !== 1 ? 's' : ''}
              </span>
            </div>
            {nfsSem.length > 0 ? (
              <div className="table-wrap">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NF</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Data Limite</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nfsSem.map((nf) => {
                      const st = getNotaFiscalStatus(nf.dataLimite);
                      const StatusIcon =
                        st.status === 'vencida'
                          ? AlertCircle
                          : st.status === 'proximo_vencer'
                            ? AlertTriangle
                            : CheckCircle2;
                      return (
                        <TableRow key={nf.id}>
                          <TableCell>
                            <strong>{nf.numero}</strong>
                          </TableCell>
                          <TableCell>
                            {contractClient(contractById(nf.contractId)) || '—'}
                          </TableCell>
                          <TableCell>{formatDate(nf.dataLimite)}</TableCell>
                          <TableCell>
                            <Badge variant={st.status === 'vencida' ? 'destructive' : st.status === 'proximo_vencer' ? 'warning' : 'success'} className="gap-1">
                              <StatusIcon className="size-3" /> {st.dias >= 0 ? `${st.dias}d` : 'Vencida'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p
                style={{
                  color: 'var(--color-text-muted)',
                  fontSize: 13,
                  margin: 0,
                }}
              >
                Nenhuma nota fiscal nesta semana
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface MensalTabProps {
  notas: NotaFiscal[];
  currentMonth: Date;
  onChangeMonth: (d: Date) => void;
}

function MensalTab({ notas, currentMonth, onChangeMonth }: MensalTabProps) {
  const ano = currentMonth.getFullYear();
  const mes = currentMonth.getMonth();
  const numDias = new Date(ano, mes + 1, 0).getDate();
  const primeiroDia = new Date(ano, mes, 1).getDay();

  const nfsMes = notas.filter((nf) => {
    const d = new Date(`${nf.dataLimite}T12:00:00`);
    return d.getFullYear() === ano && d.getMonth() === mes;
  });

  const celulas: (number | null)[] = [];
  for (let i = 0; i < primeiroDia; i++) celulas.push(null);
  for (let i = 1; i <= numDias; i++) celulas.push(i);
  const linhas: (number | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) linhas.push(celulas.slice(i, i + 7));

  const hoje = new Date();
  const shift = (delta: number) =>
    onChangeMonth(new Date(ano, mes + delta, 1));

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <Button size="sm" variant="secondary" onClick={() => shift(-1)}>
          ← Anterior
        </Button>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          {currentMonth.toLocaleDateString('pt-BR', {
            month: 'long',
            year: 'numeric',
          })}
        </h3>
        <Button size="sm" variant="secondary" onClick={() => shift(1)}>
          Próximo →
        </Button>
      </div>
      <Card>
        <Table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <TableHeader>
            <TableRow>
              {DIAS_SEMANA.map((d) => (
                <TableHead
                  key={d}
                  style={{
                    padding: 'var(--sp-sm)',
                    textAlign: 'center',
                    fontSize: 13,
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  {d}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha, li) => (
              <TableRow key={li}>
                {Array.from({ length: 7 }, (_, i) => {
                  const dia = linha[i] ?? null;
                  if (!dia) {
                    return (
                      <TableCell key={i} style={{ background: 'var(--color-bg)' }} />
                    );
                  }
                  const nfsDia = nfsMes.filter(
                    (nf) =>
                      new Date(`${nf.dataLimite}T12:00:00`).getDate() === dia,
                  );
                  const ehHoje =
                    hoje.getDate() === dia &&
                    hoje.getMonth() === mes &&
                    hoje.getFullYear() === ano;
                  return (
                    <TableCell
                      key={i}
                      style={{
                        border: '1px solid var(--color-border)',
                        padding: 'var(--sp-sm)',
                        verticalAlign: 'top',
                        background: ehHoje ? 'rgba(46,125,82,.06)' : 'white',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: ehHoje ? 800 : 500,
                          fontSize: 13,
                          marginBottom: 4,
                          color: ehHoje ? 'var(--color-primary)' : 'inherit',
                        }}
                      >
                        {dia}
                      </div>
                      {nfsDia.map((nf) => {
                        const st = getNotaFiscalStatus(nf.dataLimite);
                        const StatusIcon =
                          st.status === 'vencida'
                            ? AlertCircle
                            : st.status === 'proximo_vencer'
                              ? AlertTriangle
                              : CheckCircle2;
                        return (
                          <div
                            key={nf.id}
                            title={`NF ${nf.numero}`}
                            className="flex items-center gap-1"
                            style={{
                              fontSize: 12,
                              padding: '2px 4px',
                              marginBottom: 2,
                              borderRadius: 3,
                              background: 'var(--color-primary)',
                              color: 'white',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <StatusIcon className="size-3 shrink-0" /> NF {nf.numero}
                          </div>
                        );
                      })}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

interface NFModalProps {
  nf: NotaFiscal | null;
  contratos: Contract[];
  onClose: () => void;
}

/** Modal de criação/edição de nota fiscal. */
function NFModal({ nf, contratos, onClose }: NFModalProps) {
  const createNF = useCreateNotaFiscal();
  const updateNF = useUpdateNotaFiscal();
  const isEdit = nf !== null;

  const [numero, setNumero] = useState(nf?.numero ?? '');
  const [valor, setValor] = useState(nf ? String(nf.valor) : '');
  const [contractId, setContractId] = useState(nf?.contractId ?? '');
  const [dataLimite, setDataLimite] = useState(nf?.dataLimite ?? '');
  const [prazoRecebimento, setPrazoRecebimento] = useState(
    String(nf?.prazoRecebimento ?? PRAZO_PADRAO),
  );
  const [dataEmissaoReal, setDataEmissaoReal] = useState(
    nf?.dataEmissaoReal ?? '',
  );
  const [observacoes, setObservacoes] = useState(nf?.observacoes ?? '');

  const saving = createNF.isPending || updateNF.isPending;
  const cliente = contractClient(contratos.find((c) => c.id === contractId));

  const baseData = nf?.emitida ? dataEmissaoReal : dataLimite;
  const previewRecebimento = (() => {
    if (!baseData) return null;
    const d = new Date(`${baseData}T12:00:00`);
    d.setDate(d.getDate() + (Number.parseInt(prazoRecebimento, 10) || 0));
    return d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  })();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!numero.trim()) {
      toast.error('Número da NF é obrigatório');
      return;
    }
    if (!contractId) {
      toast.error('Selecione o contrato');
      return;
    }
    if (!dataLimite) {
      toast.error('Informe a data limite');
      return;
    }
    const valorNum = Number.parseFloat(valor) || 0;
    if (valorNum <= 0) {
      toast.error('Valor inválido');
      return;
    }
    const prazoNum = Number.parseInt(prazoRecebimento, 10);

    const input: NotaFiscalInput = {
      numero: numero.trim(),
      contractId,
      dataLimite,
      valor: valorNum,
      prazoRecebimento: Number.isFinite(prazoNum) ? prazoNum : PRAZO_PADRAO,
      observacoes: observacoes.trim() || undefined,
    };
    if (nf?.emitida && dataEmissaoReal) {
      input.dataEmissaoReal = dataEmissaoReal;
    }

    const onSuccess = () => {
      toast.success(
        isEdit ? 'Nota fiscal atualizada' : 'Nota fiscal criada'
);
      onClose();
    };
    const onError = (error: Error) => toast.error(error.message);

    if (isEdit && nf) {
      updateNF.mutate({ id: nf.id, input }, { onSuccess, onError });
    } else {
      createNF.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Nota Fiscal' : 'Nova Nota Fiscal'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <form id="form-nf" onSubmit={handleSubmit}>
            <div className="form-row">
              <FormField label="Número da Nota Fiscal *" htmlFor="nf-numero">
                <Input
                  id="nf-numero"
                  value={numero}
                  onChange={(event) => setNumero(event.target.value)}
                  required
                  placeholder="Ex.: 1234/2026"
                />
              </FormField>
              <FormField label="Valor da NF (R$) *" htmlFor="nf-valor">
                <Input
                  id="nf-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={valor}
                  onChange={(event) => setValor(event.target.value)}
                  required
                />
              </FormField>
            </div>

            <FormField label="Contrato *" htmlFor="nf-contrato">
              <Combobox
                id="nf-contrato"
                options={contratos.map((c) => ({ value: c.id, label: contractName(c) ?? '' }))}
                value={contractId}
                onChange={setContractId}
                placeholder="Selecionar..."
                searchPlaceholder="Pesquisar contrato..."
                emptyText="Nenhum contrato encontrado."
              />
            </FormField>

            <FormField label="Cliente" htmlFor="nf-cliente">
              <Input
                id="nf-cliente"
                value={cliente}
                readOnly
                style={{ background: 'var(--color-bg)' }}
              />
            </FormField>

            <div className="form-row">
              <FormField label="Data Limite para Emissão *" htmlFor="nf-limite">
                <DatePicker
                  id="nf-limite"
                  value={dataLimite}
                  onChange={(val) => setDataLimite(val)}
                />
              </FormField>
              <FormField
                label="Prazo de Recebimento (dias) *"
                htmlFor="nf-prazo"
                helper="Dias após a emissão até o pagamento entrar no caixa"
              >
                <Input
                  id="nf-prazo"
                  type="number"
                  min="0"
                  max="365"
                  value={prazoRecebimento}
                  onChange={(event) => setPrazoRecebimento(event.target.value)}
                  required
                />
              </FormField>
            </div>

            {nf?.emitida && (
              <FormField
                label="Data de Emissão Real"
                htmlFor="nf-emissao"
                helper="NF emitida — altere para recalcular o recebimento"
              >
                <DatePicker
                  id="nf-emissao"
                  value={dataEmissaoReal}
                  onChange={(val) => setDataEmissaoReal(val)}
                />
              </FormField>
            )}

            {previewRecebimento && (
              <div
                style={{
                  padding: 'var(--sp-md)',
                  background: 'rgba(46,125,82,.07)',
                  border: '1px solid rgba(46,125,82,.2)',
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <DollarSign className="size-4 inline mr-1" />Recebimento previsto: <strong>{previewRecebimento}</strong>
              </div>
            )}

            <FormField label="Observações" htmlFor="nf-obs">
              <Textarea
                id="nf-obs"
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
              />
            </FormField>
          </form>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-nf" disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EmitirModalProps {
  nf: NotaFiscal;
  contrato: Contract | undefined;
  onClose: () => void;
}

/** Modal de confirmação de emissão de NF. */
function EmitirModal({ nf, contrato, onClose }: EmitirModalProps) {
  const emitir = useEmitirNotaFiscal();
  const prazo = prazoOf(nf);

  const [dataEmissaoReal, setDataEmissaoReal] = useState(todayStr);

  const recebimento = (() => {
    if (!dataEmissaoReal) return null;
    const d = new Date(`${dataEmissaoReal}T12:00:00`);
    d.setDate(d.getDate() + prazo);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  })();

  function handleConfirmar() {
    if (!dataEmissaoReal) {
      toast.error('Informe a data de emissão');
      return;
    }
    emitir.mutate(
      { id: nf.id, dataEmissaoReal },
      {
        onSuccess: (result) => {
          toast.success(result.mensagem ?? 'NF marcada como emitida');
          onClose();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Check className="size-5" />{`Marcar NF ${nf.numero} como Emitida`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div
            style={{
              padding: 'var(--sp-md)',
              background: 'var(--color-bg)',
              borderRadius: 8,
              marginBottom: 'var(--sp-lg)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--sp-md)',
              fontSize: 13,
            }}
          >
            <InfoCell rotulo="Contrato" valor={contractName(contrato) || '—'} />
            <InfoCell rotulo="Cliente" valor={contractClient(contrato) || '—'} />
            <InfoCell
              rotulo="Valor"
              valor={formatBRL(num(nf.valor))}
              cor="var(--color-success)"
            />
            <InfoCell rotulo="Prazo Recebimento" valor={`${prazo} dias`} />
          </div>

          <FormField
            label="Data Real de Emissão *"
            htmlFor="emitir-data"
            helper="Normalmente hoje. Usada para calcular o recebimento no caixa."
          >
            <DatePicker
              id="emitir-data"
              value={dataEmissaoReal}
              onChange={(val) => setDataEmissaoReal(val)}
            />
          </FormField>

          <div
            style={{
              padding: 'var(--sp-md)',
              background: 'rgba(46,125,82,.08)',
              border: '1px solid rgba(46,125,82,.2)',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
              <DollarSign className="size-4 inline mr-1" />Entrada automática no caixa
            </div>
            <div style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
              {recebimento ? (
                <>
                  Recebimento ({prazo}d após emissão):{' '}
                  <strong style={{ color: 'var(--color-success)' }}>
                    {recebimento}
                  </strong>{' '}
                  — {formatBRL(num(nf.valor))}
                </>
              ) : (
                '—'
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={emitir.isPending}>
            Cancelar
          </Button>
          <Button
            variant="success"
            onClick={handleConfirmar}
            disabled={emitir.isPending}
          >
            {emitir.isPending ? 'Confirmando...' : <><Check className="size-4 mr-1" /> Confirmar Emissão</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoCell({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: string;
  cor?: string;
}) {
  return (
    <div>
      <div
        style={{
          color: 'var(--color-text-muted)',
          fontSize: 11,
          textTransform: 'uppercase',
        }}
      >
        {rotulo}
      </div>
      <div style={{ fontWeight: 700, color: cor }}>{valor}</div>
    </div>
  );
}

interface DetailModalProps {
  nf: NotaFiscal;
  contrato: Contract | undefined;
  onClose: () => void;
  onEmitir: () => void;
}

/** Modal de detalhe de uma nota fiscal. */
function DetailModal({ nf, contrato, onClose, onEmitir }: DetailModalProps) {
  const cancelarEmissao = useCancelarEmissao();
  const saidasQuery = useSaidas();
  const caixaQuery = useCaixa();

  const prazo = prazoOf(nf);
  const dtRec = dataRecebimento(nf);
  const diasRec = dtRec
    ? Math.floor((dtRec.getTime() - Date.now()) / 86_400_000)
    : null;
  const saidasVinculadas = (saidasQuery.data ?? []).filter(
    (s: Saida) => s.nfId === nf.id,
  );
  const totalSaidas = saidasVinculadas.reduce(
    (acc, s) => acc + num(s.value),
    0,
  );
  const caixaEntry: CaixaEntry | undefined = nf.caixaEntryId
    ? (caixaQuery.data ?? []).find((e) => e.id === nf.caixaEntryId)
    : undefined;

  function handleCancelar() {
    if (
      !window.confirm(
        'Desfazer a emissão? Isso vai remover a entrada agendada no caixa.',
      )
    ) {
      return;
    }
    cancelarEmissao.mutate(nf.id, {
      onSuccess: () => {
        toast.success('Emissão desfeita. Entrada removida do caixa.');
        onClose();
      },
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{`NF ${nf.numero}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div style={{ marginBottom: 'var(--sp-md)' }}>
            <Badge style={{
              background: nf.emitida ? 'rgba(56,161,105,.15)' : 'rgba(214,158,46,.12)',
              color: nf.emitida ? 'var(--color-success)' : 'var(--color-warning)',
            }}>
              {nf.emitida ? <><Check className="size-3 inline mr-1" />Emitida</> : 'Pendente'}
            </Badge>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--color-success)',
                marginLeft: 12,
              }}
            >
              {formatBRL(num(nf.valor))}
            </span>
          </div>

          <DetailRow
            label="Contrato"
            value={
              contrato ? (
                <Link
                  to={`/contratos/${contrato.id}`}
                  style={{ color: 'var(--color-primary)' }}
                >
                  {contractName(contrato)}
                </Link>
              ) : null
            }
          />
          <DetailRow label="Cliente" value={contractClient(contrato)} />
          <DetailRow label="Data limite" value={formatDate(nf.dataLimite)} />
          <DetailRow
            label="Prazo de recebimento"
            value={`${prazo} dia${prazo === 1 ? '' : 's'} após emissão`}
          />
          {nf.emitida && (
            <>
              <DetailRow label="Emitida em" value={formatDate(nf.dataEmissaoReal)} />
              {dtRec && (
                <DetailRow
                  label="Recebimento previsto"
                  value={
                    <>
                      {dtRec.toLocaleDateString('pt-BR')}{' '}
                      <span
                        style={{ color: 'var(--color-text-muted)', fontSize: 13 }}
                      >
                        ({diasRec !== null && diasRec >= 0
                          ? `em ${diasRec} dias`
                          : 'recebido'}
                        )
                      </span>
                    </>
                  }
                />
              )}
              {caixaEntry && (
                <DetailRow
                  label="Entrada no caixa"
                  value={`${String(caixaEntry.description ?? '')} em ${formatDate(
                    typeof caixaEntry.date === 'string'
                      ? caixaEntry.date
                      : undefined,
                  )}`}
                />
              )}
            </>
          )}
          {saidasVinculadas.length > 0 && (
            <DetailRow
              label="Medições vinculadas"
              value={`${saidasVinculadas.length} BM${
                saidasVinculadas.length > 1 ? 's' : ''
              } · total ${formatBRL(totalSaidas)}`}
            />
          )}
          <DetailRow label="Observações" value={nf.observacoes} />

          <div
            style={{
              fontSize: 12,
              color: 'var(--color-text-muted)',
              marginTop: 'var(--sp-md)',
              fontFamily: 'monospace',
            }}
          >
            ID: {nf.id}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          {nf.emitida ? (
            <Button variant="secondary" onClick={handleCancelar}>
              Desfazer emissão
            </Button>
          ) : (
            <Button variant="success" onClick={onEmitir}>
              Marcar emitida
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  if (!value) return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '7px 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
