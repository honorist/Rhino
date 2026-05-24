/**
 * Configuração declarativa dos passos do tour de onboarding.
 * Porte do array STEPS de js/onboarding.js — ajustado para rotas path-based.
 */

export interface TourStep {
  id: string;
  title: string;
  /** HTML em string — mantém compatibilidade com markup do antigo. */
  text: string;
  /** Rota para navegar antes de exibir o passo (path-based, ex.: '/dashboard'). */
  navigateTo?: string;
  /** Seletor do alvo. Fallback para '#app' se não encontrado em tempo de show. */
  element?: string;
  /** Lado do popover relativo ao alvo. */
  on?: 'top' | 'bottom' | 'left' | 'right';
}

export const TOUR_STORAGE_KEY = 'rhino-tour-v1';

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'boas-vindas',
    title: '👋 Bem-vindo ao Rhino!',
    text: 'Este tour mostra as principais telas em menos de 2 minutos.<br>Use <b>Próximo →</b> para avançar ou clique em ✕ para sair.',
    element: '#sidebar',
    on: 'right',
  },
  {
    id: 'dashboard',
    title: '📊 Dashboard',
    text: 'Visão geral do negócio: contratos ativos, saldo do caixa, notas a receber e alertas de prazo — tudo em um só lugar.',
    navigateTo: '/dashboard',
    element: '#app',
    on: 'right',
  },
  {
    id: 'contratos',
    title: '📁 Contratos',
    text: 'Cadastre e acompanhe cada obra. Para cada contrato você tem: orçamento, medições (BMs), aditivos, marcos, cronograma, equipe e RDOs.',
    navigateTo: '/contratos',
    element: '#app',
    on: 'right',
  },
  {
    id: 'caixa',
    title: '💰 Caixa',
    text: 'Controle todos os lançamentos: entradas de medições, saídas de contratos, pagamentos e aportes dos sócios. Saldo atualizado em tempo real.',
    navigateTo: '/caixa',
    element: '#app',
    on: 'right',
  },
  {
    id: 'contas-pagar',
    title: '📋 Contas a Pagar',
    text: 'Gerencie fornecedores e despesas. Ao pagar, o lançamento é automaticamente criado no Caixa — sem entrada dupla.',
    navigateTo: '/contas-pagar',
    element: '#app',
    on: 'right',
  },
  {
    id: 'notas-fiscais',
    title: '🧾 Notas Fiscais (BMs)',
    text: 'Cada saída de contrato gera uma NF (Boletim de Medição). Ao emitir, a entrada entra no Caixa automaticamente.',
    navigateTo: '/notas-fiscais',
    element: '#app',
    on: 'right',
  },
  {
    id: 'rdos',
    title: '📝 RDOs',
    text: 'Relatório Diário de Obra: registre equipe, equipamentos, atividades e fotos. Gera PDF assinado.',
    navigateTo: '/rdos',
    element: '#app',
    on: 'right',
  },
  {
    id: 'recursos',
    title: '👷 Recursos Humanos',
    text: 'Cadastre colaboradores: nome, função, CPF, contato. Eles aparecem no organograma dos contratos e nos RDOs.',
    navigateTo: '/recursos',
    element: '#app',
    on: 'right',
  },
  {
    id: 'atalhos',
    title: '⌨️ Atalhos úteis',
    text: `<ul style="margin:8px 0;padding-left:18px;line-height:2;">
      <li><kbd>Ctrl+K</kbd> — Busca global</li>
      <li><kbd>?</kbd> — Lista todos os atalhos</li>
      <li><kbd>t</kbd> — Alternar tema</li>
      <li><b>Configuração → Tour Guiado</b> — repetir este tour</li>
    </ul>`,
    navigateTo: '/dashboard',
    element: '#sidebar',
    on: 'right',
  },
] as const;

/** Persistência: deve disparar tour automaticamente? */
export function shouldAutoStart(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) == null;
  } catch {
    return false;
  }
}

/** Marca tour como visto (ao concluir ou cancelar). */
export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Permite re-disparar o tour manualmente (Configurações → Tour). */
export function resetTour(): void {
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
