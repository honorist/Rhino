import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createResource } from './createResource';

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Item {
  id: string;
  nome: string;
}

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    ),
  );
}

describe('createResource', () => {
  it('useList desembrulha o envelope configurado', async () => {
    stubFetch({ socios: [{ id: '1', nome: 'Ana' }] });
    const { useList } = createResource<Item>({
      key: ['socios'],
      path: '/api/socios',
      envelope: 'socios',
    });

    const { result } = renderHook(() => useList(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: '1', nome: 'Ana' }]);
  });

  it('useList devolve [] quando o envelope está ausente', async () => {
    stubFetch({});
    const { useList } = createResource<Item>({
      key: ['socios'],
      path: '/api/socios',
      envelope: 'socios',
    });

    const { result } = renderHook(() => useList(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
