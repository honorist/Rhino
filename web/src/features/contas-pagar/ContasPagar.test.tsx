import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ContasPagar from './ContasPagar';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const CONTAS = [
  {
    id: 'cp1',
    descricao: 'Energia elétrica',
    status: 'pendente',
    valor: 800,
    dataVencimento: '2026-12-01',
    fornecedorId: 'fo1',
  },
  {
    id: 'cp2',
    descricao: 'Aluguel galpão',
    status: 'pago',
    valor: 3000,
    dataPagamento: '2026-05-01',
    formaPagamento: 'PIX',
    valorPago: 3000,
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('processar-recorrencias')) {
        return jsonResponse({ ok: true });
      }
      if (url.includes('/api/contas-pagar')) {
        return jsonResponse({ contas: CONTAS });
      }
      if (url.includes('/api/fornecedores')) {
        return jsonResponse({ fornecedores: [{ id: 'fo1', nome: 'CEMIG' }] });
      }
      if (url.includes('/api/contracts')) {
        return jsonResponse({ contracts: [], saidas: [] });
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
  return render(<ContasPagar />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ContasPagar (view migrada)', () => {
  it('lista as contas pendentes por padrão', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('Energia elétrica')).toBeInTheDocument();
    expect(screen.queryByText('Aluguel galpão')).not.toBeInTheDocument();
    expect(screen.getByText(/1 pendente/)).toBeInTheDocument();
  });

  it('filtra para mostrar as contas pagas', async () => {
    stubApi();
    renderView();
    await screen.findByText('Energia elétrica');
    fireEvent.click(screen.getByRole('button', { name: '✅ Pagas' }));
    expect(screen.getByText('Aluguel galpão')).toBeInTheDocument();
    expect(screen.queryByText('Energia elétrica')).not.toBeInTheDocument();
  });

  it('abre o modal de nova conta', async () => {
    stubApi();
    renderView();
    await screen.findByText('Energia elétrica');
    fireEvent.click(screen.getByRole('button', { name: '+ Nova Conta' }));
    expect(
      await screen.findByText('Nova Conta a Pagar'),
    ).toBeInTheDocument();
  });

  it('abre o modal de pagamento ao clicar em Pagar', async () => {
    stubApi();
    renderView();
    await screen.findByText('Energia elétrica');
    fireEvent.click(screen.getByText('Pagar'));
    expect(
      await screen.findByText('Registrar Pagamento'),
    ).toBeInTheDocument();
  });
});
