import { afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from './components/ui/toast/ToastProvider';
import App from './App';
import { usePerfilStore } from './features/auth/perfilStore';
import type { NivelAcesso } from './features/auth/types';

const FAKE_USER = {
  id: 'admin',
  email: 'admin@rhino.local',
  name: 'Admin',
  nivelAcessoId: null,
  socioId: null,
  acceptedTermsAt: '2025-01-01T00:00:00Z',
};

const FAKE_NIVEL: NivelAcesso = {
  id: 'gerente',
  label: 'Gerente',
  icon: '👔',
  cor: '#7C3AED',
  // Inclui as rotas que os testes do Sidebar verificam (Dashboard, Propostas,
  // Contratos, Configuração). O filtro de Sidebar agora respeita `abas`.
  abas: ['#/dashboard', '#/proposta', '#/contratos', '#/configuracao'],
};

function jsonResponse(data: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status }));
}

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/auth/me')) return jsonResponse({ user: FAKE_USER });
      if (url.includes('/api/niveis-acesso')) return jsonResponse({ niveis: [FAKE_NIVEL] });
      // Dashboard / outros endpoints — envelope vazio.
      return jsonResponse({
        contracts: [],
        saidas: [],
        entries: [],
        notas_fiscais: [],
        contas: [],
        caixaBalance: 0,
        saldoProjetado: [],
      });
    }),
  );
}

function renderAt(path: string) {
  // Pré-aplica um perfil para passar pelo AuthGate sem ProfilePicker.
  usePerfilStore.getState().set(FAKE_NIVEL);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  usePerfilStore.getState().clear();
});

describe('App — shell e roteamento', () => {
  it('renderiza a sidebar com o menu principal', async () => {
    stubApi();
    renderAt('/dashboard');
    expect(
      await screen.findByRole('navigation', { name: 'Menu principal' }),
    ).toBeInTheDocument();
  });

  it('mostra o Dashboard migrado em /dashboard', async () => {
    stubApi();
    renderAt('/dashboard');
    expect(
      await screen.findByRole('heading', { name: /(Bom dia|Boa tarde|Boa noite)/i }),
    ).toBeInTheDocument();
  });

  it('redireciona a raiz "/" para /dashboard', async () => {
    stubApi();
    renderAt('/');
    expect(
      await screen.findByRole('heading', { name: /(Bom dia|Boa tarde|Boa noite)/i }),
    ).toBeInTheDocument();
  });

  it('renderiza NotFound em rota desconhecida', async () => {
    stubApi();
    renderAt('/rota-que-nao-existe');
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
  });

  it('expõe todos os links de menu de topo na sidebar', async () => {
    stubApi();
    renderAt('/dashboard');
    const nav = await screen.findByRole('navigation', { name: 'Menu principal' });
    await waitFor(() => {
      expect(nav).toHaveTextContent('Dashboard');
    });
    expect(nav).toHaveTextContent('Propostas');
    expect(nav).toHaveTextContent('Contratos');
    expect(nav).toHaveTextContent('Configuração');
  });
});
