import { describe, expect, it } from 'vitest';
import { keysForEntity } from './realtimeMap';

describe('keysForEntity', () => {
  it('contracts dispara contracts + dashboard + atividades', () => {
    const keys = keysForEntity('contracts');
    expect(keys.map((k) => k[0])).toContain('contracts');
    expect(keys.map((k) => k[0])).toContain('dashboard');
    expect(keys.map((k) => k[0])).toContain('atividades');
  });

  it('notas-fiscais propaga para caixa e contracts (efeito colateral conhecido)', () => {
    const keys = keysForEntity('notas-fiscais');
    expect(keys.map((k) => k[0])).toEqual(['notas-fiscais', 'caixa', 'contracts']);
  });

  it('contas-pagar invalida caixa também', () => {
    expect(keysForEntity('contas-pagar').map((k) => k[0])).toEqual([
      'contas-pagar',
      'caixa',
    ]);
  });

  it('organograma toca contracts e recursos', () => {
    expect(keysForEntity('organograma').map((k) => k[0])).toEqual([
      'contracts',
      'recursos',
    ]);
  });

  it('entidade desconhecida retorna lista vazia (no-op)', () => {
    expect(keysForEntity('inexistente')).toEqual([]);
  });
});
