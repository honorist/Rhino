import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Clausulas from './Clausulas';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const CLAUSULAS = [
  {
    id: 'cl1',
    titulo: 'EPIs e EPCs',
    texto: 'A contratada deve fornecer todos os equipamentos.',
    categoria: 'obrigacoes_contratada',
    tags: ['seguranca'],
    ativa: true,
    usoCount: 3,
  },
  {
    id: 'cl2',
    titulo: 'Forma de pagamento',
    texto: 'O pagamento será feito em 30 dias.',
    categoria: 'pagamento',
    tags: [],
    ativa: true,
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      if (String(input).includes('/api/clausulas')) {
        return jsonResponse({ clausulas: CLAUSULAS });
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
  return render(<Clausulas />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Clausulas (view migrada)', () => {
  it('lista as cláusulas em cards', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('EPIs e EPCs')).toBeInTheDocument();
    expect(screen.getByText('Forma de pagamento')).toBeInTheDocument();
  });

  it('filtra pela categoria', async () => {
    stubApi();
    renderView();
    await screen.findByText('EPIs e EPCs');
    fireEvent.click(screen.getByRole('button', { name: /Pagamento/ }));
    expect(screen.getByText('Forma de pagamento')).toBeInTheDocument();
    expect(screen.queryByText('EPIs e EPCs')).not.toBeInTheDocument();
  });

  it('abre o modal de nova cláusula', async () => {
    stubApi();
    renderView();
    await screen.findByText('EPIs e EPCs');
    fireEvent.click(screen.getByRole('button', { name: '+ Nova Cláusula' }));
    expect(await screen.findByText('Nova Cláusula')).toBeInTheDocument();
  });
});
