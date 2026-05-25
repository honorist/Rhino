import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthGate from './AuthGate';
import { usePerfilStore } from './perfilStore';
import type { NivelAcesso } from './types';

const NIVEL: NivelAcesso = {
  id: 'gerente',
  label: 'Gerente',
  icon: '👔',
  cor: '#7C3AED',
  abas: [],
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

function stub(routes: Record<string, () => Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const key = Object.keys(routes).find((k) => url.includes(k));
      if (key) return Promise.resolve(routes[key]());
      return Promise.resolve(new Response('{}', { status: 200 }));
    }),
  );
}

function renderGate() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <QueryClientProvider client={qc}>
          <AuthGate>
            <div>conteudo-protegido</div>
          </AuthGate>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  usePerfilStore.getState().clear();
});

describe('AuthGate', () => {
  it('mostra Login quando /api/auth/me devolve 401', async () => {
    stub({
      '/api/auth/me': () => jsonResponse({ error: 'Não autenticado' }, 401),
    });
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Acessar o Rhino' })).toBeInTheDocument();
    expect(screen.queryByText('conteudo-protegido')).toBeNull();
  });

  it('mostra LgpdModal quando user sem acceptedTermsAt', async () => {
    stub({
      '/api/auth/me': () =>
        jsonResponse({
          user: { id: 'u1', email: 'x@y.z', acceptedTermsAt: null },
        }),
      '/api/niveis-acesso': () => jsonResponse({ niveis: [NIVEL] }),
    });
    renderGate();
    expect(
      await screen.findByRole('dialog', { name: /termos de uso/i }),
    ).toBeInTheDocument();
  });

  it('mostra ProfilePicker quando user pronto mas sem perfil', async () => {
    stub({
      '/api/auth/me': () =>
        jsonResponse({
          user: {
            id: 'u1',
            email: 'x@y.z',
            acceptedTermsAt: '2025-01-01T00:00:00Z',
            nivelAcessoId: null,
          },
        }),
      '/api/niveis-acesso': () => jsonResponse({ niveis: [NIVEL] }),
    });
    renderGate();
    expect(
      await screen.findByRole('heading', { name: 'Selecione seu perfil' }),
    ).toBeInTheDocument();
  });

  it('libera o conteúdo protegido quando user + termos + perfil', async () => {
    usePerfilStore.getState().set(NIVEL);
    stub({
      '/api/auth/me': () =>
        jsonResponse({
          user: {
            id: 'u1',
            email: 'x@y.z',
            acceptedTermsAt: '2025-01-01T00:00:00Z',
          },
        }),
      '/api/niveis-acesso': () => jsonResponse({ niveis: [NIVEL] }),
    });
    renderGate();
    await waitFor(() => {
      expect(screen.getByText('conteudo-protegido')).toBeInTheDocument();
    });
  });
});
