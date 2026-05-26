import { useCallback, useMemo, useState } from 'react';
import Button from '../../components/ui/button';
import Card from '../../components/ui/card';
import Spinner from '../../components/ui/spinner';
import { toast } from 'sonner';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import type { ContratoTabProps } from './ContratoDetail';
import type { Atividade } from './types';
import { useAtividades, useDeleteAtividade } from './queries';
import { resumoCronograma } from './cronograma';
import GanttContrato from './GanttContrato';
import AtividadeModal from './AtividadeModal';
import DataTable, { type Column } from '../../components/ui/data-table';

function corExec(p: number): string {
  if (p >= 100) return 'var(--color-success)';
  if (p >= 50) return '#3b82f6';
  if (p > 0) return '#F59E0B';
  return 'var(--color-text-muted)';
}

function ResumoCard({
  label,
  valor,
  cor,
  sub,
}: {
  label: string;
  valor: string;
  cor: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: 10,
        background: 'var(--color-surface-2)',
        borderRadius: 6,
        borderLeft: `3px solid ${cor}`,
      }}
    >
      <div className="text-muted" style={{ fontSize: 13 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: cor }}>{valor}</div>
      {sub && (
        <div className="text-muted" style={{ fontSize: 12 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** Aba Cronograma do contrato — etapas físico-financeiras + Gantt. */
export default function CronogramaTab({ contract }: ContratoTabProps) {
  const atividadesQuery = useAtividades(contract.id);
  const deletar = useDeleteAtividade(contract.id);
  const [modal, setModal] = useState<{ atividade: Atividade | null } | null>(
    null,
  );

  const atividades = atividadesQuery.data ?? [];
  const resumo = resumoCronograma(atividades);
  const pesoOk = Math.abs(resumo.totalPeso - 100) < 0.01;

  const handleExcluir = useCallback(
    (a: Atividade) => {
      if (!window.confirm(`Excluir a etapa "${a.nome}"?`)) return;
      deletar.mutate(a.id, {
        onSuccess: () => toast.success('Etapa excluída'),
        onError: (e) => toast.error(e.message),
      });
    },
    [deletar],
  );

  const columnsAtividades = useMemo<Column<Atividade>[]>(
    () => [
      {
        header: 'Etapa',
        cell: (a) => (
          <>
            <strong>{a.nome}</strong>
            {a.notas && (
              <div className="text-muted" style={{ fontSize: 13 }}>
                {a.notas}
              </div>
            )}
          </>
        ),
      },
      {
        header: 'Peso %',
        align: 'right',
        cell: (a) => (
          <span style={{ fontWeight: 600 }}>
            {(Number(a.pesoPct) || 0).toFixed(1)}%
          </span>
        ),
        sortable: true,
        sortAccessor: (a) => Number(a.pesoPct) || 0,
      },
      {
        header: 'Início plan.',
        cell: (a) => formatDateBR(a.dataInicioPlan),
        sortable: true,
        sortAccessor: (a) => a.dataInicioPlan ?? '',
      },
      {
        header: 'Fim plan.',
        cell: (a) => formatDateBR(a.dataFimPlan),
        sortable: true,
        sortAccessor: (a) => a.dataFimPlan ?? '',
      },
      {
        header: 'Custo plan.',
        align: 'right',
        cell: (a) => formatBRL(Number(a.custoPlan) || 0),
        sortable: true,
        sortAccessor: (a) => Number(a.custoPlan) || 0,
      },
      {
        header: '% Real',
        align: 'right',
        cell: (a) => {
          const exec = Number(a.execPct) || 0;
          return (
            <span style={{ fontWeight: 700, color: corExec(exec) }}>
              {exec.toFixed(0)}%
            </span>
          );
        },
        sortable: true,
        sortAccessor: (a) => Number(a.execPct) || 0,
      },
      {
        header: 'Ações',
        hideable: false,
        cell: (a) => (
          <div
            className="actions-cell"
            onClick={(e) => e.stopPropagation()}
          >
            <a
              className="action-link"
              style={{ cursor: 'pointer' }}
              onClick={() => setModal({ atividade: a })}
            >
              Editar
            </a>
            <a
              className="action-link danger"
              style={{ cursor: 'pointer' }}
              onClick={() => handleExcluir(a)}
            >
              Excluir
            </a>
          </div>
        ),
      },
    ],
    [setModal, handleExcluir],
  );

  return (
    <Card style={{ padding: 'var(--sp-lg)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--sp-md)',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>
            📅 Cronograma físico-financeiro
          </h3>
          <span className="text-muted" style={{ fontSize: 13 }}>
            Etapas com peso, datas planejadas e % executado
          </span>
        </div>
        <Button onClick={() => setModal({ atividade: null })}>
          + Nova etapa
        </Button>
      </div>

      {atividadesQuery.isLoading ? (
        <Spinner label="Carregando atividades..." />
      ) : atividadesQuery.isError ? (
        <div className="error-banner">Erro ao carregar o cronograma.</div>
      ) : atividades.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 'var(--sp-xl)',
            color: 'var(--color-text-muted)',
          }}
        >
          <div style={{ fontSize: 48 }}>📅</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            Nenhuma etapa cadastrada
          </div>
          <div style={{ fontSize: 13 }}>
            Crie etapas para acompanhar avanço físico × financeiro.
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 8,
              marginBottom: 'var(--sp-md)',
            }}
          >
            <ResumoCard
              label="Total etapas"
              valor={String(resumo.totalEtapas)}
              cor="#3b82f6"
            />
            <ResumoCard
              label="Soma de pesos"
              valor={`${resumo.totalPeso.toFixed(1)}%`}
              cor={pesoOk ? 'var(--color-success)' : '#F59E0B'}
              sub={pesoOk ? '✓ ok' : 'meta: 100%'}
            />
            <ResumoCard
              label="Avanço físico"
              valor={`${resumo.execGeral.toFixed(1)}%`}
              cor={corExec(resumo.execGeral)}
            />
            <ResumoCard
              label="Custo planejado"
              valor={formatBRL(resumo.totalCusto)}
              cor="#8b5cf6"
            />
          </div>

          <GanttContrato
            atividades={atividades}
            onBarClick={(a) => setModal({ atividade: a })}
          />

          <div style={{ marginTop: 'var(--sp-lg)' }}>
            <DataTable<Atividade>
              rows={atividades}
              columns={columnsAtividades}
              rowKey={(a) => a.id}
              emptyMessage="Nenhuma etapa cadastrada."
            />
          </div>
        </>
      )}

      {modal && (
        <AtividadeModal
          contractId={contract.id}
          contractStartDate={contract.startDate}
          atividade={modal.atividade}
          onClose={() => setModal(null)}
        />
      )}
    </Card>
  );
}
