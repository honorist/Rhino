import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '../../../components/ui/card';
import Spinner from '../../../components/ui/spinner';
import { toast } from 'sonner';
import { api } from '../../../lib/api';

interface FeatureFlag {
  key: string;
  label?: string;
  description?: string;
  enabled: boolean;
}
interface FlagsResponse {
  flags?: FeatureFlag[];
}

/**
 * Seção "Feature Flags" — lista e toggles. Porte de renderFeatureFlags()
 * (estrutura simplificada — legacy faz lazy-load via featureFlagsSection).
 */
export default function FeatureFlagsSection() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => api.get<FlagsResponse>('/api/feature-flags'),
  });
  const flags = data?.flags ?? [];

  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      api.put<{ ok: boolean }>(`/api/feature-flags/${key}`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feature-flags'] });
      toast.success('Flag atualizada');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <div className="page-header" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            🚀 Feature Flags
          </h2>
          <p className="page-subtitle">
            Liga/desliga funcionalidades em fase de teste
          </p>
        </div>
      </div>

      <Card style={{ padding: 'var(--sp-lg)' }}>
        {isLoading && <Spinner label="Carregando flags…" />}
        {error != null && !isLoading && (
          <p style={{ color: 'var(--color-danger)' }}>
            Endpoint /api/feature-flags indisponível. Crie ou ative no
            backend para gerenciar daqui.
          </p>
        )}
        {!isLoading && !error && flags.length === 0 && (
          <p className="text-muted">Nenhuma flag configurada.</p>
        )}
        {flags.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {flags.map((f) => (
              <div
                key={f.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--sp-md)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>
                    {f.label ?? f.key}{' '}
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      ({f.key})
                    </span>
                  </div>
                  {f.description && (
                    <div
                      className="text-muted"
                      style={{ fontSize: 13, marginTop: 4 }}
                    >
                      {f.description}
                    </div>
                  )}
                </div>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) => toggle.mutate({ key: f.key, enabled: e.target.checked })}
                    disabled={toggle.isPending}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {f.enabled ? 'Ativa' : 'Inativa'}
                  </span>
                </label>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
