import { describe, expect, it } from 'vitest';
import { decideUpdate } from './autoUpdate';

describe('decideUpdate', () => {
  it('idle quando server == loaded', () => {
    expect(
      decideUpdate({ loadedVersion: '1.2.73', serverVersion: '1.2.73', lastAttempt: null }),
    ).toBe('idle');
  });

  it('idle quando server é null/undefined (sem info)', () => {
    expect(
      decideUpdate({ loadedVersion: '1.2.73', serverVersion: null, lastAttempt: null }),
    ).toBe('idle');
    expect(
      decideUpdate({ loadedVersion: '1.2.73', serverVersion: undefined, lastAttempt: null }),
    ).toBe('idle');
  });

  it('apply quando versões divergem e não foi tentado ainda', () => {
    expect(
      decideUpdate({ loadedVersion: '1.2.73', serverVersion: '1.2.74', lastAttempt: null }),
    ).toBe('apply');
  });

  it('apply quando última tentativa foi para versão DIFERENTE da atual divergente', () => {
    // Houve novo deploy desde a tentativa anterior — deve tentar de novo
    expect(
      decideUpdate({ loadedVersion: '1.2.73', serverVersion: '1.2.75', lastAttempt: '1.2.74' }),
    ).toBe('apply');
  });

  it('give_up quando já tentou exatamente essa serverVersion', () => {
    expect(
      decideUpdate({ loadedVersion: '1.2.73', serverVersion: '1.2.74', lastAttempt: '1.2.74' }),
    ).toBe('give_up');
  });
});
