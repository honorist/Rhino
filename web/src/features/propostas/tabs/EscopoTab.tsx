import Button from '../../../components/ui/button';
import Card from '../../../components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { localUid, type EditorTabProps, type EscopoItem } from '../types';

/**
 * Aba Escopo — lista única de itens com chip ESCOPO ↔ FORA DE ESCOPO.
 * Itens `incluso=true` viram a seção ESCOPO no DOCX; `false` viram EXCLUSÕES.
 */
export default function EscopoTab({ proposta, onChange }: EditorTabProps) {
  const itens = proposta.escopo;

  const commit = (novos: EscopoItem[]) => {
    onChange({ escopo: novos.map((it, i) => ({ ...it, ordem: i })) });
  };

  function adicionar() {
    commit([...itens, { id: localUid('esc'), texto: '', incluso: true }]);
  }
  function alternar(idx: number) {
    commit(
      itens.map((it, i) =>
        i === idx ? { ...it, incluso: !(it.incluso !== false) } : it,
      ),
    );
  }
  function editarTexto(idx: number, texto: string) {
    commit(itens.map((it, i) => (i === idx ? { ...it, texto } : it)));
  }
  function remover(idx: number) {
    commit(itens.filter((_, i) => i !== idx));
  }
  function mover(idx: number, delta: number) {
    const alvo = idx + delta;
    if (alvo < 0 || alvo >= itens.length) return;
    const novos = [...itens];
    [novos[idx], novos[alvo]] = [novos[alvo], novos[idx]];
    commit(novos);
  }

  const inclusos = itens.filter((i) => i.incluso !== false).length;

  return (
    <Card style={{ padding: 24 }}>
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
          <h3 style={{ margin: 0, color: '#1F497D' }}>Escopo e Exclusões</h3>
          <p
            className="text-muted"
            style={{ margin: '4px 0 0', fontSize: 13 }}
          >
            Clique no chip <strong>ESCOPO</strong> de cada linha para alternar
            para <strong>FORA DE ESCOPO</strong>. Itens "fora" aparecem na seção
            EXCLUSÕES do DOCX.
          </p>
        </div>
        <Button variant="secondary" onClick={adicionar}>
          + Adicionar Item
        </Button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 12,
          fontSize: 13,
          color: '#64748b',
        }}
      >
        <span>
          <span
            style={{
              background: '#10b981',
              color: 'white',
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 11,
            }}
          >
            ESCOPO
          </span>{' '}
          {inclusos} item(s)
        </span>
        <span>
          <span
            style={{
              background: '#dc2626',
              color: 'white',
              padding: '2px 8px',
              borderRadius: 10,
              fontSize: 11,
            }}
          >
            FORA
          </span>{' '}
          {itens.length - inclusos} item(s)
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {itens.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 32,
              color: '#94a3b8',
              border: '2px dashed #e2e8f0',
              borderRadius: 8,
            }}
          >
            Nenhum item ainda. Clique em "+ Adicionar Item" para começar.
          </div>
        ) : (
          itens.map((it, idx) => {
            const incluso = it.incluso !== false;
            return (
              <div
                key={it.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: 10,
                  border: `1px solid ${incluso ? '#d1fae5' : '#fee2e2'}`,
                  background: incluso ? '#f0fdf4' : '#fef2f2',
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    paddingTop: 2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => alternar(idx)}
                    style={{
                      background: incluso ? '#10b981' : '#dc2626',
                      color: 'white',
                      border: 'none',
                      padding: '5px 12px',
                      borderRadius: 14,
                      fontSize: 11,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      letterSpacing: '.3px',
                    }}
                  >
                    {incluso ? 'ESCOPO' : 'FORA DE ESCOPO'}
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button
                      type="button"
                      title="Subir"
                      onClick={() => mover(idx, -1)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: 10,
                        color: '#94a3b8',
                        padding: 0,
                      }}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      title="Descer"
                      onClick={() => mover(idx, 1)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: 10,
                        color: '#94a3b8',
                        padding: 0,
                      }}
                    >
                      ▼
                    </button>
                  </div>
                </div>
                <Textarea
                  rows={2}
                  value={it.texto}
                  onChange={(e) => editarTexto(idx, e.target.value)}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    resize: 'vertical',
                    fontSize: 14,
                    padding: 4,
                  }}
                />
                <button
                  type="button"
                  title="Remover"
                  onClick={() => remover(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    padding: '4px 8px',
                    fontSize: 18,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
