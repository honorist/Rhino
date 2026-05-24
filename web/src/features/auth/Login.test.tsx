import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import Login from './Login';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

function setup(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onPortal = vi.fn();
  const utils = render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <Login onPortalClick={onPortal} />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...utils, onPortal };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Login — modo padrão', () => {
  it('renderiza form com email, senha e botão Entrar', () => {
    setup(vi.fn(() => Promise.resolve(jsonResponse({}))) as unknown as typeof fetch);
    expect(screen.getByRole('heading', { name: 'Acessar o Rhino' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('toggle do olho alterna type do input de senha', () => {
    setup(vi.fn(() => Promise.resolve(jsonResponse({}))) as unknown as typeof fetch);
    const senha = screen.getByLabelText('Senha') as HTMLInputElement;
    expect(senha.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: /Mostrar senha/i }));
    expect(senha.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: /Ocultar senha/i }));
    expect(senha.type).toBe('password');
  });

  it('submit chama /api/auth/login com email+password', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/login')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return Promise.resolve(
          jsonResponse({ user: { id: '1', email: body.email, acceptedTermsAt: null } }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    setup(fetchMock as unknown as typeof fetch);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'pwd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      const loginCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/auth/login'),
      );
      expect(loginCall).toBeDefined();
      expect(JSON.parse(String((loginCall![1] as RequestInit).body))).toEqual({
        email: 'a@b.c',
        password: 'pwd',
      });
    });
  });

  it('exibe erro quando o login falha', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/login')) {
        return Promise.resolve(jsonResponse({ error: 'Credenciais inválidas' }, 401));
      }
      return Promise.resolve(jsonResponse({}));
    });
    setup(fetchMock as unknown as typeof fetch);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciais inválidas');
  });

  it('clique em "Área do Cliente" chama onPortalClick', () => {
    const { onPortal } = setup(
      vi.fn(() => Promise.resolve(jsonResponse({}))) as unknown as typeof fetch,
    );
    fireEvent.click(screen.getByRole('link', { name: /Área do Cliente/i }));
    expect(onPortal).toHaveBeenCalledTimes(1);
  });
});

describe('Login — modo "esqueci minha senha"', () => {
  it('alternar para forgot exibe o form correspondente', () => {
    setup(vi.fn(() => Promise.resolve(jsonResponse({}))) as unknown as typeof fetch);
    fireEvent.click(screen.getByRole('link', { name: /Esqueci minha senha/i }));
    expect(
      screen.getByRole('heading', { name: 'Esqueci minha senha' }),
    ).toBeInTheDocument();
  });

  it('submit chama /api/auth/forgot-password e mostra mensagem', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/forgot-password')) {
        return Promise.resolve(jsonResponse({ message: 'Email enviado!' }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    setup(fetchMock as unknown as typeof fetch);

    fireEvent.click(screen.getByRole('link', { name: /Esqueci minha senha/i }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'a@b.c' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Email enviado!');
  });

  it('voltar ao login restaura o form principal', () => {
    setup(vi.fn(() => Promise.resolve(jsonResponse({}))) as unknown as typeof fetch);
    fireEvent.click(screen.getByRole('link', { name: /Esqueci minha senha/i }));
    fireEvent.click(screen.getByRole('link', { name: /voltar ao login/i }));
    expect(screen.getByRole('heading', { name: 'Acessar o Rhino' })).toBeInTheDocument();
  });
});
