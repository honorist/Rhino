import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import Estoque from './Estoque';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const VISAO = {
  almoxarifados: [
    { id: 'central', nome: 'Central' },
    { id: 'a1', nome: 'Almox', contractId: 'c1', contractName: 'Obra Alfa' },
  ],
  itens: [
    {
      id: 'i1',
      descricao: 'Tinta Branca',
      categoria: 'Tinta e Solventes',
      unidade: 'l',
      custoMedio: 30,
      estoqueMinimo: 5,
      saldos: [{ almoxId: 'central', qtd: 12 }],
    },
  ],
};

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/estoque/visao-geral')) {
        return jsonResponse(VISAO);
      }
      if (url.includes('/api/estoque/movimentacoes')) {
        return jsonResponse({ movimentacoes: [] });
      }
      if (url.includes('/api/contracts')) {
        return jsonResponse({ contracts: [], saidas: [] });
      }
      if (url.includes('/api/fornecedores')) {
        return jsonResponse({ fornecedores: [] });
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
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<Estoque />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Estoque (view migrada)', () => {
  it('lista o título e os itens na matriz', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('Tinta Branca')).toBeInTheDocument();
    expect(screen.getByText('📦 Almoxarifado')).toBeInTheDocument();
    expect(screen.getByText('Itens cadastrados')).toBeInTheDocument();
  });

  it('abre o modal de novo item', async () => {
    stubApi();
    renderView();
    await screen.findByText('Tinta Branca');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo item' }));
    expect(
      screen.getByRole('button', { name: 'Criar item' }),
    ).toBeInTheDocument();
  });

  it('troca para a aba de histórico', async () => {
    stubApi();
    renderView();
    await screen.findByText('Tinta Branca');
    fireEvent.click(screen.getByRole('button', { name: /Histórico/ }));
    expect(
      await screen.findByText(/Nenhuma movimentação ainda/),
    ).toBeInTheDocument();
  });
});
