import type { ComponentType } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Shell from './components/layout/Shell';
import AuthGate from './features/auth/AuthGate';
import { installMoneyMaskSubscription } from './lib/moneyMask';

// CRÍTICO: garante que formatBRL/formatBRLk respeitam a permissão
// `special:nao-ver-valores` do perfil ativo. DEVE rodar antes de qualquer
// render que mostre valores monetários.
installMoneyMaskSubscription();
import Placeholder from './pages/Placeholder';
import NotFound from './pages/NotFound';
import { ROUTES } from './routes/config';
import Usuarios from './features/users/Usuarios';
import Socios from './features/socios/Socios';
import Fornecedores from './features/fornecedores/Fornecedores';
import Clientes from './features/clientes/Clientes';
import Base from './features/base/Base';
import Obras from './features/obras/Obras';
import CobrancaMensal from './features/cobranca/CobrancaMensal';
import Investimentos from './features/investimentos/Investimentos';
import FolhaPagamento from './features/folha/FolhaPagamento';
import ContasPagar from './features/contas-pagar/ContasPagar';
import NotasFiscais from './features/notas-fiscais/NotasFiscais';
import Caixa from './features/caixa/Caixa';
import Conciliacao from './features/conciliacao/Conciliacao';
import Propostas from './features/propostas/Propostas';
import PropostaDetail from './features/propostas/PropostaDetail';
import Clausulas from './features/clausulas/Clausulas';
import RDOs from './features/rdos/RDOs';
import ManutencaoView from './features/manutencao/Manutencao';
import Auditoria from './features/audit/Auditoria';
import Frota from './features/frota/Frota';
import Documentos from './features/documentos/Documentos';
import SolicitacoesCompra from './features/solicitacoes/SolicitacoesCompra';
import Estoque from './features/estoque/Estoque';
import Recursos from './features/recursos/Recursos';
import Recrutamento from './features/recrutamento/Recrutamento';
import Contratos from './features/contracts/Contratos';
import ContratoDetail from './features/contracts/ContratoDetail';
import AiChat from './features/aichat/AiChat';
import Previsao from './features/previsao/Previsao';
import Comparativo from './features/comparativo/Comparativo';
import Apresentacao from './features/apresentacao/Apresentacao';
import Portal from './features/portal/Portal';
import Relatorio from './features/relatorio/Relatorio';
import Manual from './features/manual/Manual';
import Configuracao from './features/configuracao/Configuracao';
import Dashboard from './features/dashboard/Dashboard';
import DashboardCorp from './features/dashboard-corp/DashboardCorp';

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
  '/dashboard-corp': DashboardCorp,
};

/** Tabela de rotas da aplicação. */
export default function App() {
  return (
    <Routes>
      {/* Portal do cliente é público — não passa pelo AuthGate (tem login próprio). */}
      <Route path="/portal" element={<Portal />} />
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
              element={Migrated ? <Migrated /> : <Placeholder route={route} />}
            />
          );
        })}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
