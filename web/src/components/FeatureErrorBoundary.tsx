import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import type { PropsWithChildren } from 'react';

/**
 * Fallback exibido quando uma feature crasha. Mantém o resto do app
 * (Shell, sidebar, navegação) funcional — um crash em "recrutamento" não
 * derruba "financeiro".
 *
 * Em produção, o stack trace fica escondido; em dev, mostramos para
 * facilitar diagnóstico.
 */
function FeatureErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const isDev = import.meta.env.DEV;
  return (
    <div
      role="alert"
      style={{
        padding: '2rem',
        margin: '2rem auto',
        maxWidth: 640,
        border: '1px solid #FCA5A5',
        borderRadius: 12,
        backgroundColor: '#FEF2F2',
        color: '#991B1B',
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: '1.25rem' }}>
        Algo deu errado nesta tela
      </h2>
      <p style={{ marginBottom: '1rem' }}>
        O erro foi isolado — você pode voltar para o menu e continuar usando
        outras áreas do sistema.
      </p>
      {isDev && error instanceof Error && (
        <pre
          style={{
            fontSize: '0.8rem',
            padding: '0.75rem',
            backgroundColor: '#1F2937',
            color: '#F3F4F6',
            borderRadius: 6,
            overflow: 'auto',
            maxHeight: 240,
          }}
        >
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
      )}
      <button
        type="button"
        onClick={resetErrorBoundary}
        style={{
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          borderRadius: 6,
          border: 0,
          backgroundColor: '#991B1B',
          color: 'white',
          cursor: 'pointer',
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}

/**
 * Envolve uma feature com error boundary + handler de log centralizado.
 * Reset acontece automaticamente quando a rota muda (key prop no consumer).
 */
export default function FeatureErrorBoundary({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary
      FallbackComponent={FeatureErrorFallback}
      onError={(error, info) => {
        // Telemetria — substituir por integração com Sentry/LogRocket quando
        // disponível. Por enquanto registra no console para captura por SW.
        console.error('[FeatureErrorBoundary]', error, info.componentStack);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
