import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePerfilStore } from './perfilStore';
import ProfilePicker from './ProfilePicker';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

function setup(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ProfilePicker />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  usePerfilStore.getState().clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  usePerfilStore.getState().clear();
});

describe('ProfilePicker', () => {
  it('renderiza os níveis vindos de /api/niveis-acesso', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          niveis: [
            { id: 'gerente', label: 'Gerente', icon: '👔', cor: '#7C3AED', abas: [] },
            { id: 'admin', label: 'Admin', icon: '🛡️', cor: '#0F766E', abas: [] },
          ],
        }),
      ),
    );
    setup(fetchMock as unknown as typeof fetch);

    expect(await screen.findByText('Gerente')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('clique em um card seta o perfil no store', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          niveis: [
            { id: 'gerente', label: 'Gerente', icon: '👔', cor: '#7C3AED', abas: ['#/x'] },
          ],
        }),
      ),
    );
    setup(fetchMock as unknown as typeof fetch);
    const card = await screen.findByText('Gerente');
    fireEvent.click(card);
    await waitFor(() => {
      expect(usePerfilStore.getState().current?.id).toBe('gerente');
    });
  });

  it('mostra erro quando a API falha', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({}, 500)));
    setup(fetchMock as unknown as typeof fetch);
    expect(await screen.findByRole('alert')).toHaveTextContent(/níveis de acesso/i);
  });
});
