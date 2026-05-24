import { useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import type { ContratoTabProps } from './ContratoDetail';
import type { Atividade } from './types';
import { useAtividades, useDeleteAtividade } from './queries';
import { resumoCronograma } from './cronograma';
import GanttContrato from './GanttContrato';
import AtividadeModal from './AtividadeModal';

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
  const toast = useToast();
  const atividadesQuery = useAtividades(contract.id);
  const deletar = useDeleteAtividade(contract.id);
  const [modal, setModal] = useState<{ atividade: Atividade | null } | null>(
    null,
  );

  const atividades = atividadesQuery.data ?? [];
  const resumo = resumoCronograma(atividades);
  const pesoOk = Math.abs(resumo.totalPeso - 100) < 0.01;

  function handleExcluir(a: Atividade) {
    if (!window.confirm(`Excluir a etapa "${a.nome}"?`)) return;
    deletar.mutate(a.id, {
      onSuccess: () => toast.show('Etapa excluída', 'success'),
      onError: (e) => toast.show(e.message, 'danger'),
    });
  }

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

          <div className="table-wrap" style={{ marginTop: 'var(--sp-lg)' }}>
            <table>
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th style={{ textAlign: 'right' }}>Peso %</th>
                  <th>Início plan.</th>
                  <th>Fim plan.</th>
                  <th style={{ textAlign: 'right' }}>Custo plan.</th>
                  <th style={{ textAlign: 'right' }}>% Real</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {atividades.map((a) => {
                  const exec = Number(a.execPct) || 0;
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.nome}</strong>
                        {a.notas && (
                          <div
                            className="text-muted"
                            style={{ fontSize: 13 }}
                          >
                            {a.notas}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {(Number(a.pesoPct) || 0).toFixed(1)}%
                      </td>
                      <td>{formatDateBR(a.dataInicioPlan)}</td>
                      <td>{formatDateBR(a.dataFimPlan)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {formatBRL(Number(a.custoPlan) || 0)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          color: corExec(exec),
                        }}
                      >
                        {exec.toFixed(0)}%
                      </td>
                      <td>
                        <div className="actions-cell">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
