import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Comparativo from './Comparativo';

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
            {
              id: 'c1',
              name: 'Obra Alfa',
              client: 'Cliente X',
              status: 'ativo',
              value: 100_000,
            },
          ],
          saidas: [],
        });
      }
      if (url.includes('/api/notas-fiscais'))
        return jsonResponse({ notas_fiscais: [] });
      if (url.includes('/api/caixa')) return jsonResponse({ entries: [] });
      if (url.includes('/api/base')) return jsonResponse({ items: [] });
      if (url.includes('/api/recursos'))
        return jsonResponse({ recursos: [] });
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
  return render(<Comparativo />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Comparativo (view migrada)', () => {
  it('lista os contratos ativos no comparativo', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByText('📊 Comparativo de Contratos'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Obra Alfa')).toBeInTheDocument();
  });
});
