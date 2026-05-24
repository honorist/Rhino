/** Tipos do domínio Conciliação Bancária — porte de js/views/Conciliacao.js. */
import type { ContaPagar } from '../../types/domain';

/** Transação extraída de um extrato bancário (OFX ou CSV). */
export interface BankTransaction {
  id: string;
  date: string;
  value: number;
  type: 'entrada' | 'saida';
  description: string;
}

/** Candidata a conciliação: uma conta a pagar com seu score de match. */
export interface MatchCandidate {
  conta: ContaPagar;
  score: number;
}

export type DecisionAction = 'pending' | 'confirm' | 'skip';

/** Decisão do usuário sobre uma transação importada. */
export interface Decision {
  action: DecisionAction;
  /** Conta a pagar vinculada (null = lançar sem vínculo). */
  contaPagarId: string | null;
  matches: MatchCandidate[];
}
