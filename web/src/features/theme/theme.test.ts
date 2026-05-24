import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_RADIUS,
  PRESETS,
  STORAGE_KEY_COLOR,
  STORAGE_KEY_RADIUS,
  shade,
} from './presets';

describe('shade()', () => {
  it('é idempotente para pct=0', () => {
    expect(shade('#55588B', 0).toLowerCase()).toBe('#55588b');
  });

  it('clareia em direção ao branco para pct>0', () => {
    const out = shade('#000000', 0.5);
    expect(out.toLowerCase()).toBe('#808080');
  });

  it('escurece em direção ao preto para pct<0', () => {
    const out = shade('#ffffff', -0.5);
    expect(out.toLowerCase()).toBe('#808080');
  });

  it('mantém formato #rrggbb com 7 chars', () => {
    const out = shade('#3B5BDB', 0.15);
    expect(out).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('PRESETS', () => {
  it('contém 12 cores com formato hex válido', () => {
    expect(PRESETS).toHaveLength(12);
    PRESETS.forEach((p) => {
      expect(p.hex).toMatch(/^#[0-9A-F]{6}$/i);
      expect(p.name.length).toBeGreaterThan(0);
    });
  });

  it('Slate Purple é o primeiro (default)', () => {
    expect(PRESETS[0].hex).toBe('#55588B');
  });
});

describe('chaves de storage', () => {
  it('preserva as chaves do themer.js antigo', () => {
    expect(STORAGE_KEY_COLOR).toBe('rhino-theme-color');
    expect(STORAGE_KEY_RADIUS).toBe('rhino-theme-radius');
    expect(DEFAULT_RADIUS).toBe(6);
  });
});

describe('integração useTheme com localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('lê valores persistidos ao montar e aplica nas CSS vars', async () => {
    localStorage.setItem(STORAGE_KEY_COLOR, '#3B5BDB');
    localStorage.setItem(STORAGE_KEY_RADIUS, '10');
    // import dinâmico após popular o storage para garantir readInitial
    const { renderHook } = await import('@testing-library/react');
    const { useTheme } = await import('./useTheme');
    const { result } = renderHook(() => useTheme());
    expect(result.current.color).toBe('#3B5BDB');
    expect(result.current.radius).toBe(10);
    expect(result.current.isCustomColor).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#3B5BDB');
    expect(document.documentElement.style.getPropertyValue('--border-radius')).toBe('10px');
  });

  it('reset limpa storage e CSS vars', async () => {
    localStorage.setItem(STORAGE_KEY_COLOR, '#3B5BDB');
    const { renderHook, act } = await import('@testing-library/react');
    const { useTheme } = await import('./useTheme');
    const { result } = renderHook(() => useTheme());
    act(() => result.current.reset());
    expect(localStorage.getItem(STORAGE_KEY_COLOR)).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('');
    expect(result.current.isCustomColor).toBe(false);
  });
});
