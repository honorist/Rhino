import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import Clientes from './Clientes';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      if (String(input).includes('/api/clientes')) {
        return jsonResponse({
          clientes: [
            {
              id: 'c1',
              nome: 'Maria Souza',
              empresa: 'Construtora Alfa',
              email: 'maria@alfa.com',
            },
            { id: 'c2', nome: 'Pedro Lima', empresa: 'Beta Engenharia' },
          ],
        });
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    }),
  );
}

function renderClientes() {
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
  return render(<Clientes />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Clientes (view migrada)', () => {
  it('lista os clientes da API', async () => {
    stubApi();
    renderClientes();
    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('Pedro Lima')).toBeInTheDocument();
  });

  it('filtra pela busca textual', async () => {
    stubApi();
    renderClientes();
    await screen.findByText('Maria Souza');
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/i), {
      target: { value: 'pedro' },
    });
    expect(screen.queryByText('Maria Souza')).not.toBeInTheDocument();
    expect(screen.getByText('Pedro Lima')).toBeInTheDocument();
  });

  it('abre o modal de novo cliente', async () => {
    stubApi();
    renderClientes();
    await screen.findByText('Maria Souza');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo Cliente' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
