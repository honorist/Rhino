import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Usuarios from './Usuarios';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

/** Mock de fetch roteado por URL — users, níveis e usuário logado. */
function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return jsonResponse({ user: { id: 'me', email: 'eu@rhino.com' } });
      }
      if (url.includes('/api/niveis-acesso')) {
        return jsonResponse({
          niveis: [{ id: 'n1', label: 'Admin', icon: '🛡', cor: '#55588B' }],
        });
      }
      if (url.includes('/api/users')) {
        return jsonResponse({
          users: [
            {
              id: 'u1',
              email: 'ana@rhino.com',
              name: 'Ana',
              nivelAcessoId: 'n1',
              isActive: true,
            },
          ],
        });
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    }),
  );
}

function renderUsuarios() {
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
  return render(<Usuarios />, { wrapper: Wrapper });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Usuarios (view migrada)', () => {
  it('renderiza o cabeçalho da página', () => {
    stubApi();
    renderUsuarios();
    expect(
      screen.getByRole('heading', { name: 'Usuários e Acessos' }),
    ).toBeInTheDocument();
  });

  it('lista os usuários vindos da API', async () => {
    stubApi();
    renderUsuarios();
    expect(await screen.findByText('ana@rhino.com')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });

  it('resolve e exibe o nível de acesso do usuário', async () => {
    stubApi();
    renderUsuarios();
    await screen.findByText('ana@rhino.com');
    expect(screen.getByText(/Admin/)).toBeInTheDocument();
  });

  it('abre o modal de novo usuário ao clicar no botão', async () => {
    stubApi();
    renderUsuarios();
    await screen.findByText('ana@rhino.com');
    fireEvent.click(screen.getByRole('button', { name: '+ Novo Usuário' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Novo Usuário')).toBeInTheDocument();
  });
});
