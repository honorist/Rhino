import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrganogramaTab from './OrganogramaTab';
import type { Contract } from './types';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const CONTRACT: Contract = {
  id: 'c1',
  name: 'Obra Alfa',
  client: 'Cliente X',
  status: 'ativo',
  organograma: [
    { id: 'm1', recursoId: 'r1', nivel: 'encarregado' },
    { id: 'm2', recursoId: 'r2', nivel: 'profissional', supervisorId: 'm1' },
  ],
};

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/recursos')) {
        return jsonResponse({
          recursos: [
            { id: 'r1', nome: 'Ana', profissao: 'Encarregado', status: 'funcionario' },
            { id: 'r2', nome: 'Beto', profissao: 'Pedreiro', status: 'funcionario' },
          ],
        });
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
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<OrganogramaTab contract={CONTRACT} />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrganogramaTab (aba migrada)', () => {
  it('mostra os membros da equipe', async () => {
    stubApi();
    renderTab();
    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Beto')).toBeInTheDocument();
  });

  it('alterna para a vista em lista', async () => {
    stubApi();
    renderTab();
    await screen.findByText('Ana');
    fireEvent.click(screen.getByRole('button', { name: '☰ Lista' }));
    expect(screen.getByRole('columnheader', { name: 'Supervisor' })).toBeInTheDocument();
  });

  it('abre o modal de adicionar membro', async () => {
    stubApi();
    renderTab();
    await screen.findByText('Ana');
    fireEvent.click(
      screen.getByRole('button', { name: '+ Adicionar Membro' }),
    );
    expect(
      await screen.findByText('Adicionar Membro ao Organograma'),
    ).toBeInTheDocument();
  });
});
