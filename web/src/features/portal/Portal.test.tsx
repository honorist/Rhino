import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Portal from './Portal';

function jsonResponse(data: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(data), { status }));
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Portal (view migrada)', () => {
  it('mostra o formulário de login quando não há sessão', () => {
    render(<Portal />);
    expect(screen.getByText('Área do Cliente')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Entrar' }),
    ).toBeInTheDocument();
  });

  it('carrega o dashboard quando há sessão salva', async () => {
    sessionStorage.setItem(
      'rhino-portal-cliente',
      JSON.stringify({ id: 'c1', nome: 'Cliente X' }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) => {
        const url = String(input);
        if (url.includes('/api/portal/dashboard')) {
          return jsonResponse({
            cliente: { id: 'c1', nome: 'Cliente X' },
            contratos: [
              {
                id: 'k1',
                name: 'Obra Alfa',
                status: 'ativo',
                value: 100_000,
                progresso: 40,
              },
            ],
            nfs: [],
          });
        }
        if (url.includes('/api/portal/propostas')) {
          return jsonResponse({ propostas: [] });
        }
        return jsonResponse({}, 404);
      }),
    );
    render(<Portal />);
    expect(await screen.findByText('Meus Contratos')).toBeInTheDocument();
    expect(screen.getByText('Obra Alfa')).toBeInTheDocument();
  });
});
