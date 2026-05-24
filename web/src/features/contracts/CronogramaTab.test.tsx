import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import CronogramaTab from './CronogramaTab';
import type { Contract } from './types';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const CONTRACT: Contract = {
  id: 'c1',
  name: 'Obra Alfa',
  client: 'Cliente X',
  status: 'ativo',
  startDate: '2026-01-01',
};

const ATIVIDADES = [
  {
    id: 'a1',
    nome: 'Engenharia',
    dataInicioPlan: '2026-01-01',
    dataFimPlan: '2026-02-28',
    pesoPct: 40,
    execPct: 100,
    custoPlan: 10_000,
  },
  {
    id: 'a2',
    nome: 'Montagem',
    dataInicioPlan: '2026-03-01',
    dataFimPlan: '2026-05-31',
    pesoPct: 60,
    execPct: 20,
    custoPlan: 30_000,
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/atividades')) {
        return jsonResponse({ atividades: ATIVIDADES });
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    }),
  );
}

function renderTab() {
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
  return render(<CronogramaTab contract={CONTRACT} />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CronogramaTab (aba migrada)', () => {
  it('lista as etapas e o resumo do cronograma', async () => {
    stubApi();
    renderTab();
    // "Custo planejado" só aparece no resumo, após carregar as atividades.
    expect(await screen.findByText('Custo planejado')).toBeInTheDocument();
    expect(screen.getAllByText('Engenharia').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Montagem').length).toBeGreaterThan(0);
  });

  it('abre o modal de nova etapa', async () => {
    stubApi();
    renderTab();
    await screen.findByText('Custo planejado');
    fireEvent.click(screen.getByRole('button', { name: '+ Nova etapa' }));
    expect(
      await screen.findByText('Nova etapa do cronograma'),
    ).toBeInTheDocument();
  });
});
