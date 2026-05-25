import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Configuracao from './Configuracao';

function jsonResponse(data: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (url.includes('/api/tipos-base')) return jsonResponse({ tiposBase: [] });
      if (url.includes('/api/base')) return jsonResponse({ base: [] });
      if (url.includes('/api/doc-templates')) return jsonResponse({ templates: [] });
      if (url.includes('/api/niveis-acesso')) return jsonResponse({ niveis: [] });
      if (url.includes('/api/arquivos')) return jsonResponse({ arquivos: [] });
      if (url.includes('/api/backup/list')) return jsonResponse({ backups: [] });
      if (url.includes('/api/feature-flags')) return jsonResponse({ flags: [] });
      if (url.includes('/api/changelog') || url.includes('/changelog'))
        return jsonResponse({ entries: [] });
      return jsonResponse({});
    }),
  );
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
          <Configuracao />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Configuracao (view migrada)', () => {
  it('mostra a seção Tipos de Custo por padrão', async () => {
    stubApi();
    renderView();
    expect(
      await screen.findByRole('heading', { name: /Tipos de Custo/ }),
    ).toBeInTheDocument();
  });

  it('alterna a seção ao clicar no menu', async () => {
    stubApi();
    renderView();
    fireEvent.click(screen.getByText('Templates de Docs'));
    expect(
      await screen.findByRole('heading', { name: /Templates de Documentos/ }),
    ).toBeInTheDocument();
  });
});
