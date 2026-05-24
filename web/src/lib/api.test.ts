import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

function mockFetchOnce(response: Response): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('GET retorna o JSON parseado', async () => {
    mockFetchOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(api.get('/api/x')).resolves.toEqual({ ok: true });
  });

  it('lança ApiError em resposta não-ok', async () => {
    mockFetchOnce(new Response('erro do servidor', { status: 500 }));
    await expect(api.get('/api/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('marca status 401 como isUnauthorized', async () => {
    mockFetchOnce(new Response('', { status: 401 }));
    await expect(api.get('/api/x')).rejects.toMatchObject({
      status: 401,
      isUnauthorized: true,
    });
  });

  it('extrai a mensagem do campo "error" do corpo JSON', async () => {
    mockFetchOnce(
      new Response(JSON.stringify({ error: 'CPF inválido' }), { status: 400 }),
    );
    await expect(api.post('/api/x', { cpf: '123' })).rejects.toThrow('CPF inválido');
  });

  it('204 No Content resolve como undefined', async () => {
    mockFetchOnce(new Response(null, { status: 204 }));
    await expect(api.delete('/api/x')).resolves.toBeUndefined();
  });

  it('envia o corpo serializado em POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await api.post('/api/x', { nome: 'Ana' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ nome: 'Ana' }),
      }),
    );
  });
});
