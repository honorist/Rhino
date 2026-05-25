import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ManutencaoView from './Manutencao';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const MANUTENCOES = [
  {
    id: 'm1',
    equipamento: 'Solda Bambozzi',
    problema: 'não liga',
    status: 'solicitada',
    contractId: null,
  },
  {
    id: 'm2',
    equipamento: 'Furadeira',
    status: 'aprovada',
    contractId: 'c1',
    oficina: 'Oficina X',
    dataEnvio: '2026-05-10',
    dataRetornoPrevista: '2026-05-15',
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/manutencoes')) {
        return jsonResponse({ manutencoes: MANUTENCOES });
      }
      if (url.includes('/api/contracts')) {
        return jsonResponse({
          contracts: [{ id: 'c1', name: 'Obra Alfa', status: 'ativo' }],
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
      <MemoryRouter>
        <QueryClientProvider client={client}>
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<ManutencaoView />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Manutencao (view migrada)', () => {
  it('lista o título e as manutenções', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByText('Manutenção de Equipamentos'),
    ).toBeInTheDocument();
    expect(screen.getByText('Solda Bambozzi')).toBeInTheDocument();
    expect(screen.getByText('Furadeira')).toBeInTheDocument();
  });

  it('mostra a ação Avaliar para uma solicitação', async () => {
    stubApi();
    renderView();
    await screen.findByText('Manutenção de Equipamentos');
    expect(screen.getByText('Avaliar')).toBeInTheDocument();
    expect(screen.getByText('Registrar retorno')).toBeInTheDocument();
  });

  it('filtra a tabela por status', async () => {
    stubApi();
    renderView();
    await screen.findByText('Manutenção de Equipamentos');
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'aprovada' },
    });
    expect(screen.queryByText('Solda Bambozzi')).not.toBeInTheDocument();
    expect(screen.getByText('Furadeira')).toBeInTheDocument();
  });
});
