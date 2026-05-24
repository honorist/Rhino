import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OfflineBanner from './OfflineBanner';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OfflineBanner', () => {
  it('não renderiza quando online no mount inicial', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { container } = render(<OfflineBanner />);
    // Estado inicial online + hideOnlineAfter=true → nada visível
    expect(container.querySelector('#rh-offline-bar')).toBeNull();
  });

  it('mostra mensagem vermelha quando offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineBanner />);
    const bar = screen.getByRole('status');
    expect(bar.textContent).toContain('Sem conexão');
  });

  it('mostra mensagem verde temporária ao reconectar e some depois', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.useFakeTimers();
    render(<OfflineBanner />);
    // offline → vermelho
    expect(screen.getByRole('status').textContent).toContain('Sem conexão');
    // dispara online
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('status').textContent).toContain('Conexão restaurada');
    // após 3s, esconde
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
