import { useQuery } from '@tanstack/react-query';
import Card from '../../../components/ui/Card';
import Spinner from '../../../components/ui/Spinner';

interface ChangelogEntry {
  version: string;
  date?: string;
  summary?: string;
  changes?: string[];
}

interface ChangelogData {
  entries?: ChangelogEntry[];
}

function fmtData(d: string | undefined): string {
  if (!d) return '';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

/**
 * Seção "Atualizações" — porte de renderAtualizacoes() em
 * js/views/Configuracao.js. Lê /changelog.json (servido pelo backend) e
 * exibe lista de versões em ordem cronológica reversa.
 */
export default function AtualizacoesSection() {
  const versaoAtual =
    (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '';
  const { data, isLoading, error } = useQuery({
    queryKey: ['changelog'],
    queryFn: () =>
      // changelog.json fica na raiz (não em /api). Fetch direto, sem auth.
      fetch('/changelog.json', { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ChangelogData>;
      }),
    staleTime: 5 * 60_000,
  });

  const entries = data?.entries ?? [];

  return (
    <>
      <div
        className="page-header"
        style={{ marginBottom: 'var(--sp-lg)', alignItems: 'baseline' }}
      >
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            🆕 Atualizações
          </h2>
          <p className="page-subtitle">O que mudou em cada versão do sistema</p>
        </div>
        <div
          style={{ fontSize: 13, color: 'var(--color-text-muted)' }}
        >
          Versão atual:{' '}
          <strong style={{ color: 'var(--color-primary)' }}>
            {versaoAtual || '—'}
          </strong>
        </div>
      </div>

      <Card style={{ padding: 'var(--sp-lg)' }}>
        {isLoading && <Spinner label="Carregando histórico…" />}
        {error != null && !isLoading && (
          <p style={{ color: 'var(--color-danger)' }}>
            Não foi possível carregar o histórico de atualizações.
          </p>
        )}
        {!isLoading && entries.length === 0 && (
          <p className="text-muted">Nenhuma atualização registrada ainda.</p>
        )}
        {entries.map((e, i) => {
          const isAtual = e.version === (versaoAtual ?? '').replace(/^v/, '');
          const last = i === entries.length - 1;
          return (
            <div
              key={`${e.version}-${i}`}
              style={{
                padding: '14px 0',
                borderBottom: last ? 'none' : '1px solid var(--color-border)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginBottom: 6,
                }}
              >
                <strong style={{ fontSize: 17, color: 'var(--color-primary)' }}>
                  v{e.version}
                </strong>
                {isAtual && (
                  <span
                    style={{
                      background: 'var(--color-success)',
                      color: '#fff',
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontWeight: 600,
                    }}
                  >
                    ATUAL
                  </span>
                )}
                {e.date && (
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                    {fmtData(e.date)}
                  </span>
                )}
              </div>
              {e.summary && (
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>
                  {e.summary}
                </div>
              )}
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  color: 'var(--color-text)',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                {(e.changes ?? []).map((c, j) => (
                  <li key={j} style={{ marginBottom: 4 }}>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </Card>
    </>
  );
}
