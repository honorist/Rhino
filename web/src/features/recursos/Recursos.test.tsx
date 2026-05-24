import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import Recursos from './Recursos';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const RECURSOS = [
  {
    id: 'r1',
    nome: 'Ana Silva',
    profissao: 'Soldadora',
    status: 'funcionario',
  },
  {
    id: 'r2',
    nome: 'Bruno Costa',
    profissao: 'Eletricista',
    status: 'candidato',
  },
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
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<Recursos />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Recursos (view migrada)', () => {
  it('lista o título e os colaboradores', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();
    expect(screen.getByText('Recursos Humanos')).toBeInTheDocument();
  });

  it('abre o modal de novo cadastro', async () => {
    stubApi();
    renderView();
    await screen.findByText('Ana Silva');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo Cadastro' }));
    expect(screen.getByText('Dados Pessoais')).toBeInTheDocument();
  });

  it('filtra por status', async () => {
    stubApi();
    renderView();
    await screen.findByText('Ana Silva');
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'candidato' } });
    expect(screen.queryByText('Ana Silva')).not.toBeInTheDocument();
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();
  });
});
