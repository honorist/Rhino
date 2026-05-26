import { useCallback, useMemo, useState } from 'react';
import Button from '../../components/ui/button';
import Card from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import { useBase, useCaixa, useNotasFiscais, useTiposBase } from '../resources';
import {
  useDeleteBudgetItem,
  useDeleteSaida,
  useSaidas,
} from './queries';
import type { ContratoTabProps } from './ContratoDetail';
import type { BudgetItem } from './types';
import { computeVisaoGeral } from './visaoGeral';
import {
  computeCurvaS,
  linhasSaidas,
  orcadoPorTipo,
  type LinhaSaida,
} from './financeiro';
import CurvaSChart from './CurvaSChart';
import { buildBmInputFromSaida } from './bmFromSaida';
import { exportBmPdf } from './exportBmPdf';
import SaidaModal, { type SaidaEditavel } from './SaidaModal';
import OrcamentoModal from './OrcamentoModal';
import DataTable, { type Column } from '../../components/ui/data-table';

const n = (v: unknown): number => Number(v) || 0;

const TIPO_LABEL: Record<string, string> = {
  mao_de_obra: 'Mão de Obra',
  material: 'Material',
  hospedagem: 'Hospedagem',
  transporte: 'Transporte',
  base: 'Custo BASE',
  outros: 'Outros',
};
const TIPO_COR: Record<string, string> = {
  mao_de_obra: '#A78BFA',
  material: '#FB923C',
  hospedagem: '#22D3EE',
  transporte: '#34D399',
  base: '#60A5FA',
  outros: '#9CA3AF',
};

type ModalState =
  | { tipo: 'saida'; saida: SaidaEditavel | null }
  | { tipo: 'orcamento'; item: BudgetItem | null }
  | null;

/** Aba Financeiro do contrato — Curva S, orçamento e saídas. */
export default function FinanceiroTab({ contract }: ContratoTabProps) {
  const saidasQuery = useSaidas();
  const nfsQuery = useNotasFiscais();
  const caixaQuery = useCaixa();
  const baseQuery = useBase();
  const tiposBaseQuery = useTiposBase();
  const deletarSaida = useDeleteSaida();
  const deletarItem = useDeleteBudgetItem();

  const [modal, setModal] = useState<ModalState>(null);

  const data = useMemo(
    () =>
      computeVisaoGeral(contract, {
        saidas: saidasQuery.data ?? [],
        notasFiscais: nfsQuery.data ?? [],
        caixa: caixaQuery.data ?? [],
        base: baseQuery.data ?? [],
      }),
    [contract, saidasQuery.data, nfsQuery.data, caixaQuery.data, baseQuery.data],
  );

  const curvaS = useMemo(
    () =>
      computeCurvaS(contract, {
        notasFiscais: nfsQuery.data ?? [],
        saidas: saidasQuery.data ?? [],
        caixa: caixaQuery.data ?? [],
      }),
    [contract, nfsQuery.data, saidasQuery.data, caixaQuery.data],
  );

  const orcado = useMemo(() => orcadoPorTipo(contract), [contract]);
  const totalOrcado = Object.values(orcado).reduce((a, b) => a + b, 0);
  const valor = n(contract.value);

  const tipoLabel = (k: string): string => {
    if (TIPO_LABEL[k]) return TIPO_LABEL[k];
    const t = (tiposBaseQuery.data ?? []).find((x) => x.key === k);
    return t ? String(t.label ?? k) : k.replace(/_/g, ' ');
  };
  const tipoCor = (k: string): string => {
    if (TIPO_COR[k]) return TIPO_COR[k];
    const t = (tiposBaseQuery.data ?? []).find((x) => x.key === k);
    return t && t.cor ? String(t.cor) : '#9CA3AF';
  };

  const tiposComparar = [
    ...new Set([
      ...Object.keys(orcado),
      ...Object.keys(data.realizadoPorTipo).filter(
        (t) => data.realizadoPorTipo[t] > 0,
      ),
    ]),
  ];

  // ── Saídas classificadas (saídas + BASE + passagens + compras) ──
  const linhas = useMemo<LinhaSaida[]>(
    () =>
      linhasSaidas(contract.id, {
        saidas: saidasQuery.data ?? [],
        base: baseQuery.data ?? [],
        caixa: caixaQuery.data ?? [],
      }),
    [saidasQuery.data, baseQuery.data, caixaQuery.data, contract.id],
  );

  const pctOrcado = valor > 0 ? (totalOrcado / valor) * 100 : 0;
  const excedeu = totalOrcado > valor;

  const handleDeleteSaida = useCallback(
    (id: string) => {
      if (!window.confirm('Excluir esta saída?')) return;
      deletarSaida.mutate(id, {
        onSuccess: () => toast.success('Saída excluída'),
        onError: (e) => toast.error(e.message),
      });
    },
    [deletarSaida],
  );

  /** Gera o Boletim de Medição em PDF para a saída clicada. */
  const handleGerarBm = useCallback(
    async (saidaId: string) => {
      const input = buildBmInputFromSaida({
        contract,
        saidaId,
        saidas: (saidasQuery.data ?? []) as unknown as Array<Record<string, unknown>>,
        notasFiscais: (nfsQuery.data ?? []) as unknown as Array<Record<string, unknown>>,
      });
      if (!input) {
        toast.error('Saída não encontrada para gerar BM');
        return;
      }
      try {
        await exportBmPdf(input);
      } catch (e) {
        toast.error(`Erro ao gerar BM: ${(e as Error).message}`);
      }
    },
    [contract, saidasQuery.data, nfsQuery.data],
  );

  const handleDeleteItem = useCallback(
    (budgetId: string) => {
      if (!window.confirm('Excluir este item do orçamento?')) return;
      deletarItem.mutate(
        { contractId: contract.id, budgetId },
        {
          onSuccess: () => toast.success('Item removido'),
          onError: (e) => toast.error(e.message),
        },
      );
    },
    [deletarItem, contract.id],
  );

  const columnsBudget = useMemo<Column<BudgetItem>[]>(
    () => [
      {
        header: 'Descrição',
        cell: (b) => <strong>{b.description ?? '—'}</strong>,
      },
      {
        header: 'Categoria',
        cell: (b) => tipoLabel(String(b.type ?? 'outros')),
      },
      {
        header: 'Valor Orçado',
        align: 'right',
        cell: (b) => <span style={{ fontWeight: 600 }}>{formatBRL(n(b.value))}</span>,
        sortable: true,
        sortAccessor: (b) => n(b.value),
      },
      {
        header: 'Ações',
        hideable: false,
        cell: (b) => (
          <div
            className="actions-cell"
            onClick={(e) => e.stopPropagation()}
          >
            <a
              className="action-link"
              style={{ cursor: 'pointer' }}
              onClick={() => setModal({ tipo: 'orcamento', item: b })}
            >
              Editar
            </a>
            {b.id && (
              <a
                className="action-link danger"
                style={{ cursor: 'pointer' }}
                onClick={() => handleDeleteItem(b.id as string)}
              >
                Excluir
              </a>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setModal, handleDeleteItem, tiposBaseQuery.data],
  );

  const columnsSaidas = useMemo<Column<LinhaSaida>[]>(
    () => [
      {
        header: 'Data',
        cell: (l) => formatDateBR(l.date),
        sortable: true,
        sortAccessor: (l) => l.date,
      },
      {
        header: 'Descrição',
        cell: (l) => <strong>{l.description}</strong>,
      },
      {
        header: 'Tipo',
        cell: (l) => (
          <Badge
            style={{
              background: `${tipoCor(l.type)}22`,
              color: tipoCor(l.type),
            }}
          >
            {tipoLabel(l.type)}
          </Badge>
        ),
      },
      {
        header: 'Origem',
        cell: (l) => (
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {l.origem}
          </span>
        ),
      },
      {
        header: 'Valor',
        align: 'right',
        cell: (l) => <span style={{ fontWeight: 600 }}>{formatBRL(l.value)}</span>,
        sortable: true,
        sortAccessor: (l) => l.value,
      },
      {
        header: 'Ações',
        hideable: false,
        cell: (l) => (
          <div onClick={(e) => e.stopPropagation()}>
            {l.kind === 'saida' ? (
              <div className="actions-cell">
                <a
                  className="action-link"
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    setModal({
                      tipo: 'saida',
                      saida: {
                        id: l.id,
                        description: l.description,
                        type: l.type,
                        value: l.value,
                        date: l.date,
                      },
                    })
                  }
                >
                  Editar
                </a>
                <a
                  className="action-link btn-gerar-bm"
                  style={{ cursor: 'pointer' }}
                  title="Gerar Boletim de Medição (PDF)"
                  onClick={() => void handleGerarBm(l.id)}
                >
                  BM
                </a>
                <a
                  className="action-link danger"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleDeleteSaida(l.id)}
                >
                  Excluir
                </a>
              </div>
            ) : (
              <span className="text-muted" style={{ fontSize: 12 }}>
                —
              </span>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setModal, handleDeleteSaida, handleGerarBm, tiposBaseQuery.data],
  );

  return (
    <>
      <Card style={{ padding: 'var(--sp-lg)', marginBottom: 'var(--sp-lg)' }}>
        <h3 style={{ margin: '0 0 var(--sp-md)', fontSize: 15 }}>
          📈 Curva S — Planejado × Medido × Custo
        </h3>
        <CurvaSChart meses={curvaS} />
      </Card>

      <Card style={{ padding: 'var(--sp-lg)', marginBottom: 'var(--sp-lg)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--sp-md)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>
            Orçamento — Composição de Custo Planejado
          </h3>
          <Button
            size="sm"
            onClick={() => setModal({ tipo: 'orcamento', item: null })}
          >
            + Adicionar Item
          </Button>
        </div>
        {valor > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 'var(--sp-lg)',
              flexWrap: 'wrap',
              padding: '10px var(--sp-md)',
              background: 'var(--color-surface-2)',
              borderRadius: 6,
              marginBottom: 'var(--sp-lg)',
              fontSize: 14,
            }}
          >
            <span>
              Orçado <strong>{formatBRL(totalOrcado)}</strong> de{' '}
              {formatBRL(valor)} ({pctOrcado.toFixed(1)}%)
            </span>
            <span
              style={{
                color: excedeu
                  ? 'var(--color-danger)'
                  : 'var(--color-success)',
                fontWeight: 700,
              }}
            >
              {excedeu ? '▼ Excedeu ' : '▲ Disponível '}
              {formatBRL(Math.abs(valor - totalOrcado))}
            </span>
          </div>
        )}

        {tiposComparar.length === 0 ? (
          <p className="text-muted">Nenhum item de orçamento cadastrado.</p>
        ) : (
          tiposComparar.map((tipo) => {
            const orc = orcado[tipo] ?? 0;
            const real = data.realizadoPorTipo[tipo] ?? 0;
            const pct = orc > 0 ? Math.min((real / orc) * 100, 100) : real > 0 ? 100 : 0;
            return (
              <div key={tipo} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    marginBottom: 3,
                  }}
                >
                  <strong>{tipoLabel(tipo)}</strong>
                  <span>
                    Orç. {formatBRL(orc)} · Real.{' '}
                    <strong
                      style={{
                        color:
                          real > orc && orc > 0
                            ? 'var(--color-danger)'
                            : 'var(--color-text)',
                      }}
                    >
                      {formatBRL(real)}
                    </strong>
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: 'var(--color-border)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background:
                        real > orc && orc > 0
                          ? 'var(--color-danger)'
                          : tipoCor(tipo),
                    }}
                  />
                </div>
              </div>
            );
          })
        )}

        {(contract.budget ?? []).length > 0 && (
          <div style={{ marginTop: 'var(--sp-md)' }}>
            <DataTable<BudgetItem>
              rows={contract.budget ?? []}
              columns={columnsBudget}
              rowKey={(b) => b.id ?? (b.description ?? '')}
              emptyMessage="Nenhum item de orçamento."
            />
          </div>
        )}
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--sp-md) var(--sp-lg)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>Saídas Classificadas</h3>
          <Button
            size="sm"
            onClick={() => setModal({ tipo: 'saida', saida: null })}
          >
            + Adicionar Saída
          </Button>
        </div>
        {linhas.length === 0 ? (
          <p className="text-muted" style={{ padding: 'var(--sp-lg)' }}>
            Nenhuma saída registrada.
          </p>
        ) : (
          <>
            <DataTable<LinhaSaida>
              rows={linhas}
              columns={columnsSaidas}
              rowKey={(l) => `${l.kind}-${l.id}`}
              emptyMessage="Nenhuma saída registrada."
              searchPlaceholder="Buscar saída..."
              globalFilterFn={(l, q) =>
                l.description.toLowerCase().includes(q) ||
                l.origem.toLowerCase().includes(q) ||
                tipoLabel(l.type).toLowerCase().includes(q)
              }
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: 'var(--sp-md) var(--sp-lg)',
                fontWeight: 700,
                borderTop: '1px solid var(--color-border)',
              }}
            >
              <span>Total realizado</span>
              <span style={{ color: 'var(--color-danger)' }}>
                {formatBRL(data.totalRealizado)}
              </span>
            </div>
          </>
        )}
      </Card>

      {modal?.tipo === 'saida' && (
        <SaidaModal
          contractId={contract.id}
          saida={modal.saida}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'orcamento' && (
        <OrcamentoModal
          contractId={contract.id}
          item={modal.item}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
