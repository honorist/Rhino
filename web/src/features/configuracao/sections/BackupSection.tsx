import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Spinner from '../../../components/ui/Spinner';
import { toast } from 'sonner';
import { api } from '../../../lib/api';

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

      <Card style={{ padding: 'var(--sp-lg)' }}>
        {isLoading && <Spinner label="Carregando backups…" />}
        {!isLoading && backups.length === 0 && (
          <p className="text-muted">Nenhum backup gerado ainda.</p>
        )}
        {backups.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={th()}>Arquivo</th>
                <th style={th()}>Tamanho</th>
                <th style={th()}>Criado em</th>
                <th style={th()}></th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr
                  key={b.filename}
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <td style={td()}>
                    <strong>{b.filename}</strong>
                  </td>
                  <td style={td()}>{humanSize(b.size)}</td>
                  <td style={td()}>
                    {new Date(b.created).toLocaleString('pt-BR')}
                  </td>
                  <td style={td()}>
                    <a
                      href={b.url ?? `/api/backup/download/${encodeURIComponent(b.filename)}`}
                      className="action-link"
                      download
                    >
                      ⬇️ Baixar
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
