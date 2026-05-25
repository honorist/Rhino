import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Auditoria from './Auditoria';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const ROWS = [
  {
    id: 1,
    ts: '2026-05-21T10:00:00Z',
    userEmail: 'ana@rhino.com',
    entity: 'clientes',
    entityId: 'c1',
    entityLabel: 'Veracel',
    action: 'create',
    status: 200,
    body: { nome: 'Veracel' },
  },
  {
    id: 2,
    ts: '2026-05-20T09:00:00Z',
    userEmail: 'bruno@rhino.com',
    entity: 'caixa',
    entityId: 'k1',
    action: 'update',
    status: 200,
    beforeState: { valor: 100 },
    body: { valor: 300 },
  },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/audit')) {
        return jsonResponse({ rows: ROWS, total: ROWS.length });
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
  return render(<Auditoria />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Auditoria (view migrada)', () => {
  it('lista o título e as atividades', async () => {
    stubApi();
    renderView();
    expect(screen.getByText('Histórico de Atividades')).toBeInTheDocument();
    expect(await screen.findByText('Veracel')).toBeInTheDocument();
    expect(screen.getByText('2 atividades')).toBeInTheDocument();
  });

  it('abre o modal de detalhe ao clicar numa linha', async () => {
    stubApi();
    renderView();
    fireEvent.click(await screen.findByText('Veracel'));
    expect(screen.getByText('Quem fez')).toBeInTheDocument();
    expect(screen.getByText('De qual rede')).toBeInTheDocument();
  });

  it('alterna para a linha do tempo', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('Fez o quê')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Linha do tempo' }));
    expect(screen.queryByText('Fez o quê')).not.toBeInTheDocument();
  });
});
