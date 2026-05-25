import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Frota from './Frota';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const VEICULOS = [
  {
    id: 'v1',
    placa: 'ABC1234',
    marca: 'Fiat',
    modelo: 'Strada',
    tipo: 'carro',
    ano: 2020,
    kmAtual: 50_000,
    status: 'ativo',
    contractId: null,
    planos: [],
    manutencoes: [],
  },
  {
    id: 'v2',
    placa: 'XYZ2A34',
    marca: 'VW',
    modelo: 'Saveiro',
    tipo: 'caminhao',
    kmAtual: 80_000,
    status: 'manutencao',
    planos: [],
    manutencoes: [],
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/veiculos')) {
        return jsonResponse({ veiculos: VEICULOS });
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
  return render(<Frota />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Frota (view migrada)', () => {
  it('lista o título e os veículos', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('ABC1234')).toBeInTheDocument();
    expect(screen.getByText('XYZ2A34')).toBeInTheDocument();
    expect(screen.getByText('2 veículos')).toBeInTheDocument();
  });

  it('abre o modal de novo veículo', async () => {
    stubApi();
    renderView();
    await screen.findByText('ABC1234');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo Veículo' }));
    expect(screen.getByText('Novo Veículo')).toBeInTheDocument();
  });

  it('filtra a tabela por status', async () => {
    stubApi();
    renderView();
    await screen.findByText('ABC1234');
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'manutencao' } });
    expect(screen.queryByText('ABC1234')).not.toBeInTheDocument();
    expect(screen.getByText('XYZ2A34')).toBeInTheDocument();
  });
});
