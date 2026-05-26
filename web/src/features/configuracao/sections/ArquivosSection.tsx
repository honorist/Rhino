import { useQuery } from '@tanstack/react-query';
import Card from '../../../components/ui/card';
import Spinner from '../../../components/ui/spinner';
import { api } from '../../../lib/api';
import DataTable, { type Column } from '../../../components/ui/data-table';

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

      {isLoading ? (
        <Card style={{ padding: 'var(--sp-lg)' }}>
          <Spinner label="Carregando arquivos…" />
        </Card>
      ) : error != null ? (
        <Card style={{ padding: 'var(--sp-lg)' }}>
          <p style={{ color: 'var(--color-danger)' }}>
            Não foi possível carregar a lista de arquivos.
          </p>
        </Card>
      ) : (
        <>
          {arquivos.length > 0 && (
            <Card style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-md)' }}>
              <div
                style={{
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
            </Card>
          )}
          <DataTable
            rows={arquivos}
            columns={ARQUIVO_COLUMNS}
            rowKey={(a) => a.id}
            emptyMessage="Nenhum arquivo armazenado."
            searchPlaceholder="Buscar por colaborador, tipo ou arquivo..."
            globalFilterFn={(a, q) =>
              [a.recursoNome, a.tipoDoc, a.filenameOriginal, a.filename].some(
                (v) => String(v ?? '').toLowerCase().includes(q),
              )
            }
          />
        </>
      )}
    </>
  );
}

const ARQUIVO_COLUMNS: Column<ArquivoInfo>[] = [
  {
    id: 'colaborador',
    header: 'Colaborador',
    sortable: true,
    sortAccessor: (a) => a.recursoNome ?? '',
    cell: (a) => a.recursoNome ?? '—',
  },
  {
    id: 'tipo',
    header: 'Tipo de documento',
    cell: (a) => a.tipoDoc ?? '—',
  },
  {
    id: 'arquivo',
    header: 'Arquivo',
    cell: (a) => (
      <>
        {a.filenameOriginal ?? a.filename ?? '—'}
        {a.mimeType && (
          <div className="text-muted" style={{ fontSize: 12 }}>{a.mimeType}</div>
        )}
      </>
    ),
  },
  {
    id: 'tamanho',
    header: 'Tamanho',
    sortable: true,
    sortAccessor: (a) => a.sizeBytes ?? 0,
    cell: (a) => humanSize(a.sizeBytes || 0),
  },
  {
    id: 'subido',
    header: 'Subido em',
    sortable: true,
    sortAccessor: (a) => a.createdAt ?? '',
    cell: (a) =>
      a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '—',
  },
];
