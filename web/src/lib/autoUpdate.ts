/**
 * Lógica pura do auto-update.
 * Decide se deve recarregar, com proteção anti-loop e respeitando inputs ativos.
 * Porte da seção 1b de js/polish.js.
 */

const TENTATIVA_KEY = 'rh:upgrade-attempt';

export interface UpdateDecisionInput {
  loadedVersion: string;
  serverVersion: string | null | undefined;
  lastAttempt: string | null;
}

/**
 * Decide a próxima ação dado o estado atual.
 * - `idle`: versões iguais (limpar marca).
 * - `give_up`: já tentou e falhou (mesma versão ainda divergindo).
 * - `apply`: precisa atualizar, ainda não tentou pra essa versão.
 */
export type UpdateDecision = 'idle' | 'give_up' | 'apply';

export function decideUpdate(inp: UpdateDecisionInput): UpdateDecision {
  if (!inp.serverVersion || inp.serverVersion === inp.loadedVersion) return 'idle';
  if (inp.lastAttempt === inp.serverVersion) return 'give_up';
  return 'apply';
}

/** Lê a marca de tentativa salva no sessionStorage. */
export function readAttempt(): string | null {
  try {
    return sessionStorage.getItem(TENTATIVA_KEY);
  } catch {
    return null;
  }
}

/** Grava a marca de tentativa. */
export function writeAttempt(version: string): void {
  try {
    sessionStorage.setItem(TENTATIVA_KEY, version);
  } catch {
    /* ignore */
  }
}

/** Apaga a marca de tentativa (chamado quando versões batem). */
export function clearAttempt(): void {
  try {
    sessionStorage.removeItem(TENTATIVA_KEY);
  } catch {
    /* ignore */
  }
}

export const AUTO_UPDATE_KEY = TENTATIVA_KEY;
