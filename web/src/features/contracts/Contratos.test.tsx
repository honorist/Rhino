import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Contratos from './Contratos';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const CONTRACTS = [
  {
    id: 'c1',
    name: 'Obra Alfa',
    client: 'Cliente X',
    status: 'ativo',
    value: 100_000,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  },
  {
    id: 'c2',
    name: 'Obra Beta',
    client: 'Cliente Y',
    status: 'concluido',
    value: 50_000,
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/contracts')) {
        return jsonResponse({ contracts: CONTRACTS, saidas: [] });
      }
      if (url.includes('/api/recursos')) {
        return jsonResponse({ recursos: [] });
      }
      if (url.includes('/api/rdos')) {
        return jsonResponse({
          rdos: [],
          stats: { obrasSemRdoOntem: [], ehFimDeSemana: false },
        });
      }
      if (url.includes('/api/clientes')) {
        return jsonResponse({ clientes: [] });
      }
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
        <QueryClientProvider client={client}>
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<Contratos />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Contratos (view migrada)', () => {
  it('lista o título e os contratos', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('Obra Alfa')).toBeInTheDocument();
    expect(screen.getByText('Obra Beta')).toBeInTheDocument();
    expect(screen.getByText('Gerenciar contratos de serviços')).toBeInTheDocument();
  });

  it('filtra pelo chip de status', async () => {
    stubApi();
    renderView();
    await screen.findByText('Obra Alfa');
    fireEvent.click(screen.getByRole('button', { name: 'Concluído' }));
    expect(screen.queryByText('Obra Alfa')).not.toBeInTheDocument();
    expect(screen.getByText('Obra Beta')).toBeInTheDocument();
  });

  it('abre o modal de novo contrato', async () => {
    stubApi();
    renderView();
    await screen.findByText('Obra Alfa');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo Contrato' }));
    expect(await screen.findByText('Dados do Cliente')).toBeInTheDocument();
  });
});
