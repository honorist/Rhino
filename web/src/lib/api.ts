/**
 * Cliente HTTP tipado — substitui as chamadas `fetch` espalhadas no store.js.
 * Centraliza: credenciais de sessão, parsing de JSON, tratamento de erro e 401.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, message: string, url: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }

  /** Sessão expirada — o app deve redirecionar para o login. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const hasBody = body !== undefined;

  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // Tenta extrair { error } do corpo; cai para texto puro; cai para status.
    let message = `HTTP ${res.status}`;
    const raw = await res.text().catch(() => '');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        message = parsed.error ?? raw;
      } catch {
        message = raw;
      }
    }
    throw new ApiError(res.status, message, path);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown): Promise<T> => request<T>('PUT', path, body),
  delete: <T>(path: string): Promise<T> => request<T>('DELETE', path),
};
