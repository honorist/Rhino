import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { useToast } from '../../../components/ui/toast/ToastContext';
import { usePush } from '../../../hooks/usePush';

/**
 * Seção "Notificações Push" — porte de renderNotificacoesPush() em
 * js/views/Configuracao.js. Usa o hook usePush (F4-3).
 */
export default function PushSection() {
  const toast = useToast();
  const { state, subscribe, unsubscribe } = usePush();

  const statusInfo: Record<typeof state, { texto: string; cor: string }> = {
    loading: { texto: 'Carregando…', cor: '#64748B' },
    unsupported: { texto: 'Navegador não suporta', cor: '#9a3412' },
    denied: { texto: 'Permissão negada', cor: '#991b1b' },
    unsubscribed: { texto: 'Não inscrito', cor: '#64748B' },
    subscribed: { texto: 'Ativo', cor: '#166534' },
  };
  const info = statusInfo[state];

  async function handleTeste() {
    try {
      const r = await fetch('/api/push/test', { method: 'POST' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      toast.show('Notificação de teste enviada!', 'success');
    } catch (e) {
      toast.show('Falha: ' + (e as Error).message, 'danger');
    }
  }

  return (
    <>
      <div className="page-header" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            🔔 Notificações Push
          </h2>
          <p className="page-subtitle">
            Alertas proativos mesmo com o app fechado
          </p>
        </div>
      </div>

      <Card style={{ padding: 'var(--sp-lg)', marginBottom: 'var(--sp-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 14, color: '#64748B' }}>Status:</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: info.cor }}>
            ● {info.texto}
          </span>
        </div>

        {state === 'subscribed' && (
          <p
            className="text-muted"
            style={{ fontSize: 14, marginBottom: 12 }}
          >
            Você está inscrito. Receberá alertas sobre RDOs em atraso, NFs
            próximas do vencimento, contas a pagar e mais.
          </p>
        )}
        {state === 'unsubscribed' && (
          <p
            className="text-muted"
            style={{ fontSize: 14, marginBottom: 12 }}
          >
            Ative para receber lembretes diários sobre RDOs, NFs e contas a
            pagar diretamente no seu navegador — mesmo com o Rhino fechado.
          </p>
        )}
        {state === 'denied' && (
          <p style={{ fontSize: 14, marginBottom: 12, color: '#991b1b' }}>
            Você bloqueou notificações no navegador. Para reativar, vá em{' '}
            <strong>Configurações do site → Notificações → Permitir</strong>.
          </p>
        )}
        {state === 'unsupported' && (
          <p style={{ fontSize: 14, marginBottom: 12, color: '#64748B' }}>
            Este navegador não suporta Push API. Use Chrome, Firefox ou Edge
            recente.
          </p>
        )}

        <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
          {state === 'subscribed' ? (
            <>
              <Button variant="secondary" onClick={unsubscribe}>
                Desativar notificações
              </Button>
              <Button onClick={handleTeste}>Enviar teste</Button>
            </>
          ) : (
            <Button
              onClick={subscribe}
              disabled={state === 'denied' || state === 'unsupported' || state === 'loading'}
            >
              Ativar notificações
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}
