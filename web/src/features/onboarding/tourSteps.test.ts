import { afterEach, describe, expect, it } from 'vitest';
import {
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  markTourSeen,
  resetTour,
  shouldAutoStart,
} from './tourSteps';

afterEach(() => {
  localStorage.clear();
});

describe('TOUR_STEPS', () => {
  it('preserva a ordem e os ids esperados', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(ids).toEqual([
      'boas-vindas',
      'dashboard',
      'contratos',
      'caixa',
      'contas-pagar',
      'notas-fiscais',
      'rdos',
      'recursos',
      'atalhos',
    ]);
  });

  it('todo passo tem título e texto não-vazios', () => {
    TOUR_STEPS.forEach((s) => {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.text.length).toBeGreaterThan(0);
    });
  });

  it('rotas usam path-based (não hash)', () => {
    TOUR_STEPS.forEach((s) => {
      if (s.navigateTo) expect(s.navigateTo.startsWith('/')).toBe(true);
    });
  });
});

describe('persistência', () => {
  it('shouldAutoStart é true quando storage vazio', () => {
    expect(shouldAutoStart()).toBe(true);
  });

  it('markTourSeen impede auto-start', () => {
    markTourSeen();
    expect(localStorage.getItem(TOUR_STORAGE_KEY)).toBe('1');
    expect(shouldAutoStart()).toBe(false);
  });

  it('resetTour devolve a marca a vazio', () => {
    markTourSeen();
    resetTour();
    expect(shouldAutoStart()).toBe(true);
  });
});
