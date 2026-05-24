import { useQuery } from '@tanstack/react-query';
import Card from '../../../components/ui/Card';
import Spinner from '../../../components/ui/Spinner';
import { api } from '../../../lib/api';

/** Arquivos vêm de /api/admin/arquivos — colunas reais do recurso_doc_arquivos. */
interface ArquivoInfo {
  id: string;
  recursoId?: string;
  recursoNome?: string;
  docId?: string;
  filename?: string;
  filenameOriginal?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
  tipoDoc?: string;
}
interface ArquivosResponse {
  arquivos: ArquivoInfo[];
  total?: number;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Seção "Arquivos do Sistema" — read-only.
 * Porte de renderArquivos() em js/views/Configuracao.js.
 */
export default function ArquivosSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['arquivos-sistema'],
    queryFn: () => api.get<ArquivosResponse>('/api/admin/arquivos'),
  });

  const arquivos = data?.arquivos ?? [];
  const totalSize = data?.total ?? arquivos.reduce((s, a) => s + (a.sizeBytes || 0), 0);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            📁 Arquivos do Sistema
          </h2>
          <p className="page-subtitle">
            Anexos PDF/imagens armazenados (anexos de propostas, logos, fotos)
          </p>
        </div>
      </div>

      <Card style={{ padding: 'var(--sp-lg)' }}>
        {isLoading && <Spinner label="Carregando arquivos…" />}
        {error != null && !isLoading && (
          <p style={{ color: 'var(--color-danger)' }}>
            Não foi possível carregar a lista de arquivos.
          </p>
        )}
        {!isLoading && arquivos.length === 0 && !error && (
          <p className="text-muted">Nenhum arquivo armazenado.</p>
        )}
        {arquivos.length > 0 && (
          <>
            <div
              style={{
                marginBottom: 'var(--sp-md)',
                padding: 'var(--sp-sm) var(--sp-md)',
                background: 'rgba(49,130,206,.05)',
                borderLeft: '3px solid #3182CE',
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              <strong>{arquivos.length}</strong> arquivo
              {arquivos.length !== 1 ? 's' : ''} · <strong>{humanSize(totalSize)}</strong>{' '}
              em uso
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={th()}>Colaborador</th>
                    <th style={th()}>Tipo de documento</th>
                    <th style={th()}>Arquivo</th>
                    <th style={th()}>Tamanho</th>
                    <th style={th()}>Subido em</th>
                  </tr>
                </thead>
                <tbody>
                  {arquivos.map((a) => (
                    <tr
                      key={a.id}
                      style={{ borderBottom: '1px solid var(--color-border)' }}
                    >
                      <td style={td()}>{a.recursoNome ?? '—'}</td>
                      <td style={td()}>{a.tipoDoc ?? '—'}</td>
                      <td style={td()}>
                        {a.filenameOriginal ?? a.filename ?? '—'}
                        {a.mimeType && (
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            {a.mimeType}
                          </div>
                        )}
                      </td>
                      <td style={td()}>{humanSize(a.sizeBytes || 0)}</td>
                      <td style={td()}>
                        {a.createdAt
                          ? new Date(a.createdAt).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

const th = (): React.CSSProperties => ({
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  color: '#64748B',
});
const td = (): React.CSSProperties => ({
  padding: '10px 12px',
  verticalAlign: 'middle',
});
