import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/card';
import { formatBRL } from '../../lib/format';

export interface CaixaEntry {
  id: string;
  type: 'entrada' | 'saida';
  date: string;
  description: string;
  value: number;
  formaPagamento?: string;
  category?: string;
}

type Filtro = 'ambos' | 'entrada' | 'saida';

/**
 * Card "Últimas Movimentações — Caixa" com filtro Ambos/Entradas/Saídas.
 * Porte de js/views/Dashboard.js (linhas 734-786).
 */
export default function UltimasMovimentacoes({ entries }: { entries: CaixaEntry[] }) {
  const [filtro, setFiltro] = useState<Filtro>('ambos');
  const filtradas = entries
    .filter((e) => (filtro === 'ambos' ? true : e.type === filtro))
    .slice(0, 20);

  const opts: { k: Filtro; l: string; c: string }[] = [
    { k: 'ambos', l: 'Ambos', c: '#60A5FA' },
    { k: 'entrada', l: 'Entradas', c: '#16A34A' },
    { k: 'saida', l: 'Saídas', c: '#DC2626' },
  ];

  return (
    <Card style={{ padding: 'var(--sp-lg)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--sp-md)',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>Últimas Movimentações — Caixa</h3>
        <div style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
            role="group"
          >
            {opts.map((b, i) => (
              <button
                key={b.k}
                type="button"
                onClick={() => setFiltro(b.k)}
                style={{
                  padding: '5px 12px',
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  background: filtro === b.k ? b.c : 'transparent',
                  color: filtro === b.k ? '#fff' : 'var(--color-text-muted)',
                  borderRight:
                    i < opts.length - 1 ? '1px solid var(--color-border)' : 0,
                }}
              >
                {b.l}
              </button>
            ))}
          </div>
          <Link to="/caixa" style={{ fontSize: 13, color: 'var(--color-primary)' }}>
            Ver todos →
          </Link>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <p className="text-muted" style={{ padding: 'var(--sp-md) 0' }}>
          Nenhuma movimentação no filtro selecionado
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtradas.map((e) => (
              <div
                key={e.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--sp-md) 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>{e.description}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {new Date(e.date).toLocaleDateString('pt-BR')}
                    {e.formaPagamento ? ` · ${e.formaPagamento}` : ''}
                    {e.category ? ` · ${e.category}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: e.type === 'entrada' ? '#16A34A' : '#DC2626',
                    }}
                  >
                    {e.type === 'entrada' ? '+' : '-'}
                    {formatBRL(Math.abs(e.value))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              padding: 'var(--sp-sm) 0 0',
              color: 'var(--color-text-muted)',
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            {filtradas.length} movimentaç{filtradas.length === 1 ? 'ão' : 'ões'} exibida
            {filtradas.length === 1 ? '' : 's'}
          </div>
        </>
      )}
    </Card>
  );
}
