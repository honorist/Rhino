import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App';
import ToastProvider from './components/ui/toast/ToastProvider';
import { queryClient, persister } from './lib/queryClient';
import './styles/index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Elemento #root não encontrado no index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        // Cache válido por 24h após a última sessão. Acima disso, o usuário
        // sempre busca fresh ao reabrir o app.
        maxAge: 24 * 60 * 60 * 1000,
        // Identifica a versão de cache. Aumentar quando o shape das respostas
        // de /api/* mudar de forma incompatível.
        buster: 'v1',
      }}
    >
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
      {/* DevTools tree-shaken em produção pelo Vite quando NODE_ENV=production. */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />}
    </PersistQueryClientProvider>
  </StrictMode>,
);
