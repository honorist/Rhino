import { describe, expect, it } from 'vitest';
import type { Recurso } from '../../types/domain';
import { calcProximaFolga, normalizeCargo } from './proximaFolga';

const NOW = new Date('2026-05-22T10:00:00');

function recurso(over: Partial<Recurso>): Recurso {
  return { id: 'r1', nome: 'Teste', ...over };
}

describe('normalizeCargo', () => {
  it('aplica sentence-case e colapsa espaços', () => {
    expect(normalizeCargo('PEDREIRO')).toBe('Pedreiro');
    expect(normalizeCargo('  pedreiro  ')).toBe('Pedreiro');
    expect(normalizeCargo('eletricista  industrial')).toBe(
      'Eletricista industrial',
    );
  });

  it('devolve string vazia para valores vazios', () => {
    expect(normalizeCargo('')).toBe('');
    expect(normalizeCargo(null)).toBe('');
  });
});

describe('calcProximaFolga', () => {
  it('devolve null sem alocação', () => {
    expect(calcProximaFolga(recurso({}), NOW)).toBeNull();
  });

  it('calcula a partir do início na obra quando não há folgas', () => {
    const info = calcProximaFolga(
      recurso({
        alocacaoAtual: { dataInicio: '2026-05-01', cicloTrabalho: 21 },
        folgas: [],
      }),
      NOW,
    );
    expect(info?.dataProxima).toBe('2026-05-22');
    expect(info?.diasRestantes).toBe(1);
  });

  it('usa o fim da última folga como base', () => {
    const info = calcProximaFolga(
      recurso({
        alocacaoAtual: { dataInicio: '2026-01-01', cicloTrabalho: 21 },
        folgas: [
          { id: 'f1', dataInicio: '2026-04-10', dataFim: '2026-04-17' },
        ],
      }),
      NOW,
    );
    expect(info?.dataProxima).toBe('2026-05-08');
  });
});
