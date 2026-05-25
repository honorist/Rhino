import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Documentos from './Documentos';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const RECURSOS = [
  {
    id: 'r1',
    nome: 'Ana Silva',
    profissao: 'Soldadora',
    status: 'funcionario',
    documentos: [
      { id: 'd1', tipo: 'ASO', tipoLabel: 'ASO', dataVencimento: '2026-12-01' },
    ],
  },
  {
    id: 'r2',
    nome: 'Bruno Costa',
    profissao: 'Eletricista',
    status: 'funcionario',
    documentos: [],
  },
  { id: 'r3', nome: 'Carlos Réu', status: 'candidato', documentos: [] },
];

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/recursos')) {
        return jsonResponse({ recursos: RECURSOS });
      }
      if (url.includes('/api/contracts')) {
        return jsonResponse({ contracts: [], saidas: [] });
      }
      if (url.includes('/api/doc-templates')) {
        return jsonResponse({ templates: [] });
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
  return render(<Documentos />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Documentos (view migrada)', () => {
  it('lista só os funcionários ativos', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();
    expect(screen.queryByText('Carlos Réu')).not.toBeInTheDocument();
  });

  it('mostra os botões de documentos por funcionário', async () => {
    stubApi();
    renderView();
    await screen.findByText('Ana Silva');
    expect(screen.getByText('Ver 1 doc')).toBeInTheDocument();
    expect(screen.getByText('+ Adicionar')).toBeInTheDocument();
  });

  it('abre o modal de documentos do colaborador', async () => {
    stubApi();
    renderView();
    await screen.findByText('Ana Silva');
    fireEvent.click(screen.getByText('Ver 1 doc'));
    expect(
      await screen.findByText('Documentos — Ana Silva'),
    ).toBeInTheDocument();
  });
});
