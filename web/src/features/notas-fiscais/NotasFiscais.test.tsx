import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotasFiscais from './NotasFiscais';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const NOTAS = [
  {
    id: 'nf1',
    numero: '1001/2026',
    valor: 5000,
    contractId: 'c1',
    dataLimite: '2026-12-01',
    prazoRecebimento: 30,
    emitida: false,
  },
  {
    id: 'nf2',
    numero: '1002/2026',
    valor: 8000,
    contractId: 'c1',
    dataLimite: '2026-03-01',
    prazoRecebimento: 30,
    emitida: true,
    dataEmissaoReal: '2026-03-05',
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/notas-fiscais')) {
        return jsonResponse({ notas_fiscais: NOTAS });
      }
      if (url.includes('/api/contracts')) {
        return jsonResponse({
          contracts: [{ id: 'c1', name: 'Obra Gama', client: 'Cliente Z' }],
          saidas: [],
        });
      }
      if (url.includes('/api/caixa')) {
        return jsonResponse({ entries: [] });
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
  return render(<NotasFiscais />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NotasFiscais (view migrada)', () => {
  it('lista as notas na aba Lista Geral', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('1001/2026')).toBeInTheDocument();
    expect(screen.getByText('1002/2026')).toBeInTheDocument();
    expect(screen.getByText(/2 notas registradas/)).toBeInTheDocument();
  });

  it('alterna para a aba Semanal', async () => {
    stubApi();
    renderView();
    await screen.findByText('1001/2026');
    fireEvent.click(screen.getByRole('button', { name: '📅 Semanal' }));
    expect(screen.getByText('Esta semana')).toBeInTheDocument();
  });

  it('abre o modal de nova conta a receber', async () => {
    stubApi();
    renderView();
    await screen.findByText('1001/2026');
    fireEvent.click(
      screen.getByRole('button', { name: '+ Nova Conta a Receber' }),
    );
    expect(await screen.findByText('Nova Nota Fiscal')).toBeInTheDocument();
  });

  it('abre o modal de detalhe ao clicar numa linha', async () => {
    stubApi();
    renderView();
    fireEvent.click(await screen.findByText('1001/2026'));
    expect(await screen.findByText('NF 1001/2026')).toBeInTheDocument();
  });
});
