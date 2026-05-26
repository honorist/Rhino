import type { ReactNode } from 'react';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/Button';
import DataTable, { type Column } from '../../components/ui/DataTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  actionVerb,
  entityLabel,
  fieldLabel,
  formatDateTime,
  statusLabel,
  tempoRelativo,
} from './labels';
import {
  CREATE_HIDDEN,
  computeDiff,
  formatValue,
  visibleEntries,
} from './diff';
import type { AuditRow } from './types';

type DiffEntry = { key: string; before: unknown; after: unknown };

const DIFF_COLUMNS: Column<DiffEntry>[] = [
  {
    id: 'campo',
    header: 'Campo',
    cell: (d) => <strong>{fieldLabel(d.key)}</strong>,
  },
  {
    id: 'antes',
    header: 'Antes',
    cell: (d) => (
      <span style={{ color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>
        {formatValue(d.before)}
      </span>
    ),
  },
  {
    id: 'depois',
    header: 'Depois',
    cell: (d) => (
      <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
        {formatValue(d.after)}
      </span>
    ),
  },
];

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <div style={{ color: 'var(--color-text-muted)' }}>{rotulo}</div>
      <div>{children}</div>
    </>
  );
}

function CamposGrid({
  entries,
  borderColor,
}: {
  entries: [string, unknown][];
  borderColor: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: 8,
        fontSize: 13,
        padding: 'var(--sp-md)',
        background: 'var(--color-surface-2)',
        borderRadius: 6,
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      {entries.map(([k, v]) => (
        <Linha key={k} rotulo={fieldLabel(k)}>
          <span style={{ fontWeight: 500 }}>{formatValue(v)}</span>
        </Linha>
      ))}
    </div>
  );
}

function SecaoMudancas({ ev }: { ev: AuditRow }) {
  if (ev.action === 'update' && ev.beforeState && ev.body) {
    const diffs = computeDiff(ev.beforeState, ev.body);
    if (diffs.length === 0) {
      return (
        <div
          style={{
            padding: 'var(--sp-md)',
            background: 'var(--color-surface-2)',
            borderRadius: 6,
            color: 'var(--color-text-muted)',
            fontSize: 13,
          }}
        >
          Nenhum campo mudou (provavelmente um save sem alterações).
        </div>
      );
    }
    return (
      <div style={{ marginBottom: 'var(--sp-md)' }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 var(--sp-sm)' }}>
          📝 O que mudou ({diffs.length}{' '}
          {diffs.length === 1 ? 'campo' : 'campos'})
        </h4>
        <DataTable
          rows={diffs as DiffEntry[]}
          columns={DIFF_COLUMNS}
          rowKey={(d) => d.key}
          emptyMessage="Nenhuma diferença."
        />
      </div>
    );
  }

  if (ev.action === 'delete' && ev.beforeState) {
    const entries = visibleEntries(ev.beforeState);
    if (entries.length === 0) return null;
    return (
      <div style={{ marginBottom: 'var(--sp-md)' }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 var(--sp-sm)' }}>
          🗑️ Dados que foram excluídos
        </h4>
        <CamposGrid entries={entries} borderColor="var(--color-danger)" />
      </div>
    );
  }

  if (ev.action === 'create' && ev.body) {
    const entries = visibleEntries(ev.body, CREATE_HIDDEN);
    if (entries.length === 0) return null;
    return (
      <div style={{ marginBottom: 'var(--sp-md)' }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 var(--sp-sm)' }}>
          ✨ Dados informados na criação
        </h4>
        <CamposGrid entries={entries} borderColor="var(--color-success)" />
      </div>
    );
  }

  return null;
}

interface AuditDetailModalProps {
  evento: AuditRow;
  onClose: () => void;
}

export default function AuditDetailModal({
  evento,
  onClose,
}: AuditDetailModalProps) {
  const verbo = actionVerb(evento.action);
  const entLabel = entityLabel(evento.entity);
  const status = statusLabel(evento.status);
  const userName =
    (evento.userEmail ?? '').split('@')[0] || evento.userId || 'Desconhecido';
  const nomeAlvo = evento.entityLabel ?? '';
  const frase = nomeAlvo
    ? `${userName} ${verbo.verbo.toLowerCase()} ${entLabel.toLowerCase()} "${nomeAlvo}"`
    : `${userName} ${verbo.verbo.toLowerCase()} ${entLabel.toLowerCase()}`;
  const temBody = Boolean(evento.body && Object.keys(evento.body).length > 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{frase}</DialogTitle>
          <DialogDescription>
            {formatDateTime(evento.ts)} ({tempoRelativo(evento.ts)})
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div
            style={{
              padding: 'var(--sp-md)',
              background: 'var(--color-surface-2)',
              borderRadius: 8,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                gap: 10,
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              <Linha rotulo="Quem fez">
                <strong>{evento.userEmail ?? '—'}</strong>
              </Linha>
              <Linha rotulo="O que fez">
                <Badge style={{ background: verbo.bg, color: verbo.cor, fontWeight: 700 }}>
                  {verbo.verbo}
                </Badge>
                <strong style={{ marginLeft: 6 }}>{entLabel}</strong>
              </Linha>
              {evento.entityId && (
                <Linha rotulo="Identificador">
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {evento.entityId}
                  </span>
                </Linha>
              )}
              <Linha rotulo="Resultado">
                <span style={{ color: status.cor, fontWeight: 600 }}>
                  {status.texto}
                </span>
              </Linha>
              <Linha rotulo="De qual rede">
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {evento.ip ?? '—'}
                </span>
              </Linha>
            </div>
          </div>

          <SecaoMudancas ev={evento} />

          {temBody && (
            <details>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '.05em',
                }}
              >
                Detalhes técnicos (JSON)
              </summary>
              <pre
                style={{
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  padding: 'var(--sp-md)',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: 300,
                  whiteSpace: 'pre-wrap',
                  marginTop: 8,
                }}
              >
                {JSON.stringify(evento.body, null, 2)}
              </pre>
            </details>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
