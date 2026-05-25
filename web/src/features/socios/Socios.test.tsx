import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Socios from './Socios';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/investimentos')) {
        return jsonResponse({
          investimentos: [{ id: 'i1', socioId: 's1', value: 5000 }],
        });
      }
      if (url.includes('/api/socios')) {
        return jsonResponse({
          socios: [
            {
              id: 's1',
              name: 'João Silva',
              document: '123.456.789-00',
              email: 'joao@rhino.com',
              participacao: 60,
            },
          ],
        });
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    }),
  );
}

function renderSocios() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    );
  }
  return render(<Socios />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Socios (view migrada)', () => {
  it('lista os sócios vindos da API', async () => {
    stubApi();
    renderSocios();
    expect(await screen.findByText('João Silva')).toBeInTheDocument();
  });

  it('exibe o resumo de participação calculado', async () => {
    stubApi();
    renderSocios();
    await screen.findByText('João Silva');
    expect(screen.getByText('Participação Registrada')).toBeInTheDocument();
    // 100 − 60 = 40 — valor único do resumo (não aparece nas linhas).
    expect(screen.getByText('40.00%')).toBeInTheDocument();
  });

  it('calcula o total investido por sócio a partir dos aportes', async () => {
    stubApi();
    renderSocios();
    await screen.findByText('João Silva');
    expect(screen.getByText('R$ 5.000,00')).toBeInTheDocument();
  });

  it('abre o modal de novo sócio', async () => {
    stubApi();
    renderSocios();
    await screen.findByText('João Silva');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo Sócio' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Novo Sócio')).toBeInTheDocument();
  });
});
