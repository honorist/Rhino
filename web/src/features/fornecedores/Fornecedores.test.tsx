import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import Fornecedores from './Fornecedores';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      if (String(input).includes('/api/fornecedores')) {
        return jsonResponse({
          fornecedores: [
            {
              id: 'f1',
              nome: 'Aço Forte Ltda',
              cnpj: '11.222.333/0001-44',
              pessoaContato: 'Carlos',
              materiais: ['Estrutura Metálica', 'Solda'],
            },
            { id: 'f2', nome: 'Tintas Brasil', materiais: ['Pintura'] },
          ],
        });
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    }),
  );
}

function renderFornecedores() {
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
  return render(<Fornecedores />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Fornecedores (view migrada)', () => {
  it('lista os fornecedores vindos da API', async () => {
    stubApi();
    renderFornecedores();
    expect(await screen.findByText('Aço Forte Ltda')).toBeInTheDocument();
    expect(screen.getByText('Tintas Brasil')).toBeInTheDocument();
  });

  it('filtra pela busca textual', async () => {
    stubApi();
    renderFornecedores();
    await screen.findByText('Aço Forte Ltda');
    fireEvent.change(
      screen.getByPlaceholderText(/Buscar por nome/i),
      { target: { value: 'tintas' } },
    );
    expect(screen.queryByText('Aço Forte Ltda')).not.toBeInTheDocument();
    expect(screen.getByText('Tintas Brasil')).toBeInTheDocument();
  });

  it('abre o modal de novo fornecedor', async () => {
    stubApi();
    renderFornecedores();
    await screen.findByText('Aço Forte Ltda');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo Fornecedor' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
