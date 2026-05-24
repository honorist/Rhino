import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import { formatBRL } from '../../lib/format';
import type { Pipeline } from './dashboardCalc';

interface PipelineCardProps {
  pipeline: Pipeline;
}

interface Stage {
  label: string;
  data: { count: number; valor: number };
  active: boolean;
  tip: string;
}

/**
 * Pipeline de medições — 4 estágios. Porte do bloco "Pipeline de medições"
 * em js/views/Dashboard.js (linhas 410-435).
 */
export default function PipelineCard({ pipeline }: PipelineCardProps) {
  const hoje = new Date();
  const stages: Stage[] = [
    {
      label: 'Rascunho',
      data: pipeline.rascunho,
      active: false,
      tip: 'Saídas (BMs) cadastradas mas ainda sem NF vinculada.',
    },
    {
      label: 'Aguard. emissão',
      data: pipeline.aguardEmissao,
      active: true,
      tip: 'Saídas com NF cadastrada mas ainda não emitida.',
    },
    {
      label: 'NF emitida',
      data: pipeline.nfEmitida,
      active: false,
      tip: 'NF emitida, aguardando recebimento.',
    },
    {
      label: 'Recebida',
      data: pipeline.recebida,
      active: false,
      tip: 'Pagamento recebido — ciclo completo.',
    },
  ];

  return (
    <Card style={{ padding: 'var(--sp-md)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Pipeline de medições</h3>
          <span className="text-muted" style={{ fontSize: 11 }}>
            — {hoje.toLocaleDateString('pt-BR', { month: 'long' })}
          </span>
        </div>
        <Link
          to="/contratos"
          style={{
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-primary)',
          }}
        >
          Ver saídas →
        </Link>
      </div>
      <div
        role="list"
        aria-label="Estágios do pipeline"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
        }}
      >
        {stages.map((s) => (
          <div
            key={s.label}
            role="listitem"
            title={s.tip}
            style={{
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: s.active ? 'rgba(217, 119, 6, .08)' : undefined,
              borderLeft: `3px solid ${s.active ? '#D97706' : '#d1d5db'}`,
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                fontWeight: 700,
                color: s.active ? '#9a3412' : '#64748B',
                lineHeight: 1.2,
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginTop: 4,
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                {s.data.count}
              </span>
              <span
                className="text-muted"
                style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
              >
                {formatBRL(s.data.valor).replace('R$ ', '')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
