/**
 * Conciliação automática — pontua contas a pagar contra uma transação
 * bancária. Lógica pura, porte de `_findMatches` / `_tokenize`.
 */
import type { ContaPagar } from '../../types/domain';
import type { BankTransaction, MatchCandidate } from './types';

const MS_DIA = 86_400_000;

/** Quebra um texto em tokens significativos (minúsculo, sem pontuação, >3 chars). */
export function tokenize(str: string): string[] {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9À-ÿ\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

/**
 * Encontra até 3 contas a pagar candidatas a conciliar com a transação.
 * Pontua por valor (até 55), data de vencimento (até 25) e descrição (até 20).
 */
export function findMatches(
  tx: BankTransaction,
  contas: ContaPagar[],
): MatchCandidate[] {
  const abertas = contas.filter((c) => c.status !== 'pago');
  const txValue = Number(tx.value) || 0;
  const txTokens = tokenize(tx.description || '');

  const scored: MatchCandidate[] = [];
  for (const conta of abertas) {
    const contaValor = Number(conta.valor) || 0;
    const diff = Math.abs(txValue - contaValor);
    const pct = contaValor > 0 ? diff / contaValor : 1;

    let score: number;
    if (diff < 0.02) score = 55;
    else if (pct <= 0.02) score = 35;
    else if (pct <= 0.1) score = 10;
    else continue; // valor longe demais — descarta

    if (tx.date && conta.dataVencimento) {
      const txMs = new Date(`${tx.date}T12:00:00`).getTime();
      const contaMs = new Date(`${conta.dataVencimento}T12:00:00`).getTime();
      const daysDiff = Math.abs(Math.round((txMs - contaMs) / MS_DIA));
      if (daysDiff === 0) score += 25;
      else if (daysDiff <= 3) score += 18;
      else if (daysDiff <= 7) score += 10;
      else if (daysDiff <= 15) score += 5;
    }

    const contaTokens = tokenize(conta.descricao || '');
    let matchCount = 0;
    for (const t of txTokens) {
      if (contaTokens.includes(t)) matchCount++;
    }
    score += Math.min(matchCount * 8, 20);

    scored.push({ conta, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}
