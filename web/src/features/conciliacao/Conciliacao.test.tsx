import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Conciliacao from './Conciliacao';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      if (String(input).includes('/api/contas-pagar')) {
        return jsonResponse({ contas: [] });
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
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    );
  }
  return render(<Conciliacao />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Conciliacao (view migrada)', () => {
  it('mostra a tela de upload inicialmente', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByText('Arraste seu extrato aqui'),
    ).toBeInTheDocument();
  });

  it('passa à tela de conciliação após importar um CSV', async () => {
    stubApi();
    const { container } = renderView();
    await screen.findByText('Arraste seu extrato aqui');

    const csv = [
      'Data;Valor;Descricao',
      '15/01/2026;-150,00;Pagamento fornecedor',
    ].join('\n');
    const file = new File([csv], 'extrato.csv', { type: 'text/csv' });
    // jsdom desta versão não implementa File.text() — browsers reais sim.
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(csv),
    });
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText('Pagamento fornecedor'),
    ).toBeInTheDocument();
    expect(screen.getByText('Conciliação Bancária')).toBeInTheDocument();
  });
});
