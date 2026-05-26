import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Shell from './components/layout/Shell';
import AuthGate from './features/auth/AuthGate';
import { installMoneyMaskSubscription } from './lib/moneyMask';
import Spinner from './components/ui/spinner';
import FeatureErrorBoundary from './components/FeatureErrorBoundary';

// CRÍTICO: garante que formatBRL/formatBRLk respeitam a permissão
// `special:nao-ver-valores` do perfil ativo. DEVE rodar antes de qualquer
// render que mostre valores monetários.
installMoneyMaskSubscription();
import Placeholder from './pages/Placeholder';
import NotFound from './pages/NotFound';
import { ROUTES } from './routes/config';

/**
 * Todas as features são lazy-loaded para reduzir o initial bundle.
 * Cada chunk só é baixado quando a rota é visitada. Vite gera um arquivo
 * por feature sob `dist/assets/`, o que também melhora cache hit em
 * deploys parciais (mudar uma feature não invalida as outras).
 */
const Usuarios = lazy(() => import('./features/users/Usuarios'));
const Socios = lazy(() => import('./features/socios/Socios'));
const Fornecedores = lazy(() => import('./features/fornecedores/Fornecedores'));
const Clientes = lazy(() => import('./features/clientes/Clientes'));
const Base = lazy(() => import('./features/base/Base'));
const Obras = lazy(() => import('./features/obras/Obras'));
const CobrancaMensal = lazy(() => import('./features/cobranca/CobrancaMensal'));
const Investimentos = lazy(() => import('./features/investimentos/Investimentos'));
const FolhaPagamento = lazy(() => import('./features/folha/FolhaPagamento'));
const ContasPagar = lazy(() => import('./features/contas-pagar/ContasPagar'));
const NotasFiscais = lazy(() => import('./features/notas-fiscais/NotasFiscais'));
const Caixa = lazy(() => import('./features/caixa/Caixa'));
const Conciliacao = lazy(() => import('./features/conciliacao/Conciliacao'));
const Propostas = lazy(() => import('./features/propostas/Propostas'));
const PropostaDetail = lazy(() => import('./features/propostas/PropostaDetail'));
const Clausulas = lazy(() => import('./features/clausulas/Clausulas'));
const RDOs = lazy(() => import('./features/rdos/RDOs'));
const ManutencaoView = lazy(() => import('./features/manutencao/Manutencao'));
const Auditoria = lazy(() => import('./features/audit/Auditoria'));
const Frota = lazy(() => import('./features/frota/Frota'));
const Documentos = lazy(() => import('./features/documentos/Documentos'));
const SolicitacoesCompra = lazy(() => import('./features/solicitacoes/SolicitacoesCompra'));
const Estoque = lazy(() => import('./features/estoque/Estoque'));
const Recursos = lazy(() => import('./features/recursos/Recursos'));
const Recrutamento = lazy(() => import('./features/recrutamento/Recrutamento'));
const Contratos = lazy(() => import('./features/contracts/Contratos'));
const ContratoDetail = lazy(() => import('./features/contracts/ContratoDetail'));
const AiChat = lazy(() => import('./features/aichat/AiChat'));
const Previsao = lazy(() => import('./features/previsao/Previsao'));
const Comparativo = lazy(() => import('./features/comparativo/Comparativo'));
const Apresentacao = lazy(() => import('./features/apresentacao/Apresentacao'));
const Portal = lazy(() => import('./features/portal/Portal'));
const Relatorio = lazy(() => import('./features/relatorio/Relatorio'));
const Manual = lazy(() => import('./features/manual/Manual'));
const Configuracao = lazy(() => import('./features/configuracao/Configuracao'));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard'));

/**
 * Views já migradas para React (Fase 3). Rotas ausentes deste mapa ainda
 * renderizam <Placeholder>. Cada migração de view adiciona uma entrada aqui.
 */
const MIGRATED_PAGES: Partial<Record<string, ComponentType>> = {
  '/usuarios': Usuarios,
  '/socios': Socios,
  '/fornecedores': Fornecedores,
  '/clientes': Clientes,
  '/base': Base,
  '/obras': Obras,
  '/cobranca': CobrancaMensal,
  '/investimentos': Investimentos,
  '/folha-pagamento': FolhaPagamento,
  '/contas-pagar': ContasPagar,
  '/notas-fiscais': NotasFiscais,
  '/caixa': Caixa,
  '/conciliacao': Conciliacao,
  '/proposta': Propostas,
  '/proposta/:id': PropostaDetail,
  '/clausulas': Clausulas,
  '/rdos': RDOs,
  '/manutencao': ManutencaoView,
  '/auditoria': Auditoria,
  '/frota': Frota,
  '/documentos': Documentos,
  '/solicitacoes-compra': SolicitacoesCompra,
  '/estoque': Estoque,
  '/recursos': Recursos,
  '/recrutamento': Recrutamento,
  '/contratos': Contratos,
  '/contratos/:id': ContratoDetail,
  '/ai-chat': AiChat,
  '/previsao': Previsao,
  '/comparativo': Comparativo,
  '/apresentacao': Apresentacao,
  '/portal': Portal,
  '/relatorios': Relatorio,
  '/manual': Manual,
  '/configuracao': Configuracao,
  '/dashboard': Dashboard,
};

/**
 * Fallback minimal durante o download do chunk lazy. Centralizado aqui para
 * trocar facilmente quando o design system (Fase 2) entrar.
 */
function RouteFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 1rem' }}>
      <Spinner />
    </div>
  );
}

/** Tabela de rotas da aplicação. */
export default function App() {
  return (
    <Routes>
      {/* Portal do cliente é público — não passa pelo AuthGate (tem login próprio). */}
      <Route
        path="/portal"
        element={
          <FeatureErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Portal />
            </Suspense>
          </FeatureErrorBoundary>
        }
      />
      {/* Restante do app passa pelo gate: login → LGPD → perfil → Shell. */}
      <Route
        path="*"
        element={
          <AuthGate>
            <AuthenticatedRoutes />
          </AuthGate>
        }
      />
    </Routes>
  );
}

/** Rotas internas (após autenticação) — antigas Routes envolvidas pelo Shell. */
function AuthenticatedRoutes() {
  const { pathname } = useLocation();
  // /portal já foi tratado acima; outras rotas conhecidas aqui.
  void pathname;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        {ROUTES.map((route) => {
          const Migrated = MIGRATED_PAGES[route.path];
          return (
            <Route
              key={route.path}
              path={route.path}
              element={
                <FeatureErrorBoundary>
                  <Suspense fallback={<RouteFallback />}>
                    {Migrated ? <Migrated /> : <Placeholder route={route} />}
                  </Suspense>
                </FeatureErrorBoundary>
              }
            />
          );
        })}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
