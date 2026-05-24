import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Select } from '../../components/ui/controls';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import {
  expandAll,
  frequencyLabel,
  isMaterialized,
  type VirtualOccurrence,
} from '../../lib/recurrence';
import type { CaixaEntry, ContaPagar, NotaFiscal } from '../../types/domain';
import type { Contract } from '../contracts/types';
import { useContracts } from '../contracts/queries';
import {
  useBase,
  useCaixa,
  useContasPagar,
  useCreateCaixa,
  useNotasFiscais,
  useRemoveCaixa,
  useUpdateCaixa,
} from '../resources';
import { useImportarOfx, type OfxResultado } from './queries';

const num = (v: unknown): number => Number(v) || 0;
const MS_DIA = 86_400_000;

type CaixaInput = Partial<Omit<CaixaEntry, 'id'>>;

interface Filtros {
  mes: string;
  dateFrom: string;
  dateTo: string;
  type: 'todos' | 'entrada' | 'saida';
  contractId: string;
}

const FILTROS_VAZIOS: Filtros = {
  mes: '',
  dateFrom: '',
  dateTo: '',
  type: 'todos',
  contractId: '',
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d?: string): string {
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '—';
}

function formatarMes(ym: string): string {
  if (!ym) return '';
  const [ano, mes] = ym.split('-').map(Number);
  const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface FutureItem {
  key: string;
  date: string;
  desc: string;
  tipo: 'entrada' | 'saida';
  origem: string;
  valor: number;
  virtual?: VirtualOccurrence;
}

/** Tela de Caixa — Lançamentos. Migração de js/views/Caixa.js. */
export default function Caixa() {
  const toast = useToast();
  const caixaQuery = useCaixa();
  const contractsQuery = useContracts();
  const contasQuery = useContasPagar();
  const notasQuery = useNotasFiscais();
  const baseQuery = useBase();
  const removeCaixa = useRemoveCaixa();
  const createCaixa = useCreateCaixa();
  const importarOfx = useImportarOfx();

  const [filters, setFilters] = useState<Filtros>(FILTROS_VAZIOS);
  const [entryModal, setEntryModal] = useState<{
    entry: CaixaEntry | null;
  } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [materializePrefill, setMaterializePrefill] =
    useState<MaterializePrefill | null>(null);
  const [virtSelecionadas, setVirtSelecionadas] = useState<Set<string>>(
    () => new Set(),
  );
  const [ofxResult, setOfxResult] = useState<OfxResultado | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const caixa = caixaQuery.data ?? [];
  const contratos = contractsQuery.data ?? [];
  const contasPagar = contasQuery.data ?? [];
  const notas = notasQuery.data ?? [];
  const baseItems = baseQuery.data ?? [];

  const contractById = (id?: string | null): Contract | undefined =>
    id ? contratos.find((c) => c.id === id) : undefined;

  const hoje = todayStr();
  const caixaPassado = caixa.filter((e) => (e.date || '') <= hoje);
  const caixaFuturo = caixa.filter((e) => (e.date || '') > hoje);

  let filtered = caixaPassado;
  if (filters.mes) {
    filtered = filtered.filter((e) => (e.date || '').slice(0, 7) === filters.mes);
  }
  if (filters.dateFrom) {
    filtered = filtered.filter((e) => e.date >= filters.dateFrom);
  }
  if (filters.dateTo) {
    filtered = filtered.filter((e) => e.date <= filters.dateTo);
  }
  if (filters.type !== 'todos') {
    filtered = filtered.filter((e) => e.type === filters.type);
  }
  if (filters.contractId) {
    filtered = filtered.filter((e) => e.contractId === filters.contractId);
  }

  const totalEntradas = filtered
    .filter((e) => e.type === 'entrada')
    .reduce((s, e) => s + num(e.value), 0);
  const totalSaidas = filtered
    .filter((e) => e.type === 'saida')
    .reduce((s, e) => s + num(e.value), 0);
  const saldo = totalEntradas - totalSaidas;
  const saldoGeral = caixaPassado.reduce(
    (s, e) => (e.type === 'entrada' ? s + num(e.value) : s - num(e.value)),
    0,
  );

  const contasFuturas = contasPagar.filter((c) => c.status === 'pendente');
  const futEntradas = caixaFuturo.filter((e) => e.type === 'entrada');
  const futSaidas = caixaFuturo.filter((e) => e.type === 'saida');

  const nfsFuturas: FutureItem[] = notas
    .filter((nf) => !nf.emitida && num(nf.valor) > 0)
    .map((nf) => {
      const prazo = Number.isFinite(Number(nf.prazoRecebimento))
        ? Number(nf.prazoRecebimento)
        : 30;
      const dtBase = new Date(`${nf.dataLimite}T12:00:00`);
      dtBase.setDate(dtBase.getDate() + prazo);
      const contrato = contractById(nf.contractId);
      return {
        key: `nf-${nf.id}`,
        date: dtBase.toISOString().slice(0, 10),
        desc: `NF ${nf.numero ?? ''}${
          contrato ? ` — ${String(contrato.name ?? '')}` : ''
        }`.trim(),
        tipo: 'entrada' as const,
        origem: `NF prevista · emissão até ${formatDate(nf.dataLimite)} +${prazo}d`,
        valor: num(nf.valor),
      };
    });

  const projUntil = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  })();
  const virtualOcorrencias = expandAll(baseItems, hoje, projUntil).filter(
    (o) => !isMaterialized(o, caixa),
  );

  const totalFutEntradas =
    futEntradas.reduce((s, e) => s + num(e.value), 0) +
    nfsFuturas.reduce((s, e) => s + e.valor, 0);
  const totalFutSaidas =
    futSaidas.reduce((s, e) => s + num(e.value), 0) +
    contasFuturas.reduce((s, c) => s + num(c.valor), 0) +
    virtualOcorrencias.reduce((s, o) => s + num(o.value), 0);
  const saldoProjetado = saldoGeral + totalFutEntradas - totalFutSaidas;

  const temFuturos =
    futEntradas.length > 0 ||
    futSaidas.length > 0 ||
    contasFuturas.length > 0 ||
    nfsFuturas.length > 0 ||
    virtualOcorrencias.length > 0;

  const futureItems: FutureItem[] = [
    ...futEntradas.map(
      (e): FutureItem => ({
        key: `fe-${e.id}`,
        date: e.date,
        desc: e.description,
        tipo: 'entrada',
        origem: 'Caixa agendado',
        valor: num(e.value),
      }),
    ),
    ...futSaidas.map(
      (e): FutureItem => ({
        key: `fs-${e.id}`,
        date: e.date,
        desc: e.description,
        tipo: 'saida',
        origem: 'Caixa agendado',
        valor: num(e.value),
      }),
    ),
    ...nfsFuturas,
    ...contasFuturas.map((c): FutureItem => {
      const dias = c.dataVencimento
        ? Math.floor((new Date(c.dataVencimento).getTime() - Date.now()) / MS_DIA)
        : 0;
      const label =
        dias < 0 ? `${Math.abs(dias)}d vencida` : dias === 0 ? 'vence hoje' : `em ${dias}d`;
      return {
        key: `cp-${c.id}`,
        date: c.dataVencimento || '9999-99-99',
        desc: c.descricao + (c.numeroNF ? ` — NF ${c.numeroNF}` : ''),
        tipo: 'saida',
        origem: `Conta a Pagar · ${label}`,
        valor: num(c.valor),
      };
    }),
    ...virtualOcorrencias.map(
      (o): FutureItem => ({
        key: `vo-${o.sourceId}-${o.date}`,
        date: o.date,
        desc: o.sourceDescription,
        tipo: 'saida',
        origem: `Recorrência BASE · ${frequencyLabel(o.frequency)}`,
        valor: o.value,
        virtual: o,
      }),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const mesesDisponiveis = [
    ...new Set(
      caixaPassado.map((e) => (e.date || '').slice(0, 7)).filter(Boolean),
    ),
  ]
    .sort()
    .reverse();

  const porMes: Record<
    string,
    { entradas: number; saidas: number; count: number }
  > = {};
  filtered.forEach((e) => {
    const ym = (e.date || '').slice(0, 7);
    if (!porMes[ym]) porMes[ym] = { entradas: 0, saidas: 0, count: 0 };
    if (e.type === 'entrada') porMes[ym].entradas += num(e.value);
    else porMes[ym].saidas += num(e.value);
    porMes[ym].count++;
  });
  const mesesAgrupados = Object.entries(porMes).sort(([a], [b]) =>
    b.localeCompare(a),
  );

  const filtrosAtivos =
    Boolean(filters.mes) ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    filters.type !== 'todos' ||
    Boolean(filters.contractId);

  function virtKey(o: VirtualOccurrence): string {
    return `${o.sourceId}|${o.date}`;
  }

  function toggleVirt(o: VirtualOccurrence) {
    setVirtSelecionadas((prev) => {
      const next = new Set(prev);
      const k = virtKey(o);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleTodas(marcar: boolean) {
    setVirtSelecionadas(
      marcar ? new Set(virtualOcorrencias.map(virtKey)) : new Set(),
    );
  }

  async function materializarSelecionadas() {
    const selecionadas = virtualOcorrencias.filter((o) =>
      virtSelecionadas.has(virtKey(o)),
    );
    if (selecionadas.length === 0) return;
    if (
      !window.confirm(
        `Materializar ${selecionadas.length} ocorrência(s) com os valores e datas previstos?`,
      )
    ) {
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const o of selecionadas) {
      try {
        const bulkInput: CaixaInput = {
          type: 'saida',
          description: o.sourceDescription,
          value: o.value,
          date: o.date,
          category: o.sourceTypeKey ?? undefined,
          baseItemId: o.sourceId,
          notes: 'Materializado em lote da recorrência BASE',
        };
        await createCaixa.mutateAsync(bulkInput);
        ok++;
      } catch {
        fail++;
      }
    }
    setVirtSelecionadas(new Set());
    toast.show(
      `${ok} criado${ok !== 1 ? 's' : ''}${
        fail > 0 ? ` · ${fail} falha${fail !== 1 ? 's' : ''}` : ''
      }`,
      fail > 0 ? 'danger' : 'success',
    );
  }

  function handleDelete(id: string) {
    if (!window.confirm('Excluir este lançamento?')) return;
    removeCaixa.mutate(id, {
      onSuccess: () => toast.show('Lançamento excluído', 'success'),
      onError: (error) => toast.show(error.message, 'danger'),
    });
  }

  function handleOfxFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void file.text().then((txt) => {
      importarOfx.mutate(txt, {
        onSuccess: (data) => setOfxResult(data),
        onError: (error) => toast.show(`Erro: ${error.message}`, 'danger'),
      });
    });
  }

  const detailEntry = detailId
    ? caixa.find((e) => e.id === detailId) ?? null
    : null;

  return (
    <>
      <PageHeader
        title="Caixa — Lançamentos"
        subtitle={`Saldo atual da empresa: ${formatBRL(saldoGeral)}`}
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".ofx,.OFX"
              style={{ display: 'none' }}
              onChange={handleOfxFile}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={importarOfx.isPending}
            >
              {importarOfx.isPending ? 'Processando...' : '🏦 Importar OFX'}
            </Button>
            <Button onClick={() => setEntryModal({ entry: null })}>
              + Novo Lançamento
            </Button>
          </>
        }
      />

      {caixaQuery.isLoading ? (
        <Spinner label="Carregando caixa..." />
      ) : caixaQuery.isError ? (
        <div className="card" style={{ padding: 24 }}>
          <p className="text-danger">Erro ao carregar caixa. Tente novamente.</p>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <KpiCard
              valor={`+${formatBRL(totalEntradas)}`}
              label={`Total Entradas ${filtrosAtivos ? '(filtrado)' : ''}`}
              cor="var(--color-success)"
            />
            <KpiCard
              valor={`-${formatBRL(totalSaidas)}`}
              label={`Total Saídas ${filtrosAtivos ? '(filtrado)' : ''}`}
              cor="var(--color-danger)"
            />
            <KpiCard
              valor={formatBRL(saldo)}
              label={`Saldo ${filtrosAtivos ? '(filtrado)' : 'Realizado'}`}
              cor={saldo >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}
            />
            <KpiCard
              valor={formatBRL(saldoProjetado)}
              label="Saldo Projetado"
              cor={
                saldoProjetado >= 0
                  ? 'var(--color-success)'
                  : 'var(--color-danger)'
              }
              tracejado
            />
          </div>

          {temFuturos && (
            <FuturosCard
              items={futureItems}
              totalEntradas={totalFutEntradas}
              totalSaidas={totalFutSaidas}
              virtuais={virtualOcorrencias}
              virtSelecionadas={virtSelecionadas}
              virtKey={virtKey}
              onToggleVirt={toggleVirt}
              onToggleTodas={toggleTodas}
              onMaterializarBulk={materializarSelecionadas}
              onMaterializarIndividual={(o) =>
                setMaterializePrefill({
                  sourceId: o.sourceId,
                  date: o.date,
                  value: o.value,
                  description: o.sourceDescription,
                  category: o.sourceTypeKey ?? '',
                })
              }
            />
          )}

          <FiltrosCard
            filters={filters}
            mesesDisponiveis={mesesDisponiveis}
            contratos={contratos}
            filtrados={filtered.length}
            totalPassado={caixaPassado.length}
            onChange={setFilters}
          />

          {!filters.mes && mesesAgrupados.length > 1 && (
            <div className="card mb-2xl">
              <div className="card-header">
                <h3 className="card-title">Resumo por Mês</h3>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th style={{ textAlign: 'right' }}>Entradas</th>
                      <th style={{ textAlign: 'right' }}>Saídas</th>
                      <th style={{ textAlign: 'right' }}>Saldo</th>
                      <th style={{ textAlign: 'right' }}>Lançamentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesesAgrupados.map(([ym, dados]) => {
                      const saldoMes = dados.entradas - dados.saidas;
                      return (
                        <tr
                          key={ym}
                          style={{ cursor: 'pointer' }}
                          onClick={() =>
                            setFilters((f) => ({ ...f, mes: ym }))
                          }
                        >
                          <td>
                            <strong>{formatarMes(ym)}</strong>
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              color: 'var(--color-success)',
                              fontWeight: 600,
                            }}
                          >
                            +{formatBRL(dados.entradas)}
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              color: 'var(--color-danger)',
                              fontWeight: 600,
                            }}
                          >
                            -{formatBRL(dados.saidas)}
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              color:
                                saldoMes >= 0
                                  ? 'var(--color-success)'
                                  : 'var(--color-danger)',
                            }}
                          >
                            {formatBRL(saldoMes)}
                          </td>
                          <td style={{ textAlign: 'right' }}>{dados.count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                Lançamentos{' '}
                {filters.mes ? `· ${formatarMes(filters.mes)}` : ''}
              </h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Tipo</th>
                    <th>Projeto/Contrato</th>
                    <th>Categoria</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center text-muted"
                        style={{ padding: 'var(--sp-xl)' }}
                      >
                        Nenhum lançamento encontrado
                      </td>
                    </tr>
                  ) : (
                    filtered
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(b.date).getTime() -
                          new Date(a.date).getTime(),
                      )
                      .map((e) => (
                        <LancamentoRow
                          key={e.id}
                          entry={e}
                          contrato={contractById(e.contractId)}
                          onDetalhe={() => setDetailId(e.id)}
                          onEditar={() => setEntryModal({ entry: e })}
                          onExcluir={() => handleDelete(e.id)}
                        />
                      ))
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr
                      style={{ background: 'var(--color-bg)', fontWeight: 700 }}
                    >
                      <td colSpan={5} style={{ padding: 'var(--sp-md)' }}>
                        Total
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: 'var(--sp-md)',
                          color:
                            saldo >= 0
                              ? 'var(--color-success)'
                              : 'var(--color-danger)',
                        }}
                      >
                        {formatBRL(saldo)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {entryModal && (
        <EntryModal
          key={entryModal.entry?.id ?? 'new'}
          entry={entryModal.entry}
          contratos={contratos}
          onClose={() => setEntryModal(null)}
        />
      )}

      {materializePrefill && (
        <MaterializeModal
          prefill={materializePrefill}
          contratos={contratos}
          onClose={() => setMaterializePrefill(null)}
        />
      )}

      {detailEntry && (
        <DetailModal
          entry={detailEntry}
          contrato={contractById(detailEntry.contractId)}
          contasPagar={contasPagar}
          notas={notas}
          baseItems={baseItems.map((b) => ({ id: b.id, description: b.description }))}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            const e = detailEntry;
            setDetailId(null);
            setEntryModal({ entry: e });
          }}
        />
      )}

      {ofxResult && (
        <OfxModal result={ofxResult} onClose={() => setOfxResult(null)} />
      )}
    </>
  );
}

interface MaterializePrefill {
  sourceId: string;
  date: string;
  value: number;
  description: string;
  category: string;
}

function KpiCard({
  valor,
  label,
  cor,
  tracejado,
}: {
  valor: string;
  label: string;
  cor: string;
  tracejado?: boolean;
}) {
  return (
    <div
      className="card stat-card"
      style={tracejado ? { border: '1px dashed var(--color-border)' } : undefined}
    >
      <div className="stat-value" style={{ color: cor }}>
        {valor}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

interface FuturosCardProps {
  items: FutureItem[];
  totalEntradas: number;
  totalSaidas: number;
  virtuais: VirtualOccurrence[];
  virtSelecionadas: Set<string>;
  virtKey: (o: VirtualOccurrence) => string;
  onToggleVirt: (o: VirtualOccurrence) => void;
  onToggleTodas: (marcar: boolean) => void;
  onMaterializarBulk: () => void;
  onMaterializarIndividual: (o: VirtualOccurrence) => void;
}

function FuturosCard({
  items,
  totalEntradas,
  totalSaidas,
  virtuais,
  virtSelecionadas,
  virtKey,
  onToggleVirt,
  onToggleTodas,
  onMaterializarBulk,
  onMaterializarIndividual,
}: FuturosCardProps) {
  const todasMarcadas =
    virtuais.length > 0 &&
    virtuais.every((o) => virtSelecionadas.has(virtKey(o)));
  const qtdMarcadas = virtuais.filter((o) =>
    virtSelecionadas.has(virtKey(o)),
  ).length;

  return (
    <div
      className="card"
      style={{
        marginBottom: 'var(--sp-lg)',
        border: '1px dashed var(--color-border)',
      }}
    >
      <div className="card-header" style={{ background: 'transparent' }}>
        <h3 className="card-title" style={{ color: 'var(--color-text-muted)' }}>
          ⏳ Lançamentos Futuros
        </h3>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          +{formatBRL(totalEntradas)} entradas · -{formatBRL(totalSaidas)} saídas
        </div>
      </div>
      <div className="table-wrap">
        {virtuais.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-md)',
              padding: 'var(--sp-sm) var(--sp-md)',
            }}
          >
            <label
              style={{
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <input
                type="checkbox"
                checked={todasMarcadas}
                onChange={(event) => onToggleTodas(event.target.checked)}
              />
              Selecionar todas as ocorrências previstas ({virtuais.length})
            </label>
            <Button
              size="sm"
              onClick={onMaterializarBulk}
              disabled={qtdMarcadas === 0}
              style={{ marginLeft: 'auto' }}
            >
              {qtdMarcadas === 0
                ? 'Materializar selecionadas'
                : `Materializar ${qtdMarcadas} selecionada${
                    qtdMarcadas !== 1 ? 's' : ''
                  }`}
            </Button>
          </div>
        )}
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th>Data</th>
              <th>Descrição</th>
              <th>Tipo</th>
              <th>Origem</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key} style={{ opacity: 0.8 }}>
                <td>
                  {item.virtual && (
                    <input
                      type="checkbox"
                      checked={virtSelecionadas.has(virtKey(item.virtual))}
                      onChange={() =>
                        item.virtual && onToggleVirt(item.virtual)
                      }
                    />
                  )}
                </td>
                <td
                  style={{
                    color: 'var(--color-text-muted)',
                    fontStyle: 'italic',
                  }}
                >
                  {item.date && item.date !== '9999-99-99'
                    ? formatDate(item.date)
                    : '—'}
                </td>
                <td style={{ color: 'var(--color-text-muted)' }}>
                  {item.desc}
                  {item.virtual && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: 'var(--color-info)',
                      }}
                    >
                      • previsto
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background:
                        item.tipo === 'entrada'
                          ? 'rgba(56,161,105,.12)'
                          : 'rgba(229,62,62,.12)',
                      color:
                        item.tipo === 'entrada'
                          ? 'var(--color-success)'
                          : 'var(--color-danger)',
                      border: `1px dashed ${
                        item.tipo === 'entrada'
                          ? 'var(--color-success)'
                          : 'var(--color-danger)'
                      }`,
                    }}
                  >
                    {item.tipo}
                  </span>
                </td>
                <td style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {item.origem}
                  {item.virtual && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      style={{ marginLeft: 8, fontSize: 11, padding: '3px 8px' }}
                      onClick={() =>
                        item.virtual && onMaterializarIndividual(item.virtual)
                      }
                    >
                      ajustar e materializar
                    </button>
                  )}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    fontWeight: 700,
                    color:
                      item.tipo === 'entrada'
                        ? 'var(--color-success)'
                        : 'var(--color-danger)',
                  }}
                >
                  {item.tipo === 'entrada' ? '+' : '-'}
                  {formatBRL(item.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FiltrosCardProps {
  filters: Filtros;
  mesesDisponiveis: string[];
  contratos: Contract[];
  filtrados: number;
  totalPassado: number;
  onChange: (f: Filtros) => void;
}

function FiltrosCard({
  filters,
  mesesDisponiveis,
  contratos,
  filtrados,
  totalPassado,
  onChange,
}: FiltrosCardProps) {
  const filtrosAtivos =
    Boolean(filters.mes) ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    filters.type !== 'todos' ||
    Boolean(filters.contractId);

  return (
    <div
      className="card"
      style={{ marginBottom: 'var(--sp-lg)', padding: 'var(--sp-md)' }}
    >
      <div
        style={{
          display: 'flex',
          gap: 'var(--sp-md)',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ flex: 1, minWidth: 160 }}>
          <FormField label="Mês" htmlFor="cx-mes">
            <Select
              id="cx-mes"
              value={filters.mes}
              onChange={(event) =>
                onChange({
                  ...filters,
                  mes: event.target.value,
                  dateFrom: '',
                  dateTo: '',
                })
              }
            >
              <option value="">Todos os meses</option>
              {mesesDisponiveis.map((m) => (
                <option key={m} value={m}>
                  {formatarMes(m)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <FormField label="Projeto/Contrato" htmlFor="cx-contrato">
            <Select
              id="cx-contrato"
              value={filters.contractId}
              onChange={(event) =>
                onChange({ ...filters, contractId: event.target.value })
              }
            >
              <option value="">Todos os contratos</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.name ?? '')}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div style={{ flex: '0 0 140px' }}>
          <FormField label="Tipo" htmlFor="cx-tipo">
            <Select
              id="cx-tipo"
              value={filters.type}
              onChange={(event) =>
                onChange({
                  ...filters,
                  type: event.target.value as Filtros['type'],
                })
              }
            >
              <option value="todos">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </Select>
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="De" htmlFor="cx-de">
            <Input
              id="cx-de"
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                onChange({
                  ...filters,
                  dateFrom: event.target.value,
                  mes: '',
                })
              }
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="Até" htmlFor="cx-ate">
            <Input
              id="cx-ate"
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                onChange({ ...filters, dateTo: event.target.value, mes: '' })
              }
            />
          </FormField>
        </div>
        <Button
          variant="secondary"
          onClick={() => onChange(FILTROS_VAZIOS)}
        >
          Limpar
        </Button>
      </div>
      {filtrosAtivos && (
        <div
          style={{
            marginTop: 'var(--sp-sm)',
            paddingTop: 'var(--sp-sm)',
            borderTop: '1px solid var(--color-border)',
            fontSize: 13,
            color: 'var(--color-primary)',
          }}
        >
          ✓ Filtros ativos · {filtrados} de {totalPassado} lançamento
          {totalPassado !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

interface LancamentoRowProps {
  entry: CaixaEntry;
  contrato: Contract | undefined;
  onDetalhe: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}

function LancamentoRow({
  entry,
  contrato,
  onDetalhe,
  onEditar,
  onExcluir,
}: LancamentoRowProps) {
  function stop(handler: () => void) {
    return (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      handler();
    };
  }

  let categoria: ReactNode;
  if (entry.contaPagarId || entry.category === 'conta_pagar') {
    categoria = (
      <CategoriaTag
        texto="Conta a Pagar"
        cor="var(--color-danger)"
        bg="rgba(229,62,62,.1)"
      />
    );
  } else if (entry.nfId || entry.category === 'nota_fiscal') {
    categoria = (
      <CategoriaTag
        texto="Conta a Receber"
        cor="var(--color-success)"
        bg="rgba(56,161,105,.1)"
      />
    );
  } else if (entry.baseItemId) {
    categoria = (
      <CategoriaTag texto="BASE" cor="var(--color-info)" bg="rgba(49,130,206,.1)" />
    );
  } else {
    categoria = (
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        Manual
      </span>
    );
  }

  return (
    <tr style={{ cursor: 'pointer' }} onClick={onDetalhe}>
      <td>{formatDate(entry.date)}</td>
      <td>
        <strong>{entry.description}</strong>
      </td>
      <td>
        <span className={`badge badge-${entry.type}`}>{entry.type}</span>
      </td>
      <td>
        {contrato ? (
          <>
            <Link
              to={`/contratos/${contrato.id}`}
              style={{
                color: 'var(--color-primary)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {String(contrato.name ?? '')}
            </Link>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {String(contrato.client ?? '')}
            </div>
          </>
        ) : entry.baseItemId ? (
          <span style={{ color: 'var(--color-info)' }}>BASE</span>
        ) : (
          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
        )}
      </td>
      <td>{categoria}</td>
      <td
        style={{
          textAlign: 'right',
          fontWeight: 700,
          color:
            entry.type === 'entrada'
              ? 'var(--color-success)'
              : 'var(--color-danger)',
        }}
      >
        {entry.type === 'entrada' ? '+' : '-'}
        {formatBRL(num(entry.value))}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            className="action-link"
            style={{ cursor: 'pointer' }}
            onClick={stop(onEditar)}
          >
            Editar
          </a>
          <a
            className="action-link danger"
            style={{ cursor: 'pointer' }}
            onClick={stop(onExcluir)}
          >
            Excluir
          </a>
        </div>
      </td>
    </tr>
  );
}

function CategoriaTag({
  texto,
  cor,
  bg,
}: {
  texto: string;
  cor: string;
  bg: string;
}) {
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: cor,
        background: bg,
        padding: '2px 7px',
        borderRadius: 4,
      }}
    >
      {texto}
    </span>
  );
}

interface EntryModalProps {
  entry: CaixaEntry | null;
  contratos: Contract[];
  onClose: () => void;
}

/** Modal de criação/edição de lançamento de caixa. */
function EntryModal({ entry, contratos, onClose }: EntryModalProps) {
  const toast = useToast();
  const createCaixa = useCreateCaixa();
  const updateCaixa = useUpdateCaixa();
  const isEdit = entry !== null;

  const [type, setType] = useState<'entrada' | 'saida'>(
    entry?.type ?? 'entrada',
  );
  const [date, setDate] = useState(entry?.date ?? todayStr());
  const [description, setDescription] = useState(entry?.description ?? '');
  const [value, setValue] = useState(entry ? String(entry.value) : '');
  const [category, setCategory] = useState(entry?.category ?? '');
  const [contractId, setContractId] = useState(entry?.contractId ?? '');

  const saving = createCaixa.isPending || updateCaixa.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!description.trim()) {
      toast.show('Descrição é obrigatória', 'danger');
      return;
    }
    const valorNum = Number.parseFloat(value) || 0;
    if (valorNum <= 0) {
      toast.show('Valor inválido', 'danger');
      return;
    }

    const input: CaixaInput = {
      type,
      date,
      description: description.trim(),
      value: valorNum,
      category: category.trim() || undefined,
      contractId: contractId || null,
    };

    const onSuccess = () => {
      toast.show(
        isEdit ? 'Lançamento atualizado' : 'Lançamento criado',
        'success',
      );
      onClose();
    };
    const onError = (error: Error) => toast.show(error.message, 'danger');

    if (isEdit && entry) {
      updateCaixa.mutate({ id: entry.id, input }, { onSuccess, onError });
    } else {
      createCaixa.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editar Lançamento' : 'Novo Lançamento'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-caixa" disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </>
      }
    >
      <form id="form-caixa" onSubmit={handleSubmit}>
        <div className="form-row">
          <FormField label="Tipo *" htmlFor="cx-type">
            <Select
              id="cx-type"
              value={type}
              onChange={(event) =>
                setType(event.target.value as 'entrada' | 'saida')
              }
            >
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </Select>
          </FormField>
          <FormField label="Data *" htmlFor="cx-date">
            <Input
              id="cx-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </FormField>
        </div>
        <FormField label="Descrição *" htmlFor="cx-desc">
          <Input
            id="cx-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </FormField>
        <div className="form-row">
          <FormField label="Valor (BRL) *" htmlFor="cx-value">
            <Input
              id="cx-value"
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          </FormField>
          <FormField label="Categoria" htmlFor="cx-cat">
            <Input
              id="cx-cat"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Ex.: Adiantamento, Pagamento..."
            />
          </FormField>
        </div>
        <FormField label="Vincular a Contrato" htmlFor="cx-contr">
          <Select
            id="cx-contr"
            value={contractId}
            onChange={(event) => setContractId(event.target.value)}
          >
            <option value="">Nenhum</option>
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {String(c.name ?? '')}
              </option>
            ))}
          </Select>
        </FormField>
      </form>
    </Modal>
  );
}

interface MaterializeModalProps {
  prefill: MaterializePrefill;
  contratos: Contract[];
  onClose: () => void;
}

/** Modal pré-preenchido para materializar uma ocorrência de recorrência. */
function MaterializeModal({ prefill, contratos, onClose }: MaterializeModalProps) {
  const toast = useToast();
  const createCaixa = useCreateCaixa();

  const [description, setDescription] = useState(prefill.description);
  const [date, setDate] = useState(prefill.date);
  const [value, setValue] = useState(String(prefill.value));
  const [category, setCategory] = useState(prefill.category);
  const [contractId, setContractId] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const valorNum = Number.parseFloat(value) || 0;
    if (valorNum <= 0) {
      toast.show('Valor inválido', 'danger');
      return;
    }
    const input: CaixaInput = {
      type: 'saida',
      description: description.trim(),
      date,
      value: valorNum,
      category: category.trim() || undefined,
      contractId: contractId || null,
      baseItemId: prefill.sourceId,
      notes: 'Materializado da recorrência BASE',
    };
    createCaixa.mutate(input, {
        onSuccess: () => {
          toast.show('Lançamento criado', 'success');
          onClose();
        },
        onError: (error) => toast.show(`Erro: ${error.message}`, 'danger'),
      },
    );
  }

  return (
    <Modal
      open
      title="Materializar recorrência"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={createCaixa.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="form-materializar"
            disabled={createCaixa.isPending}
          >
            {createCaixa.isPending ? 'Salvando...' : 'Materializar'}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        Ajuste valor/data se a saída real diferiu do previsto. O lançamento será
        vinculado à recorrência (não duplica).
      </p>
      <form id="form-materializar" onSubmit={handleSubmit}>
        <FormField label="Descrição *" htmlFor="mat-desc">
          <Input
            id="mat-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </FormField>
        <div className="form-row">
          <FormField label="Data *" htmlFor="mat-date">
            <Input
              id="mat-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </FormField>
          <FormField label="Valor (BRL) *" htmlFor="mat-value">
            <Input
              id="mat-value"
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          </FormField>
        </div>
        <FormField label="Categoria" htmlFor="mat-cat">
          <Input
            id="mat-cat"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </FormField>
        <FormField label="Vincular a Contrato (opcional)" htmlFor="mat-contr">
          <Select
            id="mat-contr"
            value={contractId}
            onChange={(event) => setContractId(event.target.value)}
          >
            <option value="">Nenhum</option>
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {String(c.name ?? '')}
              </option>
            ))}
          </Select>
        </FormField>
      </form>
    </Modal>
  );
}

interface DetailModalProps {
  entry: CaixaEntry;
  contrato: Contract | undefined;
  contasPagar: ContaPagar[];
  notas: NotaFiscal[];
  baseItems: { id: string; description: string }[];
  onClose: () => void;
  onEdit: () => void;
}

/** Modal de detalhe de um lançamento de caixa. */
function DetailModal({
  entry,
  contrato,
  contasPagar,
  notas,
  baseItems,
  onClose,
  onEdit,
}: DetailModalProps) {
  const isEntrada = entry.type === 'entrada';
  const cp = entry.contaPagarId
    ? contasPagar.find((c) => c.id === entry.contaPagarId)
    : undefined;
  const nf = entry.nfId ? notas.find((n) => n.id === entry.nfId) : undefined;
  const baseItem = entry.baseItemId
    ? baseItems.find((b) => b.id === entry.baseItemId)
    : undefined;

  return (
    <Modal
      open
      title={entry.description || 'Lançamento'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={onEdit}>Editar</Button>
        </>
      }
    >
      <div style={{ marginBottom: 'var(--sp-md)' }}>
        <span className={`badge badge-${entry.type}`} style={{ marginRight: 6 }}>
          {entry.type}
        </span>
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: isEntrada ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          {isEntrada ? '+' : '-'}
          {formatBRL(num(entry.value))}
        </span>
      </div>

      <DetailRow label="Data" value={formatDate(entry.date)} />
      <DetailRow label="Categoria" value={entry.category} />
      <DetailRow label="Forma de Pagto." value={entry.formaPagamento} />
      {contrato && (
        <DetailRow
          label="Contrato"
          value={
            <Link
              to={`/contratos/${contrato.id}`}
              style={{ color: 'var(--color-primary)' }}
            >
              {String(contrato.name ?? '')}
            </Link>
          }
        />
      )}
      <DetailRow label="Cliente" value={contrato ? String(contrato.client ?? '') : null} />
      <DetailRow label="Conta a Pagar" value={cp?.descricao} />
      {nf && (
        <DetailRow
          label="NF vinculada"
          value={`NF ${nf.numero} (${formatDate(nf.dataLimite)})`}
        />
      )}
      <DetailRow label="Item BASE" value={baseItem?.description} />
      <DetailRow label="Observações" value={entry.notes} />

      <div
        style={{
          fontSize: 12,
          color: 'var(--color-text-muted)',
          marginTop: 'var(--sp-md)',
          fontFamily: 'monospace',
        }}
      >
        ID: {entry.id}
      </div>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
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
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

interface OfxModalProps {
  result: OfxResultado;
  onClose: () => void;
}

/** Modal com o resultado da importação de extrato OFX. */
function OfxModal({ result, onClose }: OfxModalProps) {
  const conciliadas = result.total - result.novos;
  return (
    <Modal
      open
      title="🏦 Resultado da importação OFX"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <p style={{ marginBottom: 'var(--sp-md)' }}>
        <strong>{result.total}</strong> transações encontradas ·{' '}
        <span style={{ color: 'var(--color-success)' }}>
          {conciliadas} conciliadas
        </span>{' '}
        · <span style={{ color: '#D69E2E' }}>{result.novos} novas</span>
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Lançamento Rhino</th>
            </tr>
          </thead>
          <tbody>
            {result.transacoes.map((t, index) => (
              <tr key={index}>
                <td>{t.data}</td>
                <td style={{ maxWidth: 280, wordBreak: 'break-word' }}>
                  {t.memo || '—'}
                </td>
                <td
                  style={{
                    fontWeight: 700,
                    color:
                      t.tipo === 'entrada'
                        ? 'var(--color-success)'
                        : 'var(--color-danger)',
                  }}
                >
                  {t.tipo === 'saida' ? '-' : '+'}{' '}
                  {formatBRL(Math.abs(num(t.valor)))}
                </td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background:
                        t.status === 'conciliado' ? '#D1FAE5' : '#FEF3C7',
                      color: t.status === 'conciliado' ? '#065F46' : '#92400E',
                    }}
                  >
                    {t.status === 'conciliado' ? '✅ Conciliado' : '🆕 Novo'}
                  </span>
                </td>
                <td style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {t.match ? t.match.description : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
