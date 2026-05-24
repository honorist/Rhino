import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import type { RdoStats, ObraSemRdo, ObraAtrasada } from '../rdos/types';

interface RdosCardProps {
  stats: RdoStats;
}

/**
 * Card "RDOs" lateral — aderência mensal + lista de obras sem RDO ontem.
 * Porte do bloco RDOs em js/views/Dashboard.js (linhas 440-503).
 */
export default function RdosCard({ stats }: RdosCardProps) {
  const ativas = stats.obrasAtivas || 0;
  const semList = stats.obrasSemRdoOntem || [];
  const atrasadas = stats.obrasAtrasadas || [];
  const sem = semList.length;
  const lancados = Math.max(0, ativas - sem);
  const aderMes = stats.aderenciaMes != null ? stats.aderenciaMes : stats.aderencia7d;
  const aderColor =
    aderMes >= 80 ? '#16A34A' : aderMes >= 50 ? '#D97706' : '#DC2626';

  return (
    <Card style={{ padding: 'var(--sp-md)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'var(--sp-md)',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>RDOs</h3>
          <div className="text-muted" style={{ fontSize: 13 }}>
            Aderência mensal
          </div>
        </div>
        {atrasadas.length > 0 ? (
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 12,
              background: 'rgba(217,119,6,.12)',
              color: '#9a3412',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            ● {atrasadas.length} atrasado{atrasadas.length !== 1 ? 's' : ''}
          </span>
        ) : (
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 12,
              background: 'rgba(22,163,74,.12)',
              color: '#166534',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            ● em dia
          </span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: 14,
          alignItems: 'center',
          padding: '8px 0',
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 800,
            color: aderColor,
            lineHeight: 1,
            gridRow: 'span 3',
            alignSelf: 'center',
          }}
        >
          {aderMes}%
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#64748B',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              marginTop: 6,
            }}
          >
            aderência mês
          </div>
        </div>
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: 8,
            fontSize: 14,
            color: 'var(--color-text)',
          }}
        >
          Lançados ontem
        </div>
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: 8,
            fontSize: 14,
            fontWeight: 700,
            textAlign: 'right',
          }}
        >
          {lancados}
          <span style={{ color: '#64748B' }}>/{ativas}</span>
        </div>
        <div style={{ fontSize: 14, color: 'var(--color-text)' }}>Sem RDO ontem</div>
        <div style={{ textAlign: 'right' }}>
          <Pill ok={sem === 0}>{sem}</Pill>
        </div>
        <div style={{ fontSize: 14, color: 'var(--color-text)' }}>Atrasados {'>'}2du</div>
        <div style={{ textAlign: 'right' }}>
          <Pill ok={atrasadas.length === 0} neg={atrasadas.length > 0}>
            {atrasadas.length}
          </Pill>
        </div>
      </div>

      {semList.length > 0 && (
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            marginTop: 'var(--sp-md)',
            paddingTop: 'var(--sp-md)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '.04em',
              fontWeight: 600,
              color: '#64748B',
              marginBottom: 8,
            }}
          >
            Obras sem RDO ontem
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {semList.slice(0, 6).map((o: ObraSemRdo) => {
              const a = atrasadas.find(
                (x: ObraAtrasada) => x.contractId === o.contractId,
              );
              const dias = a ? (a.nuncaFezRdo ? null : a.diasUteisSemRdo) : null;
              const sub =
                dias != null
                  ? `sem lançamento há ${dias} dia${dias !== 1 ? 's' : ''} úteis`
                  : 'sem lançamento ontem';
              const ctCode = (o as { contractNumber?: string }).contractNumber ?? '';
              return (
                <div
                  key={o.contractId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        background: '#DC2626',
                        marginTop: 6,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {o.client || o.name}
                        {ctCode && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontFamily: 'monospace',
                              fontSize: 11,
                              color: '#64748B',
                            }}
                          >
                            {ctCode}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{sub}</div>
                    </div>
                  </div>
                  <Link
                    to={`/contratos/${o.contractId}`}
                    className="btn btn-secondary btn-sm"
                    style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}
                  >
                    Cobrar
                  </Link>
                </div>
              );
            })}
            {semList.length > 6 && (
              <div
                style={{
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#64748B',
                  paddingTop: 4,
                }}
              >
                + {semList.length - 6} —{' '}
                <Link to="/rdos" style={{ color: 'var(--color-primary)' }}>
                  ver todas
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Pill({
  children,
  ok,
  neg,
}: {
  children: React.ReactNode;
  ok?: boolean;
  neg?: boolean;
}) {
  const bg = ok
    ? 'rgba(22,163,74,.12)'
    : neg
      ? 'rgba(220,38,38,.12)'
      : 'rgba(217,119,6,.12)';
  const color = ok ? '#166534' : neg ? '#991b1b' : '#9a3412';
  return (
    <span
      style={{
        padding: '2px 10px',
        borderRadius: 12,
        background: bg,
        color,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}
