import type { LucideIcon } from 'lucide-react';
import {
  Home,
  FileText,
  Briefcase,
  Settings,
  ClipboardCheck,
  MapPin,
  Package,
  ShoppingCart,
  Wrench,
  Truck,
  Users,
  UserPlus,
  CreditCard,
  Wallet,
  MinusCircle,
  ArrowLeftRight,
  Receipt,
  PlusCircle,
  Database,
  TrendingUp,
  MessageSquare,
  HardHat,
  DollarSign,
} from 'lucide-react';

/** Grupos colapsáveis do menu lateral. */
export type NavGroupId = 'obras' | 'rh' | 'financeiro';

export interface NavGroup {
  id: NavGroupId;
  label: string;
  icon: LucideIcon;
}

export interface RouteDef {
  /** Caminho path-based (sem hash). */
  path: string;
  /** Título da página — sempre presente. */
  title: string;
  /** Rótulo no menu lateral. Ausente = rota contextual, fora do menu. */
  label?: string;
  /** Ícone no menu lateral. */
  icon?: LucideIcon;
  /** Grupo do menu ao qual a rota pertence. */
  group?: NavGroupId;
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'obras', label: 'Obras', icon: HardHat },
  { id: 'rh', label: 'Recursos Humanos', icon: Users },
  { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
];

/**
 * Tabela única de rotas — consumida pelo router (App.tsx) e pelo menu (Sidebar).
 * Espelha o `routes` + `_lazyManifest` do app vanilla (js/app.js).
 */
export const ROUTES: RouteDef[] = [
  // ── Topo (sem grupo) ──
  { path: '/dashboard', title: 'Dashboard', label: 'Dashboard', icon: Home },
  { path: '/proposta', title: 'Propostas', label: 'Propostas', icon: FileText },
  { path: '/contratos', title: 'Contratos', label: 'Contratos', icon: Briefcase },
  { path: '/configuracao', title: 'Configuração', label: 'Configuração', icon: Settings },

  // ── Grupo: Obras ──
  { path: '/rdos', title: 'RDOs', label: 'RDOs', icon: ClipboardCheck, group: 'obras' },
  { path: '/obras', title: 'Mapa de Obras', label: 'Mapa de Obras', icon: MapPin, group: 'obras' },
  { path: '/estoque', title: 'Almoxarifado', label: 'Almoxarifado', icon: Package, group: 'obras' },
  { path: '/solicitacoes-compra', title: 'Solicitações de Compra', label: 'Solicitações de Compra', icon: ShoppingCart, group: 'obras' },
  { path: '/manutencao', title: 'Manutenção', label: 'Manutenção', icon: Wrench, group: 'obras' },
  { path: '/frota', title: 'Frota', label: 'Frota', icon: Truck, group: 'obras' },

  // ── Grupo: Recursos Humanos ──
  { path: '/clientes', title: 'Clientes', label: 'Clientes', icon: Users, group: 'rh' },
  { path: '/recursos', title: 'Recursos', label: 'Recursos', icon: UserPlus, group: 'rh' },
  { path: '/recrutamento', title: 'Recrutamento', label: 'Recrutamento', icon: UserPlus, group: 'rh' },
  { path: '/folha-pagamento', title: 'Folha de Pagamento', label: 'Folha de Pagamento', icon: CreditCard, group: 'rh' },
  { path: '/documentos', title: 'Documentação', label: 'Documentação', icon: FileText, group: 'rh' },
  { path: '/fornecedores', title: 'Fornecedores', label: 'Fornecedores', icon: Truck, group: 'rh' },

  // ── Grupo: Financeiro ──
  { path: '/caixa', title: 'Caixa', label: 'Caixa', icon: Wallet, group: 'financeiro' },
  { path: '/contas-pagar', title: 'Contas a Pagar', label: 'Contas a Pagar', icon: MinusCircle, group: 'financeiro' },
  { path: '/conciliacao', title: 'Conciliação', label: 'Conciliação', icon: ArrowLeftRight, group: 'financeiro' },
  { path: '/notas-fiscais', title: 'Contas a Receber', label: 'Contas a Receber', icon: Receipt, group: 'financeiro' },
  { path: '/socios', title: 'Sócios', label: 'Sócios', icon: Users, group: 'financeiro' },
  { path: '/investimentos', title: 'Aportes', label: 'Aportes', icon: PlusCircle, group: 'financeiro' },
  { path: '/base', title: 'BASE', label: 'BASE', icon: Database, group: 'financeiro' },
  { path: '/previsao', title: 'Previsão', label: 'Previsão', icon: TrendingUp, group: 'financeiro' },
  { path: '/ai-chat', title: 'Assistente IA', label: 'Assistente IA', icon: MessageSquare, group: 'financeiro' },

  // ── Contextuais (acessadas por navegação, sem item no menu) ──
  { path: '/proposta/:id', title: 'Detalhe da Proposta' },
  { path: '/clausulas', title: 'Cláusulas' },
  { path: '/apresentacao', title: 'Apresentação' },
  { path: '/contratos/:id', title: 'Detalhe do Contrato' },
  { path: '/comparativo', title: 'Comparativo' },
  { path: '/cobranca', title: 'Cobrança Mensal' },
  { path: '/usuarios', title: 'Usuários' },
  { path: '/auditoria', title: 'Auditoria' },
  { path: '/manual', title: 'Manual' },
  { path: '/portal', title: 'Portal do Cliente' },
  { path: '/relatorios', title: 'Relatórios' },
];

/** Rotas de cada grupo, pré-computadas (na ordem de ROUTES). */
export const GROUP_ROUTES: Record<NavGroupId, RouteDef[]> = {
  obras: ROUTES.filter((r) => r.group === 'obras'),
  rh: ROUTES.filter((r) => r.group === 'rh'),
  financeiro: ROUTES.filter((r) => r.group === 'financeiro'),
};
