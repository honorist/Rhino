import { describe, expect, it } from 'vitest';
import type { Documento } from '../../types/domain';
import { conformidade, diasRestantes, statusDoc } from './conformidade';

const NOW = new Date('2026-05-22T10:00:00');

function doc(dataVencimento?: string): Documento {
  return { id: 'd', tipo: 'ASO', dataVencimento };
}

describe('statusDoc', () => {
  it('é pendente sem data de vencimento', () => {
    expect(statusDoc(doc(), NOW)).toBe('pendente');
  });

  it('é vigente quando faltam mais de 30 dias', () => {
    expect(statusDoc(doc('2026-12-31'), NOW)).toBe('vigente');
  });

  it('é vencendo quando faltam 30 dias ou menos', () => {
    expect(statusDoc(doc('2026-06-05'), NOW)).toBe('vencendo');
  });

  it('é vencido quando a data já passou', () => {
    expect(statusDoc(doc('2026-01-01'), NOW)).toBe('vencido');
  });
});

describe('diasRestantes', () => {
  it('retorna null sem data de vencimento', () => {
    expect(diasRestantes(doc(), NOW)).toBeNull();
  });

  it('retorna um número negativo para documentos vencidos', () => {
    expect(diasRestantes(doc('2026-01-01'), NOW)).toBeLessThan(0);
  });
});

describe('conformidade', () => {
  it('é sem_docs quando não há documentos', () => {
    expect(conformidade([], NOW).status).toBe('sem_docs');
  });

  it('é ok com 100% de documentos vigentes', () => {
    const c = conformidade([doc('2026-12-31'), doc('2026-12-01')], NOW);
    expect(c.score).toBe(100);
    expect(c.status).toBe('ok');
  });

  it('é critico quando há documento vencido', () => {
    const c = conformidade([doc('2026-12-31'), doc('2026-01-01')], NOW);
    expect(c.score).toBe(50);
    expect(c.status).toBe('critico');
  });

  it('é atencao quando falta vigência sem nenhum vencido', () => {
    const c = conformidade([doc('2026-12-31'), doc('2026-06-05')], NOW);
    expect(c.status).toBe('atencao');
  });
});
