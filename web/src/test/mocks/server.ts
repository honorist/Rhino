import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * Server MSW para testes Vitest (Node, não browser). Intercepta `fetch`
 * em nível de rede — substitui mocks ad-hoc de lib/api.ts espalhados pelos
 * testes. Cada teste pode adicionar handlers temporários via `server.use(...)`.
 */
export const server = setupServer(...handlers);
