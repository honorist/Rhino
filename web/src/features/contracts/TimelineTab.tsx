import { useMemo } from 'react';
import Card from '../../components/ui/Card';
import { formatDateBR, todayISO } from '../../lib/formatDate';
import { useNotasFiscais } from '../resources';
import type { ContratoTabProps } from './ContratoDetail';
import { TIMELINE_COR, buildTimeline } from './timeline';

/** Aba Timeline do contrato — eventos agregados em ordem cronológica. */
export default function TimelineTab({ contract }: ContratoTabProps) {
  const nfsQuery = useNotasFiscais();

  const eventos = useMemo(
    () => buildTimeline(contract, nfsQuery.data ?? []),
    [contract, nfsQuery.data],
  );
  const hoje = todayISO();

  if (eventos.length === 0) {
    return (
      <Card style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}>
        <p className="text-muted">Nenhum evento registrado neste contrato.</p>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 'var(--sp-xl)' }}>
      <h3 style={{ margin: '0 0 var(--sp-lg)', fontSize: 15 }}>
        Timeline do Contrato
      </h3>
      <div style={{ position: 'relative', paddingLeft: 32 }}>
        <div
          style={{
            position: 'absolute',
            left: 11,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--color-border)',
          }}
        />
        {eventos.map((ev, i) => {
          const futuro = ev.date > hoje;
          const cor = TIMELINE_COR[ev.tipo];
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                marginBottom: i === eventos.length - 1 ? 0 : 24,
                opacity: futuro ? 0.65 : 1,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: -26,
                  top: 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: cor,
                  border: '2px solid var(--color-bg)',
                  boxShadow: `0 0 0 2px ${cor}44`,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: cor,
                    textTransform: 'uppercase',
                    letterSpacing: '.5px',
                  }}
                >
                  {ev.tipo}
                </span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {formatDateBR(ev.date)}
                </span>
                {futuro && (
                  <span
                    style={{
                      fontSize: 10,
                      background: 'var(--color-surface-2)',
                      color: 'var(--color-text-muted)',
                      padding: '1px 6px',
                      borderRadius: 8,
                    }}
                  >
                    futuro
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {ev.icon} {ev.label}
              </div>
              {ev.desc && (
                <div className="text-muted" style={{ fontSize: 13 }}>
                  {ev.desc}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
