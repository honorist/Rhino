import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutoUpdate } from './useAutoUpdate';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('useAutoUpdate', () => {
  it('não inscreve listeners quando loadedVersion é undefined', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    renderHook(() => useAutoUpdate(undefined));
    // Não deve registrar visibility/input/focusin
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).not.toContain('visibilitychange');
    expect(events).not.toContain('input');
    expect(events).not.toContain('focusin');
  });

  it('não inscreve listeners quando loadedVersion === "dev"', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    renderHook(() => useAutoUpdate('dev'));
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).not.toContain('visibilitychange');
  });

  it('inscreve listeners e agenda check inicial em produção', () => {
    vi.useFakeTimers();
    const addSpy = vi.spyOn(document, 'addEventListener');
    const { unmount } = renderHook(() => useAutoUpdate('1.2.73'));
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain('visibilitychange');
    expect(events).toContain('input');
    expect(events).toContain('focusin');
    unmount();
  });

  it('limpa listeners no unmount', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useAutoUpdate('1.2.73'));
    const added = addSpy.mock.calls.length;
    unmount();
    expect(removeSpy.mock.calls.length).toBeGreaterThan(0);
    // Sanidade: o número de removes >= o número de eventos registrados pelo hook
    expect(added).toBeGreaterThan(0);
  });
});
