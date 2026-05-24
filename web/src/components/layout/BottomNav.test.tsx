import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import BottomNav from './BottomNav';

function setWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => {
  setWidth(1280);
});

describe('BottomNav', () => {
  it('não renderiza em viewport desktop', () => {
    setWidth(1280);
    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <BottomNav />
      </MemoryRouter>,
    );
    expect(container.querySelector('.bottom-nav')).toBeNull();
  });

  it('aparece quando largura ≤ 768px', async () => {
    setWidth(390);
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <BottomNav />
      </MemoryRouter>,
    );
    // debounce do resize handler é 120ms — avança e checa via waitFor
    const nav = await screen.findByRole('navigation', {
      name: 'Navegação principal',
    });
    expect(nav).toBeInTheDocument();
    // 5 itens (3 link + 2 action)
    expect(nav.querySelectorAll('.bottom-nav__item').length).toBe(5);
  });

  it('aplica is-active na rota atual', () => {
    setWidth(390);
    const { container } = render(
      <MemoryRouter initialEntries={['/contratos']}>
        <BottomNav />
      </MemoryRouter>,
    );
    const itens = container.querySelectorAll('.bottom-nav__item');
    const ativos = Array.from(itens).filter((el) =>
      el.className.includes('is-active'),
    );
    expect(ativos.length).toBe(1);
    expect(ativos[0].textContent).toContain('Contratos');
  });

  it('"Buscar" dispara evento custom rh:open-command-palette', () => {
    setWidth(390);
    const spy = vi.fn();
    window.addEventListener('rh:open-command-palette', spy);
    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <BottomNav />
      </MemoryRouter>,
    );
    const buscar = Array.from(container.querySelectorAll('.bottom-nav__item')).find(
      (el) => el.textContent?.includes('Buscar'),
    );
    expect(buscar).toBeTruthy();
    act(() => {
      fireEvent.click(buscar!);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener('rh:open-command-palette', spy);
  });
});
