/**
 * Fila de mutações pendentes durante o modo offline.
 * Porte da parte de fila do js/offline.js — sem DOM, testável.
 */

export interface QueuedRequest {
  method: string;
  url: string;
  body: unknown;
  ts: number;
}

const QUEUE_KEY = 'rhino-offline-queue';

export function loadQueue(): QueuedRequest[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedRequest[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(q: readonly QueuedRequest[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* quota ou modo privado */
  }
}

export function enqueueRequest(method: string, url: string, body: unknown): void {
  const q = loadQueue();
  q.push({ method, url, body, ts: Date.now() });
  saveQueue(q);
}

export function clearQueue(): void {
  saveQueue([]);
}

/**
 * Tenta drenar a fila contra o backend.
 * Retorna { sent, failed } com a contagem de cada categoria.
 * Itens com sucesso somem da fila; falhas voltam para nova tentativa.
 */
export async function syncQueue(
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: number; failed: number }> {
  const q = loadQueue();
  if (q.length === 0) return { sent: 0, failed: 0 };
  const failed: QueuedRequest[] = [];
  let sent = 0;
  for (const item of q) {
    try {
      const res = await fetchImpl(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: item.body != null ? JSON.stringify(item.body) : undefined,
        credentials: 'same-origin',
      });
      if (res.ok) sent++;
      else failed.push(item);
    } catch {
      failed.push(item);
    }
  }
  saveQueue(failed);
  return { sent, failed: failed.length };
}

/**
 * Diz se uma requisição precisa de fila offline (mutação no /api/).
 */
export function isApiMutation(method: string, url: string): boolean {
  const m = method.toUpperCase();
  return url.startsWith('/api/') && (m === 'POST' || m === 'PUT' || m === 'DELETE' || m === 'PATCH');
}
