import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import Caixa from './Caixa';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const CAIXA = [
  {
    id: 'cx1',
    type: 'entrada',
    description: 'Recebimento obra',
    value: 10000,
    date: '2026-05-10',
  },
  {
    id: 'cx2',
    type: 'saida',
    description: 'Compra material',
    value: 3000,
    date: '2026-05-12',
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/caixa')) return jsonResponse({ entries: CAIXA });
      if (url.includes('/api/contracts')) {
        return jsonResponse({ contracts: [], saidas: [] });
      }
      if (url.includes('/api/contas-pagar')) {
        return jsonResponse({ contas: [] });
      }
      if (url.includes('/api/notas-fiscais')) {
        return jsonResponse({ notas_fiscais: [] });
      }
      if (url.includes('/api/base')) return jsonResponse({ items: [] });
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
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<Caixa />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Caixa (view migrada)', () => {
  it('lista os lançamentos do caixa', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('Recebimento obra')).toBeInTheDocument();
    expect(screen.getByText('Compra material')).toBeInTheDocument();
    // KPIs do período.
    expect(screen.getByText('Total Entradas')).toBeInTheDocument();
    expect(screen.getAllByText('+R$ 10.000,00').length).toBeGreaterThan(0);
  });

  it('abre o modal de novo lançamento', async () => {
    stubApi();
    renderView();
    await screen.findByText('Recebimento obra');
    fireEvent.click(
      screen.getByRole('button', { name: '+ Novo Lançamento' }),
    );
    expect(await screen.findByText('Novo Lançamento')).toBeInTheDocument();
  });

  it('abre o modal de detalhe ao clicar numa linha', async () => {
    stubApi();
    renderView();
    fireEvent.click(await screen.findByText('Compra material'));
    expect(await screen.findByText('ID: cx2')).toBeInTheDocument();
  });
});
