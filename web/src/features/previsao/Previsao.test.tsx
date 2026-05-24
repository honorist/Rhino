import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Previsao from './Previsao';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      jsonResponse({
        caixaBalance: 5_000,
        saldoProjetado: [
          { data: '2026-06-01', saldo: 4_000 },
          { data: '2026-07-01', saldo: 3_000 },
        ],
        contasPagarStatus: { totalPendente: 2_000, pendentes: 3 },
        projecaoFutura: [],
        ocorrenciasVirtuais: [],
      }),
    ),
  );
}

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<Previsao />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Previsao (view migrada)', () => {
  it('carrega e mostra os KPIs de caixa', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByText('📈 Previsão de Caixa'),
    ).toBeInTheDocument();
    expect(screen.getByText('Saldo Atual')).toBeInTheDocument();
    expect(screen.getByText('Evolução do Saldo Projetado')).toBeInTheDocument();
  });
});
