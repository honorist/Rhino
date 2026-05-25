import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Recrutamento from './Recrutamento';

function jsonResponse(data: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status }));
}

function stubApi(solicitacoes: unknown[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/recrutamento/solicitacoes')) {
        return jsonResponse({ solicitacoes });
      }
      if (url.includes('/api/contracts')) return jsonResponse({ contracts: [], saidas: [] });
      return jsonResponse({});
    }),
  );
}

function renderRecrutamento() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<Recrutamento />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Recrutamento (lista)', () => {
  it('mostra estado vazio quando não há solicitações', async () => {
    stubApi([]);
    renderRecrutamento();
    expect(
      await screen.findByText(/Nenhuma solicitação encontrada/i),
    ).toBeInTheDocument();
  });

  it('renderiza solicitações da API com vagas e contagem', async () => {
    stubApi([
      {
        id: 'sol_abc',
        status: 'aberta',
        solicitanteNome: 'João Encarregado',
        createdAt: '2026-05-20T10:00:00Z',
        vagas: [
          { id: 'v1', cargo: 'Pedreiro', qtdTotal: 3, qtdPreenchida: 1 },
          { id: 'v2', cargo: 'Servente', qtdTotal: 2, qtdPreenchida: 0 },
        ],
      },
    ]);
    renderRecrutamento();
    expect(await screen.findByText('João Encarregado')).toBeInTheDocument();
    expect(screen.getByText(/3× Pedreiro/i)).toBeInTheDocument();
    expect(screen.getByText(/2× Servente/i)).toBeInTheDocument();
    // 1 preenchida de 5 total (3+2)
    expect(screen.getByText(/1\/5/)).toBeInTheDocument();
  });

  it('botão "+ Nova solicitação" abre modal', async () => {
    stubApi([]);
    renderRecrutamento();
    await screen.findByText(/Nenhuma solicitação/i);
    fireEvent.click(screen.getByRole('button', { name: /\+ Nova solicitação/i }));
    expect(
      await screen.findByRole('heading', { name: /Nova solicitação/i }),
    ).toBeInTheDocument();
  });

  it('filtro envia ?status=X na request', async () => {
    const fetchMock = vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/recrutamento/solicitacoes')) {
        return jsonResponse({ solicitacoes: [] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
    renderRecrutamento();
    await screen.findByText(/Nenhuma solicitação/i);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'aberta' } });
    await new Promise((r) => setTimeout(r, 50));
    const chamadas = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(chamadas.some((u) => u.includes('status=aberta'))).toBe(true);
  });
});
