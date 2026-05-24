import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './Dashboard';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

/**
 * Stub das APIs consumidas pelo Dashboard. Cada rota responde com um envelope
 * vazio compatível para que o componente renderize sem erro.
 */
function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return jsonResponse({
          user: {
            id: 'u1',
            email: 'honorio@x.com',
            name: 'Honorio',
            acceptedTermsAt: '2025-01-01',
          },
        });
      }
      if (url.includes('/api/dashboard')) {
        return jsonResponse({
          caixaBalance: 1000,
          saldoProjetado: [],
        });
      }
      if (url.includes('/api/contracts')) return jsonResponse({ contracts: [], saidas: [] });
      if (url.includes('/api/caixa')) return jsonResponse({ entries: [] });
      if (url.includes('/api/notas-fiscais')) return jsonResponse({ notas_fiscais: [] });
      if (url.includes('/api/contas-pagar')) return jsonResponse({ contas: [] });
      if (url.includes('/api/socios')) return jsonResponse({ socios: [] });
      if (url.includes('/api/investimentos')) return jsonResponse({ investimentos: [] });
      if (url.includes('/api/recursos')) return jsonResponse({ recursos: [] });
      if (url.includes('/api/propostas')) return jsonResponse({ propostas: [] });
      if (url.includes('/api/rdos')) return jsonResponse({ rdos: [], stats: null });
      return Promise.resolve(new Response('{}', { status: 200 }));
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
  it('carrega saudação personalizada e os 9 KPIs + atalhos', async () => {
    stubApi();
    renderView();
    // Saudação dinâmica usa o primeiro nome do user mocado.
    expect(
      await screen.findByRole('heading', { name: /Honorio/i }),
    ).toBeInTheDocument();
    // KPIs principais (textos esperados):
    expect(screen.getByText('Saldo em caixa')).toBeInTheDocument();
    expect(screen.getByText('A receber (NFs)')).toBeInTheDocument();
    expect(screen.getByText('A pagar (30d)')).toBeInTheDocument();
    expect(screen.getByText('Faturado (mês)')).toBeInTheDocument();
    expect(screen.getByText('Margem média')).toBeInTheDocument();
    expect(screen.getByText('Prospecção')).toBeInTheDocument();
    expect(screen.getByText('Aportes acumulados')).toBeInTheDocument();
    expect(screen.getByText('Colaboradores')).toBeInTheDocument();
    expect(screen.getByText('Atalhos')).toBeInTheDocument();
  });
});
