import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { Input, Select, Textarea } from '../../../components/ui/controls';
import { useClausulas } from '../../resources';
import type { Clausula } from '../../../types/domain';
import { localUid, type EditorTabProps, type ObrigacaoItem } from '../types';

interface LadoProps {
  titulo: string;
  itens: ObrigacaoItem[];
  biblioteca: Clausula[];
  onCommit: (itens: ObrigacaoItem[]) => void;
}

/** Um lado das obrigações (Contratada ou Contratante). */
function LadoObrigacoes({ titulo, itens, biblioteca, onCommit }: LadoProps) {
  const [selecao, setSelecao] = useState('');

  function inserirClausula() {
    const c = biblioteca.find((x) => x.id === selecao);
    if (!c) return;
    onCommit([
      ...itens,
      { id: localUid('obg'), clausulaId: c.id, titulo: c.titulo, texto: c.texto },
    ]);
    setSelecao('');
  }
  function inserirLivre() {
    onCommit([
      ...itens,
      { id: localUid('obg'), clausulaId: null, titulo: '', texto: '' },
    ]);
  }
  function editar(idx: number, patch: Partial<ObrigacaoItem>) {
    onCommit(itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function remover(idx: number) {
    onCommit(itens.filter((_, i) => i !== idx));
  }
  function mover(idx: number, delta: number) {
    const alvo = idx + delta;
    if (alvo < 0 || alvo >= itens.length) return;
    const novos = [...itens];
    [novos[idx], novos[alvo]] = [novos[alvo], novos[idx]];
    onCommit(novos);
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
      <h4 style={{ margin: '0 0 12px', color: '#1F497D' }}>{titulo}</h4>

      <div
        style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}
      >
        <Select
          value={selecao}
          onChange={(e) => setSelecao(e.target.value)}
          style={{ flex: 1, minWidth: 240 }}
        >
          <option value="">— Inserir cláusula da biblioteca —</option>
          {biblioteca.map((c) => (
            <option key={c.id} value={c.id}>
              {c.titulo}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={inserirClausula} disabled={!selecao}>
          Adicionar
        </Button>
        <Button
          variant="secondary"
          onClick={inserirLivre}
          title="Adicionar texto livre"
        >
          + Livre
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {itens.length === 0 ? (
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
            Nenhuma cláusula selecionada.
          </div>
        ) : (
          itens.map((it, idx) => (
            <div
              key={it.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: 10,
                background: '#f8fafc',
                borderRadius: 6,
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ flex: 1 }}>
                <Input
                  value={it.titulo}
                  onChange={(e) => editar(idx, { titulo: e.target.value })}
                  placeholder="Título (opcional)"
                  style={{ marginBottom: 6, fontWeight: 600 }}
                />
                <Textarea
                  rows={3}
                  value={it.texto}
                  onChange={(e) => editar(idx, { texto: e.target.value })}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  title="Subir"
                  onClick={() => mover(idx, -1)}
                  style={iconBtn('#64748b', 12)}
                >
                  ▲
                </button>
                <button
                  type="button"
                  title="Descer"
                  onClick={() => mover(idx, 1)}
                  style={iconBtn('#64748b', 12)}
                >
                  ▼
                </button>
                <button
                  type="button"
                  title="Remover"
                  onClick={() => remover(idx)}
                  style={iconBtn('#dc2626', 18)}
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function iconBtn(color: string, fontSize: number): CSSProperties {
  return { background: 'none', border: 'none', cursor: 'pointer', color, fontSize };
}

/**
 * Aba Obrigações — picker de cláusulas da biblioteca para Contratada e
 * Contratante. O texto inserido é editável e fica só nesta proposta.
 */
export default function ObrigacoesTab({ proposta, onChange }: EditorTabProps) {
  const clausulasQuery = useClausulas();
  const ativas = (clausulasQuery.data ?? []).filter((c) => c.ativa !== false);

  return (
    <Card style={{ padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#1F497D' }}>Obrigações</h3>
          <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Selecione cláusulas da biblioteca para cada lado. Você pode editar o
            texto após inserir — a alteração fica só nesta proposta.
          </p>
        </div>
        <Link
          to="/clausulas"
          className="action-link"
          title="Gerenciar biblioteca de cláusulas"
        >
          📖 Ir para biblioteca
        </Link>
      </div>

      <LadoObrigacoes
        titulo="Obrigações da Contratada"
        itens={proposta.obrigacoesContratada}
        biblioteca={ativas.filter((c) => c.categoria === 'obrigacoes_contratada')}
        onCommit={(itens) => onChange({ obrigacoesContratada: itens })}
      />
      <div style={{ height: 24 }} />
      <LadoObrigacoes
        titulo="Obrigações da Contratante"
        itens={proposta.obrigacoesContratante}
        biblioteca={ativas.filter(
          (c) => c.categoria === 'obrigacoes_contratante',
        )}
        onCommit={(itens) => onChange({ obrigacoesContratante: itens })}
      />
    </Card>
  );
}
