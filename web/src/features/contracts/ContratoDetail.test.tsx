import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import ContratoDetail from './ContratoDetail';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const CONTRACT = {
  id: 'c1',
  name: 'Obra Alfa',
  client: 'Cliente X',
  status: 'ativo',
  value: 100_000,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
};

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/contracts')) {
        return jsonResponse({ contracts: [CONTRACT], saidas: [] });
      }
      if (url.includes('/api/clientes')) {
        return jsonResponse({ clientes: [] });
      }
      if (url.includes('/api/notas-fiscais')) {
        return jsonResponse({ notas_fiscais: [] });
      }
      if (url.includes('/api/caixa')) return jsonResponse({ entries: [] });
      if (url.includes('/api/base')) return jsonResponse({ items: [] });
      if (url.includes('/api/tipos-base')) return jsonResponse({ tipos: [] });
      if (url.includes('/api/recursos')) return jsonResponse({ recursos: [] });
      if (url.includes('/api/contas-pagar')) {
        return jsonResponse({ contas: [] });
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
      <MemoryRouter initialEntries={['/contratos/c1']}>
        <QueryClientProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(
    <Routes>
      <Route path="/contratos/:id" element={<ContratoDetail />} />
    </Routes>,
    { wrapper: Wrapper },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ContratoDetail (orquestrador migrado)', () => {
  it('carrega o contrato e mostra cabeçalho e abas', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByRole('heading', { name: 'Obra Alfa' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ATIVO')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Visão Geral' }),
    ).toBeInTheDocument();
    // A aba Visão Geral é a padrão — seus KPIs renderizam.
    expect(await screen.findByText('Valor do Contrato')).toBeInTheDocument();
  });

  it('troca para a aba Pendências', async () => {
    stubApi();
    renderView();
    await screen.findByRole('heading', { name: 'Obra Alfa' });
    fireEvent.click(screen.getByRole('button', { name: 'Pendências' }));
    expect(
      await screen.findByText('Nenhuma pendência'),
    ).toBeInTheDocument();
  });

  it('abre o modal de edição do contrato', async () => {
    stubApi();
    renderView();
    await screen.findByRole('heading', { name: 'Obra Alfa' });
    fireEvent.click(screen.getByRole('button', { name: /Editar Dados/ }));
    expect(await screen.findByText('Dados do Cliente')).toBeInTheDocument();
  });

  it('abre o modal de nova saída na aba Financeiro', async () => {
    stubApi();
    renderView();
    await screen.findByRole('heading', { name: 'Obra Alfa' });
    fireEvent.click(screen.getByRole('button', { name: 'Financeiro' }));
    fireEvent.click(
      await screen.findByRole('button', { name: '+ Adicionar Saída' }),
    );
    expect(
      await screen.findByText('Nova Saída'),
    ).toBeInTheDocument();
  });
});
