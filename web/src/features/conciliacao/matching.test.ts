import { describe, expect, it } from 'vitest';
import type { ContaPagar } from '../../types/domain';
import type { BankTransaction } from './types';
import { findMatches, tokenize } from './matching';

function conta(over: Partial<ContaPagar>): ContaPagar {
  return {
    id: 'c1',
    descricao: 'Conta',
    status: 'pendente',
    valor: 0,
    ...over,
  };
}

describe('tokenize', () => {
  it('mantém só tokens com mais de 3 caracteres', () => {
    expect(tokenize('Pagamento fornecedor X')).toEqual([
      'pagamento',
      'fornecedor',
    ]);
  });
});

describe('findMatches', () => {
  const tx: BankTransaction = {
    id: 'tx1',
    date: '2026-01-15',
    value: 1000,
    type: 'saida',
    description: 'Aluguel galpao mensal',
  };

  it('pontua alto contas com valor, data e descrição coincidentes', () => {
    const matches = findMatches(tx, [
      conta({
        id: 'c1',
        descricao: 'Aluguel galpao',
        valor: 1000,
        dataVencimento: '2026-01-15',
      }),
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].conta.id).toBe('c1');
    expect(matches[0].score).toBeGreaterThanOrEqual(90);
  });

  it('descarta contas com valor muito distante', () => {
    const matches = findMatches(tx, [
      conta({ id: 'c2', descricao: 'Outra', valor: 5000 }),
    ]);
    expect(matches).toHaveLength(0);
  });

  it('ignora contas já pagas', () => {
    const matches = findMatches(tx, [
      conta({ id: 'c3', descricao: 'Aluguel galpao', valor: 1000, status: 'pago' }),
    ]);
    expect(matches).toHaveLength(0);
  });
});
