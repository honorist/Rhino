import { useState, type KeyboardEvent } from 'react';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/button';
import DataTable, { type Column } from '../../components/ui/data-table';
import EmptyState from '../../components/ui/empty-state';
import Spinner from '../../components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/native-select';
import { DatePicker } from '../../components/ui/date-picker';
import { computeDiff } from './diff';
import {
  ACAO_OPCOES,
  ENTIDADE_OPCOES,
  actionVerb,
  entityLabel,
  fieldLabel,
  formatDateTime,
  statusLabel,
  tempoRelativo,
} from './labels';
import { formatValue } from './diff';
import { useAudit } from './queries';
import { EMPTY_FILTERS, type AuditFilters, type AuditRow } from './types';
import AuditDetailModal from './AuditDetailModal';

const PAGE_SIZE = 50;
const VIEW_STORAGE_KEY = 'rh-audit-view';

type ViewMode = 'table' | 'timeline';

function loadViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'timeline'
      ? 'timeline'
      : 'table';
  } catch {
    return 'table';
  }
}

/** Resumo das mudanças de um evento de update (até 2 campos + contagem). */
function DiffPreview({ evento }: { evento: AuditRow }) {
  if (evento.action !== 'update' || !evento.beforeState || !evento.body) {
    return null;
  }
  const diffs = computeDiff(evento.beforeState, evento.body);
  if (diffs.length === 0) return null;
  const extra = diffs.length > 2 ? diffs.length - 2 : 0;
  return (
    <div style={{ marginTop: 4 }}>
      {diffs.slice(0, 2).map((d, i) => (
        <span
          key={d.key}
          style={{ fontSize: 12, color: 'var(--color-text-muted)' }}
        >
          {i > 0 ? ' · ' : ''}
          {fieldLabel(d.key)}: <strong>{formatValue(d.before)}</strong> →{' '}
          <strong style={{ color: 'var(--color-primary)' }}>
            {formatValue(d.after)}
          </strong>
        </span>
      ))}
      {extra > 0 && (
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {' '}
          +{extra} mudanças
        </span>
      )}
    </div>
  );
}

/** Célula "Fez o quê" — verbo + entidade + nome amigável + diff. */
function FezOQue({ evento }: { evento: AuditRow }) {
  const verbo = actionVerb(evento.action);
  const entLabel = entityLabel(evento.entity);
  return (
    <>
      <Badge style={{ background: verbo.bg, color: verbo.cor, fontWeight: 600, marginRight: 6 }}>
        {verbo.verbo}
      </Badge>
      <strong>{entLabel.toLowerCase()}</strong>
      {evento.entityLabel ? (
        <strong> {evento.entityLabel}</strong>
      ) : evento.entityId ? (
        <span
          style={{
            fontSize: 12,
            color: 'var(--color-text-muted)',
            fontStyle: 'italic',
          }}
        >
          {' '}
          (removido)
        </span>
      ) : null}
      <DiffPreview evento={evento} />
    </>
  );
}

/** Evento na visualização "linha do tempo". */
function EventoTimeline({
  evento,
  onClick,
}: {
  evento: AuditRow;
  onClick: () => void;
}) {
  const verbo = actionVerb(evento.action);
  const entLabel = entityLabel(evento.entity);
  const cls =
    evento.action === 'create'
      ? 'audit-event--insert'
      : evento.action === 'update'
        ? 'audit-event--update'
        : evento.action === 'delete'
          ? 'audit-event--delete'
          : '';
  return (
    <div
      className={`audit-event ${cls}`}
      style={{ cursor: 'pointer' }}
      onClick={onClick}
    >
      <div className="audit-event__dot" aria-hidden="true" />
      <div className="audit-event__head">
        <span className="audit-event__user">
          {(evento.userEmail ?? '').split('@')[0] || '—'}
        </span>
        <span className="audit-event__action">
          {verbo.verbo} {entLabel.toLowerCase()}
          {evento.entityLabel ? <strong> {evento.entityLabel}</strong> : null}
        </span>
        <span className="audit-event__time">
          {tempoRelativo(evento.ts)} · {formatDateTime(evento.ts)}
        </span>
      </div>
    </div>
  );
}

/** Histórico de Atividades — log de auditoria do sistema. */
export default function Auditoria() {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [userDraft, setUserDraft] = useState('');
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const auditQuery = useAudit(filters, page, PAGE_SIZE);
  const rows = auditQuery.data?.rows ?? [];
  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function setFilter(patch: Partial<AuditFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  }
  function commitUser() {
    const value = userDraft.trim();
    if (value !== filters.user) setFilter({ user: value });
  }
  function handleUserKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commitUser();
  }
  function limpar() {
    setFilters(EMPTY_FILTERS);
    setUserDraft('');
    setPage(0);
  }
  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      /* localStorage indisponível — modo só não persiste */
    }
  }

  const columns: Column<AuditRow>[] = [
    {
      header: 'Quando',
      width: '160px',
      cell: (r) => (
        <>
          <div style={{ fontWeight: 500 }}>{formatDateTime(r.ts)}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {tempoRelativo(r.ts)}
          </div>
        </>
      ),
    },
    {
      header: 'Quem',
      cell: (r) => (
        <>
          <strong>{(r.userEmail ?? '').split('@')[0] || '—'}</strong>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {r.userEmail ?? r.userId ?? '—'}
          </div>
        </>
      ),
    },
    { header: 'Fez o quê', cell: (r) => <FezOQue evento={r} /> },
    {
      header: 'Resultado',
      width: '120px',
      align: 'center',
      cell: (r) => {
        const s = statusLabel(r.status);
        return (
          <span style={{ color: s.cor, fontWeight: 600, fontSize: 13 }}>
            {s.texto}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Histórico de Atividades</h1>
          <p className="page-subtitle">
            Tudo que aconteceu no sistema — quem fez, o quê e quando
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            fontSize: 14,
            color: 'var(--color-text-muted)',
          }}
        >
          <div
            role="group"
            aria-label="Modo de visualização"
            style={{
              display: 'inline-flex',
              border: '1px solid var(--color-border)',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <Button
              size="sm"
              variant={viewMode === 'table' ? 'primary' : 'secondary'}
              onClick={() => changeViewMode('table')}
              style={{ borderRadius: 0 }}
            >
              Tabela
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'timeline' ? 'primary' : 'secondary'}
              onClick={() => changeViewMode('timeline')}
              style={{ borderRadius: 0 }}
            >
              Linha do tempo
            </Button>
          </div>
          <span>{`${total} ${total === 1 ? 'atividade' : 'atividades'}`}</span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-md)',
          alignItems: 'end',
        }}
      >
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Pesquisar por usuário</label>
          <Input
            placeholder="digite um email"
            value={userDraft}
            onChange={(e) => setUserDraft(e.target.value)}
            onBlur={commitUser}
            onKeyDown={handleUserKey}
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Em qual tela</label>
          <Select
            value={filters.entity}
            onChange={(e) => setFilter({ entity: e.target.value })}
          >
            <option value="">Todas as telas</option>
            {ENTIDADE_OPCOES.map((e) => (
              <option key={e} value={e}>
                {entityLabel(e)}
              </option>
            ))}
          </Select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Tipo de ação</label>
          <Select
            value={filters.action}
            onChange={(e) => setFilter({ action: e.target.value })}
          >
            <option value="">Qualquer ação</option>
            {ACAO_OPCOES.map((a) => (
              <option key={a} value={a}>
                {actionVerb(a).verbo}
              </option>
            ))}
          </Select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">A partir de</label>
          <DatePicker
            value={filters.from}
            onChange={(val) => setFilter({ from: val })}
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Até</label>
          <DatePicker
            value={filters.to}
            onChange={(val) => setFilter({ to: val })}
          />
        </div>
        <Button variant="secondary" onClick={limpar}>
          Limpar
        </Button>
      </div>

      {auditQuery.isLoading ? (
        <Spinner label="Carregando atividades..." />
      ) : auditQuery.isError ? (
        <div className="error-banner">Erro ao carregar o histórico.</div>
      ) : viewMode === 'timeline' ? (
        rows.length === 0 ? (
          <EmptyState message="Sem atividades. Ajuste os filtros para ver eventos." />
        ) : (
          <div className="audit-timeline">
            {rows.map((r) => (
              <EventoTimeline
                key={r.id}
                evento={r}
                onClick={() => setSelected(r)}
              />
            ))}
          </div>
        )
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.id)}
          onRowClick={(r) => setSelected(r)}
          emptyMessage="Nenhuma atividade no filtro selecionado"
        />
      )}

      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 'var(--sp-sm)',
            marginTop: 'var(--sp-md)',
          }}
        >
          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Anterior
          </Button>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              color: 'var(--color-text-muted)',
            }}
          >
            Página {page + 1} de {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Próxima →
          </Button>
        </div>
      )}

      {selected && (
        <AuditDetailModal
          evento={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
