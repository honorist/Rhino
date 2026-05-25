import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Base from './Base';

const HOJE = new Date().toISOString().slice(0, 10);

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/tipos-base')) {
        return jsonResponse({
          tipos: [
            { id: 't1', key: 'material', label: 'Material', icon: '📦', cor: '#c2410c' },
          ],
        });
      }
      if (url.includes('/api/contracts')) {
        return jsonResponse({ contracts: [], saidas: [] });
      }
      if (url.includes('/api/base')) {
        return jsonResponse({
          items: [
            {
              id: 'b1',
              description: 'Aluguel da sala',
              type: 'material',
              value: 1500,
              date: HOJE,
              allocations: [],
            },
          ],
        });
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    }),
  );
}

function renderBase() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    );
  }
  return render(<Base />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Base (view migrada)', () => {
  it('renderiza o cabeçalho da BASE', () => {
    stubApi();
    renderBase();
    expect(
      screen.getByRole('heading', { name: 'BASE — Centro de Custo' }),
    ).toBeInTheDocument();
  });

  it('lista os itens do mês corrente', async () => {
    stubApi();
    renderBase();
    expect(await screen.findByText('Aluguel da sala')).toBeInTheDocument();
  });

  it('abre o modal de novo item', async () => {
    stubApi();
    renderBase();
    await screen.findByText('Aluguel da sala');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo Item' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Novo Item BASE')).toBeInTheDocument();
  });

  it('abre o modal de alocação', async () => {
    stubApi();
    renderBase();
    await screen.findByText('Aluguel da sala');
    fireEvent.click(screen.getByRole('button', { name: 'Alocar' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
