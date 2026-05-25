import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FolhaPagamento from './FolhaPagamento';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const FOLHA_ROW = {
  id: 'f1',
  recursoId: 'r1',
  recursoNome: 'Maria Silva',
  contractId: 'c1',
  salarioBase: 3000,
  valorVale: 1200,
  valorSaldo: 1800,
  elegivelVale: true,
  valePago: false,
  saldoPago: false,
  itens: [],
};

function stubApi(options: { vazia?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/folha-pagamento')) {
        return jsonResponse({ folha: options.vazia ? [] : [FOLHA_ROW] });
      }
      if (url.includes('/api/contracts')) {
        return jsonResponse({
          contracts: [{ id: 'c1', name: 'Obra Beta' }],
          saidas: [],
        });
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
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    );
  }
  return render(<FolhaPagamento />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FolhaPagamento (view migrada)', () => {
  it('lista os colaboradores da competência', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('Obra Beta')).toBeInTheDocument();
    expect(screen.getByText(/1 colaborador/)).toBeInTheDocument();
  });

  it('mostra o estado vazio quando a folha não foi gerada', async () => {
    stubApi({ vazia: true });
    renderView();
    expect(
      await screen.findByText(/ainda não gerada/),
    ).toBeInTheDocument();
  });

  it('abre o modal de pagamento ao clicar em Pagar', async () => {
    stubApi();
    renderView();
    await screen.findByText('Maria Silva');
    fireEvent.click(screen.getAllByText('Pagar')[0]);
    expect(
      await screen.findByText('Pagar Vale — Maria Silva'),
    ).toBeInTheDocument();
  });

  it('abre o modal de lançamentos', async () => {
    stubApi();
    renderView();
    await screen.findByText('Maria Silva');
    fireEvent.click(screen.getByText('Lançamentos', { selector: 'a' }));
    expect(
      await screen.findByText('Lançamentos — Maria Silva'),
    ).toBeInTheDocument();
    expect(screen.getByText('Novo lançamento')).toBeInTheDocument();
  });
});
