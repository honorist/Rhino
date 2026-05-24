import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearQueue,
  enqueueRequest,
  isApiMutation,
  loadQueue,
  saveQueue,
  syncQueue,
} from './offlineQueue';

beforeEach(() => {
  localStorage.clear();
});

describe('loadQueue / saveQueue', () => {
  it('vazia quando sem nada', () => {
    expect(loadQueue()).toEqual([]);
  });

  it('persiste e recupera array', () => {
    saveQueue([{ method: 'POST', url: '/api/x', body: { a: 1 }, ts: 1 }]);
    const q = loadQueue();
    expect(q).toHaveLength(1);
    expect(q[0].method).toBe('POST');
  });

  it('retorna [] quando o JSON está corrompido', () => {
    localStorage.setItem('rhino-offline-queue', '{not json');
    expect(loadQueue()).toEqual([]);
  });
});

describe('enqueueRequest', () => {
  it('acrescenta ao final preservando ordem', () => {
    enqueueRequest('POST', '/api/a', { v: 1 });
    enqueueRequest('PUT', '/api/b', { v: 2 });
    const q = loadQueue();
    expect(q.map((r) => r.url)).toEqual(['/api/a', '/api/b']);
  });
});

describe('clearQueue', () => {
  it('zera a fila', () => {
    enqueueRequest('POST', '/api/x', null);
    clearQueue();
    expect(loadQueue()).toEqual([]);
  });
});

describe('isApiMutation', () => {
  it('reconhece POST/PUT/DELETE/PATCH em /api/', () => {
    expect(isApiMutation('post', '/api/x')).toBe(true);
    expect(isApiMutation('PUT', '/api/x')).toBe(true);
    expect(isApiMutation('delete', '/api/x')).toBe(true);
    expect(isApiMutation('PATCH', '/api/x')).toBe(true);
  });

  it('rejeita GET, OPTIONS e rotas fora de /api/', () => {
    expect(isApiMutation('GET', '/api/x')).toBe(false);
    expect(isApiMutation('POST', '/outra/coisa')).toBe(false);
    expect(isApiMutation('OPTIONS', '/api/x')).toBe(false);
  });
});

describe('syncQueue', () => {
  it('mantém itens que falharam e remove os que tiveram 2xx', async () => {
    enqueueRequest('POST', '/api/ok', { v: 1 });
    enqueueRequest('POST', '/api/fail', { v: 2 });

    const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = typeof url === 'string' ? url : url.toString();
      return new Response('', { status: u.includes('/api/ok') ? 200 : 500 });
    });

    const { sent, failed } = await syncQueue(fakeFetch as unknown as typeof fetch);
    expect(sent).toBe(1);
    expect(failed).toBe(1);
    expect(loadQueue().map((r) => r.url)).toEqual(['/api/fail']);
  });

  it('rejeições de rede contam como failed e voltam para a fila', async () => {
    enqueueRequest('POST', '/api/x', null);
    const fakeFetch = vi.fn(async () => {
      throw new Error('rede caiu');
    });
    const { sent, failed } = await syncQueue(fakeFetch as unknown as typeof fetch);
    expect(sent).toBe(0);
    expect(failed).toBe(1);
    expect(loadQueue()).toHaveLength(1);
  });

  it('com fila vazia retorna 0/0 e não chama fetch', async () => {
    const fakeFetch = vi.fn();
    const r = await syncQueue(fakeFetch as unknown as typeof fetch);
    expect(r).toEqual({ sent: 0, failed: 0 });
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});
