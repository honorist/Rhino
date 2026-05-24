import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import Relatorio from './Relatorio';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/contracts')) {
        return jsonResponse({
          contracts: [
            { id: 'c1', name: 'X', client: 'Y', status: 'ativo', value: 100 },
          ],
          saidas: [],
        });
      }
      if (url.includes('/api/caixa')) return jsonResponse({ entries: [] });
      if (url.includes('/api/notas-fiscais'))
        return jsonResponse({ notas_fiscais: [] });
      if (url.includes('/api/contas-pagar'))
        return jsonResponse({ contas: [] });
      return Promise.resolve(new Response('not found', { status: 404 }));
    }),
  );
}

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return render(<Relatorio />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Relatorio (view migrada)', () => {
  it('carrega indicadores e oferece o botão de gerar PDF', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByText('📑 Relatório Gerencial'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '📄 Gerar PDF' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Saldo em caixa')).toBeInTheDocument();
  });
});
