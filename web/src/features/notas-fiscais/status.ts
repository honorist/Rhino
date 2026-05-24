/**
 * Status de prazo de uma nota fiscal — porte puro de `Store.getNotaFiscalStatus`.
 */

export type NFStatusKind = 'vencida' | 'proximo_vencer' | 'no_prazo';

export interface NFStatus {
  status: NFStatusKind;
  /** Dias restantes até o limite (0 quando já vencida). */
  dias: number;
  /** Sufixo de classe .badge-* do CSS atual. */
  classe: 'danger' | 'warning' | 'success';
}

const MS_DIA = 86_400_000;

/** Classifica a `dataLimite` (YYYY-MM-DD) em vencida / próxima / no prazo. */
export function getNotaFiscalStatus(dataLimite: string): NFStatus {
  const diasRestantes = Math.floor(
    (new Date(dataLimite).getTime() - Date.now()) / MS_DIA,
  );
  if (diasRestantes < 0) return { status: 'vencida', dias: 0, classe: 'danger' };
  if (diasRestantes <= 7) {
    return { status: 'proximo_vencer', dias: diasRestantes, classe: 'warning' };
  }
  return { status: 'no_prazo', dias: diasRestantes, classe: 'success' };
}

/** Dias entre hoje e a data (YYYY-MM-DD), tratada como meio-dia local. */
export function diasAteMeioDia(data: string): number {
  return Math.floor((new Date(`${data}T12:00:00`).getTime() - Date.now()) / MS_DIA);
}
