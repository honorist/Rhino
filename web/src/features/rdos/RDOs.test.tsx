import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RDOs from './RDOs';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const STATS = {
  ultimoDiaUtil: '2026-05-21',
  hoje: '2026-05-22',
  ehFimDeSemana: false,
  obrasAtivas: 5,
  obrasSemRdoOntem: [
    {
      contractId: 'c1',
      name: 'Obra Alfa',
      client: 'Cliente X',
      ultimoRdo: '2026-05-15',
    },
  ],
  obrasAtrasadas: [],
  aderencia7d: 72,
  diasUteisAvaliados: 7,
  aderenciaDiaria: [
    { data: '2026-05-21', feitos: 3, esperados: 5, pct: 60 },
  ],
  aderenciaMes: 70,
  diasUteisMes: 15,
  feitosMes: 50,
  esperadosMes: 75,
};

const RDOS = [
  {
    id: 'r1',
    contractId: 'c1',
    contractName: 'Obra Alfa',
    contractClient: 'Cliente X',
    numero: 10,
    data: '2026-05-21',
    osNumero: 'OS-1',
    updatedAt: '2026-05-21T10:00:00Z',
  },
  {
    id: 'r2',
    contractId: 'c2',
    contractName: 'Obra Beta',
    contractClient: 'Cliente Y',
    numero: 4,
    data: '2026-05-20',
    osNumero: 'OS-2',
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/rdos')) {
        return jsonResponse({ rdos: RDOS, stats: STATS });
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
  return render(<RDOs />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RDOs (view migrada)', () => {
  it('mostra o título e os KPIs', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByText('RDOs — Todos os Contratos'),
    ).toBeInTheDocument();
    expect(screen.getByText('Obras ativas')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
  });

  it('lista os RDOs na tabela', async () => {
    stubApi();
    renderView();
    await screen.findByText('RDOs — Todos os Contratos');
    expect(screen.getByText('Obra Beta')).toBeInTheDocument();
    expect(screen.getByText('OS-1')).toBeInTheDocument();
    expect(screen.getByText('2 RDOs encontrados')).toBeInTheDocument();
  });

  it('filtra a tabela por contrato', async () => {
    stubApi();
    renderView();
    await screen.findByText('RDOs — Todos os Contratos');
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'c1' },
    });
    expect(screen.queryByText('Obra Beta')).not.toBeInTheDocument();
    expect(screen.getByText('1 RDOs encontrados')).toBeInTheDocument();
  });
});
