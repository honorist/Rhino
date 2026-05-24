import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import SolicitacoesCompra from './SolicitacoesCompra';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const SOLICITACOES = [
  {
    id: 's1',
    numero: 1,
    status: 'pendente_avaliacao',
    solicitanteNome: 'Ana Lima',
    itens: [{ descricao: 'Tinta', qtd: 2 }],
    createdAt: '2026-05-20T10:00:00Z',
  },
  {
    id: 's2',
    numero: 2,
    status: 'aprovada',
    solicitanteNome: 'Bruno Sá',
    valorTotal: 500,
    contractId: 'c1',
    itens: [{ descricao: 'Cabo', qtd: 10, precoUnit: 50 }],
    createdAt: '2026-05-18T10:00:00Z',
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/solicitacoes-compra')) {
        return jsonResponse({ solicitacoes: SOLICITACOES });
      }
      if (url.includes('/api/contracts')) {
        return jsonResponse({
          contracts: [{ id: 'c1', name: 'Obra Alfa', status: 'ativo' }],
          saidas: [],
        });
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
  return render(<SolicitacoesCompra />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SolicitacoesCompra (view migrada)', () => {
  it('lista o título e as solicitações', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByText('Solicitações de Compra'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ana Lima')).toBeInTheDocument();
    expect(screen.getByText('Bruno Sá')).toBeInTheDocument();
  });

  it('mostra as ações conforme a etapa', async () => {
    stubApi();
    renderView();
    await screen.findByText('Solicitações de Compra');
    expect(screen.getByText('Avaliar/Precificar')).toBeInTheDocument();
    expect(screen.getByText('Registrar compra')).toBeInTheDocument();
  });

  it('abre o modal de detalhe', async () => {
    stubApi();
    renderView();
    await screen.findByText('Solicitações de Compra');
    fireEvent.click(screen.getAllByText('Ver')[0]);
    expect(await screen.findByText('Solicitação #1')).toBeInTheDocument();
  });
});
