import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CobrancaMensal from './CobrancaMensal';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const HISTORICO = {
  meses: [
    {
      ano: 2026,
      mes: 4,
      total: 1300,
      contratosAtivos: 8,
      valorPorContrato: 100,
      valorContratos: 800,
      taxaFixa: 500,
      faixa: '1-10',
      detalhes: [
        { name: 'Contrato Alfa', diasAtivos: 30, statusAtual: 'ativo' },
      ],
    },
  ],
};

const PROJECAO = {
  ano: 2026,
  mes: 5,
  total: 1380,
  contratosAtivos: 11,
  valorPorContrato: 80,
  valorContratos: 880,
  taxaFixa: 500,
  faixa: '11-15',
  detalhes: [],
};

function stubApi(options: { aiUsage?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/cobranca-mensal/historico')) {
        return jsonResponse(HISTORICO);
      }
      if (url.includes('/api/cobranca-mensal/projecao-atual')) {
        return jsonResponse(PROJECAO);
      }
      if (url.includes('/api/ai-usage/stats')) {
        return options.aiUsage
          ? jsonResponse({
              monthly: { calls: 42, cost_usd: 0.12 },
              allTime: { calls: 500, cost_usd: 3.4 },
            })
          : Promise.resolve(new Response('off', { status: 404 }));
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
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<CobrancaMensal />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CobrancaMensal (view migrada)', () => {
  it('mostra projeção e a linha do histórico', async () => {
    stubApi();
    renderView();
    // Total projetado do mês corrente (R$ 1.380,00).
    expect(await screen.findByText('R$ 1.380,00')).toBeInTheDocument();
    expect(screen.getByText('Abr/2026')).toBeInTheDocument();
    expect(screen.getByText(/faixa/)).toBeInTheDocument();
  });

  it('abre o modal de detalhe ao clicar numa linha', async () => {
    stubApi();
    renderView();
    fireEvent.click(await screen.findByText('Abr/2026'));
    expect(await screen.findByText('Detalhe · Abr/2026')).toBeInTheDocument();
    expect(screen.getByText('Contrato Alfa')).toBeInTheDocument();
  });

  it('omite o card de IA quando o endpoint está indisponível', async () => {
    stubApi({ aiUsage: false });
    renderView();
    await screen.findByText('Abr/2026');
    expect(screen.queryByText('IA — Uso Claude API')).not.toBeInTheDocument();
  });
});
