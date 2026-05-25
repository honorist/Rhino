import { useMutation, useQueryClient } from '@tanstack/react-query';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { toast } from 'sonner';
import { api } from '../../../lib/api';

/**
 * Seção "Privacidade (LGPD)" — porte de renderLgpd() em js/views/Configuracao.js.
 *
 * Direitos do titular:
 * - Exportar dados pessoais (GET /api/lgpd/export — download direto)
 * - Solicitar exclusão da conta (POST /api/lgpd/delete-account — anonimiza
 *   dados pessoais e encerra a sessão; dados financeiros/contratos ficam).
 */
export default function LgpdSection() {
  const qc = useQueryClient();

  const deleteAccount = useMutation({
    mutationFn: () => api.post<{ ok: boolean }>('/api/lgpd/delete-account'),
    onSuccess: () => {
      toast('Conta marcada para exclusão. Você será desconectado.');
      qc.clear();
      setTimeout(() => location.reload(), 1500);
    },
    onError: (e) =>
      toast.error(`Falha ao solicitar exclusão: ${(e as Error).message}`),
  });

  async function handleDelete() {
    const ok = window.confirm(
      'Anonimizar permanentemente seus dados pessoais e encerrar sua sessão?\n\nEsta ação é IRREVERSÍVEL.\n\nDados financeiros e contratos serão preservados para fins legais, mas seu nome, email e identificação serão removidos.',
    );
    if (!ok) return;
    deleteAccount.mutate();
  }

  return (
    <>
      <div className="page-header" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>🔒 Privacidade (LGPD)</h2>
          <p className="page-subtitle">Seus direitos sobre os dados pessoais</p>
        </div>
      </div>

      <Card style={{ padding: 'var(--sp-lg)', marginBottom: 'var(--sp-md)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Exportar meus dados
        </h3>
        <p
          style={{
            color: 'var(--color-text-muted)',
            fontSize: 15,
            marginBottom: 12,
          }}
        >
          Baixe um arquivo JSON com todos os seus dados pessoais armazenados no
          sistema.
        </p>
        <Button variant="secondary" asChild>
          <a href="/api/lgpd/export" download>⬇️ Exportar dados (JSON)</a>
        </Button>
      </Card>

      <Card style={{ padding: 'var(--sp-lg)', border: '1px solid #FECACA' }}>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 8,
            color: '#991B1B',
          }}
        >
          Excluir minha conta
        </h3>
        <p
          style={{
            color: 'var(--color-text-muted)',
            fontSize: 15,
            marginBottom: 12,
          }}
        >
          Anonimiza seus dados pessoais e encerra sua sessão.{' '}
          <strong>Esta ação é irreversível.</strong> Dados financeiros e
          contratos associados são preservados para fins legais.
        </p>
        <Button
          variant="danger"
          onClick={handleDelete}
          disabled={deleteAccount.isPending}
        >
          🗑️ {deleteAccount.isPending ? 'Processando…' : 'Solicitar exclusão de dados'}
        </Button>
      </Card>
    </>
  );
}
