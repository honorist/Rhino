import { create } from 'zustand';
import type { NivelAcesso } from './types';

/**
 * Perfil de acesso ativo na sessão. Porte do objeto `perfil` em js/app.js.
 *
 * Persistência: sessionStorage (mesma chave 'rhino-perfil' do legacy) — assim
 * sessões compartilhadas com o vanilla durante a transição enxergam o mesmo
 * perfil; ao fechar a aba o usuário re-escolhe.
 *
 * Não usamos localStorage de propósito: trocar perfil é uma decisão de sessão.
 */

const STORAGE_KEY = 'rhino-perfil';

function readInitial(): NivelAcesso | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NivelAcesso;
  } catch {
    return null;
  }
}

interface PerfilState {
  current: NivelAcesso | null;
  set: (nivel: NivelAcesso) => void;
  clear: () => void;
}

export const usePerfilStore = create<PerfilState>((set) => ({
  current: readInitial(),
  set: (nivel) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nivel));
    } catch {
      /* ignore */
    }
    set({ current: nivel });
  },
  clear: () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    set({ current: null });
  },
}));

// ── Helpers puros para checagem de permissões ──────────────────────────
// Espelham os métodos de js/app.js → perfil.

/** Lista de abas do perfil (null = sem restrição, libera tudo). */
export function abas(nivel: NivelAcesso | null): string[] | null {
  return nivel ? nivel.abas ?? [] : null;
}

/**
 * Pode acessar a rota? `route` no formato hash legacy ('#/dashboard'); para
 * o lado React converter com `'#' + path`.
 */
export function podeAcessar(nivel: NivelAcesso | null, route: string): boolean {
  const a = abas(nivel);
  if (!a) return true;
  const base = route.replace(/(#\/[^/]+).*/, '$1');
  const universais = [
    '#/manual',
    '#/rdos',
    '#/estoque',
    '#/comparativo',
    '#/solicitacoes-compra',
    '#/manutencao',
    '#/frota',
    '#/proposta',
    '#/clausulas',
    '#/apresentacao',
    // Recrutamento: aberto a todos os perfis logados (US-05 — qualquer
    // encarregado pode abrir solicitação). RH ainda controla o resto via UI.
    '#/recrutamento',
    // Dashboards-protótipos (A/B/C/D) — abertos a todos durante avaliação
    '#/dashboard-a',
    '#/dashboard-b',
    '#/dashboard-c',
    '#/dashboard-d',
  ];
  if (universais.includes(base)) return true;
  return a.includes(base);
}

/** Pode ver valores monetários? */
export function podeVerValores(nivel: NivelAcesso | null): boolean {
  const a = abas(nivel);
  if (!a) return true;
  return !a.includes('special:nao-ver-valores');
}

/** Pode editar/criar/excluir nesta rota? */
export function podeEditar(nivel: NivelAcesso | null, route: string): boolean {
  const a = abas(nivel);
  if (!a) return true;
  if (!route) return false;
  const base = route.replace(/(#\/[^/]+).*/, '$1');
  return a.includes('edit:' + base);
}

/** Pode abrir essa sub-aba do contrato? */
export function podeContractTab(nivel: NivelAcesso | null, tabKey: string): boolean {
  const a = abas(nivel);
  if (!a) return true;
  if (['cronograma', 'timeline'].includes(tabKey)) return true;
  const tabs = a.filter((s): s is string => typeof s === 'string' && s.startsWith('contrato-tab:'));
  if (tabs.length === 0) return true;
  return tabs.includes('contrato-tab:' + tabKey);
}

/** Primeira aba acessível (default p/ redirect após seleção). */
export function primeiraAba(nivel: NivelAcesso | null): string {
  const a = abas(nivel);
  if (!a || a.length === 0) return '#/dashboard';
  return a[0];
}
