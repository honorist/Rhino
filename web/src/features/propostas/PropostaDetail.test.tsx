import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import PropostaDetail from './PropostaDetail';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

const PROPOSTA = {
  id: 'p1',
  numero: '7',
  ano: 26,
  revisao: 0,
  titulo: 'Tubulação industrial',
  tipo: 'ambos',
  status: 'rascunho',
  valorTotal: 50000,
  clienteEmpresa: 'Metalúrgica Sul',
  escopo: [],
  obrigacoesContratada: [],
  obrigacoesContratante: [],
  cronograma: [],
  investimentoHh: [],
  investimentoMat: [],
  custos: [],
  anexos: [],
};

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/propostas/p1')) {
        return jsonResponse({ proposta: PROPOSTA });
      }
      if (url.includes('/api/clientes')) {
        return jsonResponse({ clientes: [] });
      }
      if (url.includes('/api/clausulas')) {
        return jsonResponse({ clausulas: [] });
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
      <MemoryRouter initialEntries={['/proposta/p1']}>
        <QueryClientProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(
    <Routes>
      <Route path="/proposta/:id" element={<PropostaDetail />} />
    </Routes>,
    { wrapper: Wrapper },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PropostaDetail (editor migrado)', () => {
  it('carrega a proposta e mostra o cabeçalho', async () => {
    stubApi();
    renderView();
    expect(await screen.findByText('PC_7-26')).toBeInTheDocument();
    expect(
      screen.getByText(/Tubulação industrial · Metalúrgica Sul/),
    ).toBeInTheDocument();
  });

  it('renderiza as 8 abas e a aba Dados Gerais por padrão', async () => {
    stubApi();
    renderView();
    await screen.findByText('PC_7-26');
    for (const aba of [
      'Dados Gerais',
      'Escopo / Fora',
      'Obrigações',
      'Cronograma',
      'Investimento',
      'Custo Interno',
      'Anexos',
      'Preview',
    ]) {
      expect(
        screen.getByRole('button', { name: new RegExp(aba) }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText('Identificação do Cliente'),
    ).toBeInTheDocument();
  });

  it('troca para a aba Cronograma ao clicar', async () => {
    stubApi();
    renderView();
    await screen.findByText('PC_7-26');
    fireEvent.click(screen.getByRole('button', { name: /Cronograma/ }));
    expect(
      screen.getByRole('heading', { name: 'Cronograma' }),
    ).toBeInTheDocument();
  });
});
