import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NotificacoesBell from './NotificacoesBell';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stub(notificacoes: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/notificacoes')) return jsonResponse({ notificacoes });
      return jsonResponse({});
    }),
  );
}

function renderBell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<NotificacoesBell />, { wrapper: Wrapper });
}

afterEach(() => vi.unstubAllGlobals());

describe('NotificacoesBell', () => {
  it('renderiza sem badge quando todas as notificações estão lidas', async () => {
    stub([
      {
        id: 'n1',
        destinatario: 'rh',
        tipo: 'recrutamento.nova_solicitacao',
        titulo: 'Antiga',
        lida: true,
        createdAt: '2026-05-20T10:00:00Z',
      },
    ]);
    const { container } = renderBell();
    await waitFor(() => {
      // Badge é o <span> com background vermelho — quando 0 não aparece.
      const badges = container.querySelectorAll('span');
      const temBadge = Array.from(badges).some((s) =>
        (s.getAttribute('style') ?? '').includes('rgb(220, 38, 38)') ||
        (s.getAttribute('style') ?? '').includes('#DC2626'),
      );
      expect(temBadge).toBe(false);
    });
  });

  it('mostra badge com contagem de não-lidas', async () => {
    stub([
      {
        id: 'n1', destinatario: 'rh', tipo: 'x', titulo: 'Nova',
        lida: false, createdAt: '2026-05-20T10:00:00Z',
      },
      {
        id: 'n2', destinatario: 'rh', tipo: 'x', titulo: 'Outra',
        lida: false, createdAt: '2026-05-20T11:00:00Z',
      },
      {
        id: 'n3', destinatario: 'rh', tipo: 'x', titulo: 'Antiga',
        lida: true, createdAt: '2026-05-20T09:00:00Z',
      },
    ]);
    renderBell();
    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  it('99+ quando passa de 99', async () => {
    const muitas = Array.from({ length: 105 }, (_, i) => ({
      id: `n${i}`, destinatario: 'rh', tipo: 'x', titulo: `Notif ${i}`,
      lida: false, createdAt: '2026-05-20T10:00:00Z',
    }));
    stub(muitas);
    renderBell();
    expect(await screen.findByText('99+')).toBeInTheDocument();
  });

  it('click no botão abre dropdown com lista', async () => {
    stub([
      {
        id: 'n1', destinatario: 'rh', tipo: 'x', titulo: 'Nova solicitação',
        mensagem: '3× Pedreiro', lida: false, createdAt: '2026-05-20T10:00:00Z',
      },
    ]);
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notificações' }));
    expect(await screen.findByText('Nova solicitação')).toBeInTheDocument();
    expect(screen.getByText('3× Pedreiro')).toBeInTheDocument();
  });
});
