import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Propostas from './Propostas';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const PROPOSTAS = [
  {
    id: 'p1',
    numero: '12',
    ano: 26,
    revisao: 0,
    titulo: 'Tubulação industrial',
    tipo: 'ambos',
    status: 'rascunho',
    valorTotal: 50000,
    clienteEmpresa: 'Metalúrgica Sul',
  },
  {
    id: 'p2',
    numero: '13',
    ano: 26,
    revisao: 0,
    titulo: 'Montagem estrutural',
    tipo: 'hh',
    status: 'aceita',
    valorTotal: 80000,
    clienteEmpresa: 'Construtora Norte',
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/propostas')) {
        return jsonResponse({ propostas: PROPOSTAS });
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
  return render(<Propostas />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Propostas (view migrada)', () => {
  it('lista as propostas', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('Tubulação industrial')).toBeInTheDocument();
    expect(screen.getByText('Montagem estrutural')).toBeInTheDocument();
    expect(screen.getByText('PC_12-26')).toBeInTheDocument();
  });

  it('filtra pelo chip de status', async () => {
    stubApi();
    renderView();
    await screen.findByText('Tubulação industrial');
    fireEvent.click(screen.getByRole('button', { name: /Aceita/ }));
    expect(screen.getByText('Montagem estrutural')).toBeInTheDocument();
    expect(
      screen.queryByText('Tubulação industrial'),
    ).not.toBeInTheDocument();
  });

  it('abre o modal de nova proposta', async () => {
    stubApi();
    renderView();
    await screen.findByText('Tubulação industrial');
    fireEvent.click(screen.getByRole('button', { name: '+ Nova Proposta' }));
    expect(
      await screen.findByText('Nova Proposta Comercial'),
    ).toBeInTheDocument();
  });
});
