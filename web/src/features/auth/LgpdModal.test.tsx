import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ToastProvider from '../../components/ui/toast/ToastProvider';
import LgpdModal from './LgpdModal';

const reloadSpy = vi.fn();
// jsdom não tem location.reload — stub no global.
Object.defineProperty(window, 'location', {
  configurable: true,
  value: { ...window.location, reload: reloadSpy },
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

function setup(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <LgpdModal />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  reloadSpy.mockClear();
});

describe('LgpdModal', () => {
  it('renderiza dialog com título e ambos os botões', () => {
    setup(vi.fn(() => Promise.resolve(jsonResponse({}))) as unknown as typeof fetch);
    expect(
      screen.getByRole('dialog', { name: /termos de uso/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aceito$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Não aceito/i })).toBeInTheDocument();
  });

  it('clique em "Aceito" chama /api/auth/accept-terms', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => Promise.resolve(jsonResponse({ ok: true })),
    );
    setup(fetchMock as unknown as typeof fetch);
    fireEvent.click(screen.getByRole('button', { name: /Aceito$/ }));
    await waitFor(() => {
      const called = fetchMock.mock.calls.some((c) =>
        String(c[0]).includes('/api/auth/accept-terms'),
      );
      expect(called).toBe(true);
    });
  });

  it('clique em "Não aceito" chama /api/auth/logout e reload', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => Promise.resolve(jsonResponse({ ok: true })),
    );
    setup(fetchMock as unknown as typeof fetch);
    fireEvent.click(screen.getByRole('button', { name: /Não aceito/i }));
    await waitFor(() => {
      const called = fetchMock.mock.calls.some((c) =>
        String(c[0]).includes('/api/auth/logout'),
      );
      expect(called).toBe(true);
      expect(reloadSpy).toHaveBeenCalled();
    });
  });
});
