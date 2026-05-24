import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import Apresentacao from './Apresentacao';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/app-settings/proposta_apresentacao')) {
        return jsonResponse({
          apresentacao: {
            apresentacao: 'Sobre a Rhino...',
            casesSucesso: '',
            segurancaSaude: '',
          },
        });
      }
      if (url.includes('/api/case-logos')) {
        return jsonResponse({ logos: [] });
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
  return render(<Apresentacao />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Apresentacao (view migrada)', () => {
  it('carrega os textos e mostra o estado vazio de logos', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByText('Apresentação da Empresa'),
    ).toBeInTheDocument();
    expect(
      await screen.findByDisplayValue('Sobre a Rhino...'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nenhuma logo cadastrada/),
    ).toBeInTheDocument();
  });
});
