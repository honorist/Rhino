import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useHighContrast } from './useHighContrast';

beforeEach(() => {
  localStorage.clear();
  document.body.className = '';
});
afterEach(() => {
  localStorage.clear();
  document.body.className = '';
});

describe('useHighContrast', () => {
  it('inicia desligado quando storage vazio', () => {
    const { result } = renderHook(() => useHighContrast());
    expect(result.current.enabled).toBe(false);
    expect(document.body.classList.contains('high-contrast')).toBe(false);
  });

  it('lê preferência salva no mount e aplica classe', () => {
    localStorage.setItem('rhino-contrast', '1');
    const { result } = renderHook(() => useHighContrast());
    expect(result.current.enabled).toBe(true);
    expect(document.body.classList.contains('high-contrast')).toBe(true);
  });

  it('toggle alterna estado, classe e storage', () => {
    const { result } = renderHook(() => useHighContrast());

    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(true);
    expect(document.body.classList.contains('high-contrast')).toBe(true);
    expect(localStorage.getItem('rhino-contrast')).toBe('1');

    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    expect(document.body.classList.contains('high-contrast')).toBe(false);
    expect(localStorage.getItem('rhino-contrast')).toBeNull();
  });
});
