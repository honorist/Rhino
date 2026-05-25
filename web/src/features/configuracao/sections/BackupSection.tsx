import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Spinner from '../../../components/ui/Spinner';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import DataTable, { type Column } from '../../../components/ui/DataTable';

interface BackupInfo {
  filename: string;
  size: number;
  created: string;
  url?: string;
}
interface BackupsResponse {
  backups?: BackupInfo[];
}

function humanSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Seção "Backup do Sistema" — listar, baixar e gerar novo backup.
 * Porte de renderBackup() em js/views/Configuracao.js.
 */
export default function BackupSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get<BackupsResponse>('/api/backup/list'),
  });

  const backups = (data?.backups ?? []).slice().sort((a, b) =>
    String(b.created).localeCompare(String(a.created)),
  );

  const criar = useMutation({
    mutationFn: () => api.post<{ ok: boolean; filename?: string }>('/api/backup/create'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      toast.success(`Backup criado${r.filename ? `: ${r.filename}` : ''}`);
    },
    onError: (e) => toast.error(`Falha: ${e.message}`),
  });

  return (
    <>
      <div className="page-header" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            💾 Backup do Sistema
          </h2>
          <p className="page-subtitle">
            Exportação completa dos dados em JSON. Útil para arquivamento e
            migração.
          </p>
        </div>
        <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
          {criar.isPending ? 'Gerando…' : '+ Criar Backup Agora'}
        </Button>
      </div>

      {isLoading ? (
        <Card style={{ padding: 'var(--sp-lg)' }}>
          <Spinner label="Carregando backups…" />
        </Card>
      ) : (
        <DataTable
          rows={backups}
          columns={BACKUP_COLUMNS}
          rowKey={(b) => b.filename}
          emptyMessage="Nenhum backup gerado ainda."
        />
      )}
    </>
  );
}

const BACKUP_COLUMNS: Column<BackupInfo>[] = [
  {
    id: 'arquivo',
    header: 'Arquivo',
    sortable: true,
    sortAccessor: (b) => b.filename,
    cell: (b) => <strong>{b.filename}</strong>,
  },
  {
    id: 'tamanho',
    header: 'Tamanho',
    sortable: true,
    sortAccessor: (b) => b.size,
    cell: (b) => humanSize(b.size),
  },
  {
    id: 'criado',
    header: 'Criado em',
    sortable: true,
    sortAccessor: (b) => b.created,
    cell: (b) => new Date(b.created).toLocaleString('pt-BR'),
  },
  {
    id: 'acoes',
    header: '',
    hideable: false,
    cell: (b) => (
      <a
        href={b.url ?? `/api/backup/download/${encodeURIComponent(b.filename)}`}
        className="action-link"
        download
      >
        ⬇️ Baixar
      </a>
    ),
  },
];
