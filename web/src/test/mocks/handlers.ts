import { http, HttpResponse } from 'msw';

/**
 * Handlers default do MSW para os testes. Cobrem o "happy path" das rotas
 * mais usadas — testes específicos sobrescrevem via `server.use(...)`
 * dentro do próprio teste para cenários de erro/edge.
 *
 * Mantemos `/api/me` e `/api/clientes` aqui porque são tocados pelo bootstrap
 * de várias features (AuthGate, Sidebar, Dashboard).
 */
export const handlers = [
  http.get('/api/me', () =>
    HttpResponse.json({
      id: 'test-user',
      nome: 'Test User',
      email: 'test@example.com',
      perfil: 'admin',
      permissoes: ['*'],
    }),
  ),

  http.get('/api/clientes', () => HttpResponse.json({ rows: [] })),

  http.get('/api/contratos', () => HttpResponse.json({ rows: [] })),

  http.get('/api/dashboard/kpis', () =>
    HttpResponse.json({
      receita_mensal: 0,
      contratos_ativos: 0,
      obras_andamento: 0,
      pagamentos_atrasados: 0,
    }),
  ),
];
