import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Investimentos from './Investimentos';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/investimentos')) {
        return jsonResponse({
          investimentos: [
            {
              id: 'a1',
              value: 5000,
              date: '2026-04-10',
              origem: 'socio',
              destino: 'contrato',
              socioId: 's1',
              contractId: 'c1',
              baseType: 'outros',
            },
            {
              id: 'a2',
              value: 2000,
              date: '2026-05-02',
              origem: 'caixa_empresa',
              destino: 'base',
              description: 'Compra notebook',
              baseType: 'outros',
            },
          ],
        });
      }
      if (url.includes('/api/socios')) {
        return jsonResponse({
          socios: [{ id: 's1', name: 'João Sócio', participacao: 100 }],
        });
      }
      if (url.includes('/api/contracts')) {
        return jsonResponse({
          contracts: [{ id: 'c1', name: 'Obra A', client: 'Cliente X' }],
          saidas: [],
        });
      }
      if (url.includes('/api/tipos-base')) {
        return jsonResponse({
          tipos: [
            { id: 't1', key: 'outros', label: 'Outros', icon: '🔹', cor: '#718096' },
          ],
        });
      }
      if (url.includes('/api/base')) {
        return jsonResponse({ items: [] });
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
  return render(<Investimentos />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Investimentos (view migrada)', () => {
  it('mostra o capital total e o histórico de aportes', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByText('Capital Total Aportado'),
    ).toBeInTheDocument();
    // Capital Total Aportado = 5000 + 2000 (KPI + total do rodapé).
    expect(screen.getAllByText('R$ 7.000,00').length).toBeGreaterThan(0);
    expect(screen.getByText('Compra notebook')).toBeInTheDocument();
    expect(screen.getByText('2 aportes')).toBeInTheDocument();
  });

  it('filtra o histórico por origem', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('2 aportes')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '💰 Caixa Empresa' }),
    );
    expect(screen.getByText('1 aporte')).toBeInTheDocument();
  });

  it('abre o modal de detalhe ao clicar numa linha', async () => {
    stubApi();
    renderView();
    fireEvent.click(await screen.findByText('Compra notebook'));
    expect(
      await screen.findByText('💼 Caixa da empresa'),
    ).toBeInTheDocument();
  });

  it('abre o modal de novo aporte', async () => {
    stubApi();
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: '+ Novo Aporte' }));
    expect(
      screen.getByText('1. Origem do Aporte *'),
    ).toBeInTheDocument();
  });
});
