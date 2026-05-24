import { describe, expect, it } from 'vitest';
import { getNotaFiscalStatus } from './status';

/** Data ISO (YYYY-MM-DD) deslocada `dias` a partir de hoje. */
function emDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

describe('getNotaFiscalStatus', () => {
  it('classifica data passada como vencida', () => {
    const s = getNotaFiscalStatus(emDias(-5));
    expect(s.status).toBe('vencida');
    expect(s.classe).toBe('danger');
  });

  it('classifica data dentro de 7 dias como próxima', () => {
    const s = getNotaFiscalStatus(emDias(3));
    expect(s.status).toBe('proximo_vencer');
    expect(s.classe).toBe('warning');
  });

  it('classifica data distante como no prazo', () => {
    const s = getNotaFiscalStatus(emDias(45));
    expect(s.status).toBe('no_prazo');
    expect(s.classe).toBe('success');
    expect(s.dias).toBeGreaterThan(7);
  });
});
