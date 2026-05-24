import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import Obras from './Obras';

// O MapView usa Leaflet (API imperativa, depende de layout real) — mockado
// nos testes para isolar a lógica de filtro/lista da view.
vi.mock('../../components/ui/MapView', () => ({
  default: () => <div data-testid="map-view" />,
}));

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      if (String(input).includes('/api/contracts')) {
        return jsonResponse({
          contracts: [
            {
              id: 'k1',
              name: 'Obra Centro',
              client: 'Prefeitura',
              status: 'ativo',
              value: 200000,
              lat: -23.5,
              lng: -46.6,
            },
            {
              id: 'k2',
              name: 'Obra Norte',
              client: 'Mineradora XYZ',
              status: 'pausado',
              value: 80000,
              lat: -19.9,
              lng: -43.9,
            },
            { id: 'k3', name: 'Sem mapa', client: 'Beta', status: 'ativo' },
          ],
          saidas: [],
        });
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    }),
  );
}

function renderObras() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return render(<Obras />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Obras (view migrada)', () => {
  it('lista apenas contratos com coordenadas', async () => {
    stubApi();
    renderObras();
    expect(await screen.findByText('Obra Centro')).toBeInTheDocument();
    expect(screen.getByText('Obra Norte')).toBeInTheDocument();
    expect(screen.queryByText('Sem mapa')).not.toBeInTheDocument();
  });

  it('filtra a lista por status', async () => {
    stubApi();
    renderObras();
    await screen.findByText('Obra Centro');
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'pausado' },
    });
    expect(screen.queryByText('Obra Centro')).not.toBeInTheDocument();
    expect(screen.getByText('Obra Norte')).toBeInTheDocument();
  });
});
