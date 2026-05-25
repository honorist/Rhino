// Setup global do Vitest — matchers do jest-dom (toBeInTheDocument, etc.)
// e MSW para interceptar fetch em nível de rede.
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

// `onUnhandledRequest: 'bypass'` deixa requests sem handler passarem direto
// para o fetch real (que vai falhar no jsdom). Mude para 'error' quando
// todos os testes estiverem migrados para MSW para detectar mocks faltando.
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));

// Reseta handlers entre testes para evitar vazamento de `server.use(...)`.
afterEach(() => server.resetHandlers());

afterAll(() => server.close());
