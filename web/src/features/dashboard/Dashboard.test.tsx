import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './Dashboard';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/dashboard')) {
        return jsonResponse({
          caixaBalance: 1000,
          saldoProjetado: [
            { data: '2026-07-01', saldo: 900 },
            { data: '2026-08-01', saldo: 800 },
          ],
          contasPagarStatus: { totalPendente: 100, pendentes: 1 },
        });
      }
      if (url.includes('/api/contracts'))
        return jsonResponse({ contracts: [], saidas: [] });
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
      <MemoryRouter>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<Dashboard />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Dashboard (view migrada)', () => {
  it('carrega os KPIs e os atalhos', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByRole('heading', { name: /Dashboard/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Saldo em caixa')).toBeInTheDocument();
    expect(screen.getByText('Atalhos')).toBeInTheDocument();
  });
});
