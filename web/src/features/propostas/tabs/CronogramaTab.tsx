import Button from '../../../components/ui/Button';
import { Input, Textarea } from '../../../components/ui/controls';
import { localUid, type EditorTabProps, type FaseCronograma } from '../types';

/** Fases padrão exibidas quando o cronograma ainda está vazio. */
const FASES_PADRAO: FaseCronograma[] = [
  { id: 'fase_eng', fase: 'Engenharia', inicio: null, fim: null, duracaoDias: 0, ordem: 0 },
  { id: 'fase_aq', fase: 'Aquisições', inicio: null, fim: null, duracaoDias: 0, ordem: 1 },
  { id: 'fase_inst', fase: 'Instalação', inicio: null, fim: null, duracaoDias: 0, ordem: 2 },
  { id: 'fase_com', fase: 'Comissionamento', inicio: null, fim: null, duracaoDias: 0, ordem: 3 },
];

const GANTT_CORES = ['#1F497D', '#4F81BD', '#9BBB59', '#F79646', '#8064A2', '#4BACC6'];

/** Dias entre duas datas ISO (inclusivo). 0 se faltar alguma. */
function diasEntre(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const d1 = new Date(`${a}T00:00:00`).getTime();
  const d2 = new Date(`${b}T00:00:00`).getTime();
  if (Number.isNaN(d1) || Number.isNaN(d2)) return 0;
  return Math.max(0, Math.round((d2 - d1) / 86_400_000) + 1);
}

/** Aba Cronograma — fases editáveis + mini Gantt + prazo de execução. */
export default function CronogramaTab({ proposta, onChange }: EditorTabProps) {
  const fases =
    proposta.cronograma.length > 0 ? proposta.cronograma : FASES_PADRAO;

  const commit = (novas: FaseCronograma[]) => {
    onChange({ cronograma: novas.map((f, i) => ({ ...f, ordem: i })) });
  };

  function adicionar() {
    commit([
      ...fases,
      {
        id: localUid('fase'),
        fase: 'Nova fase',
        inicio: null,
        fim: null,
        duracaoDias: 0,
      },
    ]);
  }
  function editar(idx: number, patch: Partial<FaseCronograma>) {
    commit(
      fases.map((f, i) => {
        if (i !== idx) return f;
        const atualizada = { ...f, ...patch };
        if ('inicio' in patch || 'fim' in patch) {
          if (atualizada.inicio && atualizada.fim) {
            atualizada.duracaoDias = diasEntre(
              atualizada.inicio,
              atualizada.fim,
            );
          }
        }
        return atualizada;
      }),
    );
  }
  function remover(idx: number) {
    commit(fases.filter((_, i) => i !== idx));
  }

  const datas = fases
    .flatMap((f) => [f.inicio, f.fim])
    .filter((d): d is string => Boolean(d))
    .sort();
  const dataMin = datas[0] ?? null;
  const dataMax = datas[datas.length - 1] ?? null;
  const totalDias = diasEntre(dataMin, dataMax);

  return (
    <div className="card" style={{ padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#1F497D' }}>Cronograma</h3>
          <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Fases padrão pré-carregadas. Edite, adicione ou remova conforme o
            escopo.
          </p>
        </div>
        <Button variant="secondary" onClick={adicionar}>
          + Adicionar Fase
        </Button>
      </div>

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Fase</th>
              <th style={{ width: 160 }}>Início</th>
              <th style={{ width: 160 }}>Fim</th>
              <th style={{ width: 110 }}>Duração (dias)</th>
              <th style={{ width: 80 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {fases.map((f, idx) => (
              <tr key={f.id}>
                <td style={{ fontWeight: 600, color: '#64748b' }}>{idx + 1}</td>
                <td>
                  <Input
                    value={f.fase}
                    onChange={(e) => editar(idx, { fase: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    type="date"
                    value={f.inicio ?? ''}
                    onChange={(e) =>
                      editar(idx, { inicio: e.target.value || null })
                    }
                  />
                </td>
                <td>
                  <Input
                    type="date"
                    value={f.fim ?? ''}
                    onChange={(e) => editar(idx, { fim: e.target.value || null })}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    min={0}
                    value={f.duracaoDias}
                    onChange={(e) =>
                      editar(idx, { duracaoDias: Number(e.target.value) || 0 })
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    title="Remover"
                    onClick={() => remover(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#dc2626',
                      fontSize: 18,
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dataMin && dataMax ? (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 16,
            background: '#f8fafc',
          }}
        >
          <h4 style={{ margin: '0 0 12px', color: '#1F497D', fontSize: 14 }}>
            Visualização do Gantt
          </h4>
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{dataMin}</span>
            <span>{totalDias} dias</span>
            <span>{dataMax}</span>
          </div>
          {fases.map((f, i) => {
            if (!f.inicio || !f.fim) {
              return (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                    fontSize: 13,
                    color: '#94a3b8',
                  }}
                >
                  <div style={{ width: 160, flexShrink: 0 }}>{f.fase}</div>
                  <div
                    style={{
                      flex: 1,
                      height: 24,
                      background: '#e2e8f0',
                      borderRadius: 4,
                      position: 'relative',
                      opacity: 0.4,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: 11,
                      }}
                    >
                      sem datas
                    </span>
                  </div>
                </div>
              );
            }
            const offset = diasEntre(dataMin, f.inicio) - 1;
            const dur = diasEntre(f.inicio, f.fim);
            const left = totalDias > 0 ? (offset / totalDias) * 100 : 0;
            const width =
              totalDias > 0 ? Math.max((dur / totalDias) * 100, 2) : 100;
            return (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                  fontSize: 13,
                }}
              >
                <div style={{ width: 160, flexShrink: 0, color: '#0f172a' }}>
                  {f.fase}
                </div>
                <div
                  style={{
                    flex: 1,
                    height: 28,
                    background: '#e2e8f0',
                    borderRadius: 4,
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${width}%`,
                      height: '100%',
                      background: GANTT_CORES[i % GANTT_CORES.length],
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {dur}d
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            textAlign: 'center',
            padding: 24,
            color: '#94a3b8',
            border: '2px dashed #e2e8f0',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          Preencha as datas para visualizar o gráfico de Gantt.
        </div>
      )}

      <div className="form-group" style={{ marginTop: 24 }}>
        <label className="form-label">
          Prazo total / observações de execução
        </label>
        <Textarea
          rows={3}
          value={proposta.prazoExecucao ?? ''}
          onChange={(e) => onChange({ prazoExecucao: e.target.value })}
          placeholder="Ex: Prazo total de execução: 45 dias úteis a partir da emissão da Ordem de Serviço."
        />
      </div>
    </div>
  );
}
