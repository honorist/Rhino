import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore';

/** Itens fixos da barra inferior — espelha BOTTOM_NAV_ITEMS de js/polish.js. */
const ITEMS: ReadonlyArray<
  | { kind: 'link'; label: string; icon: string; to: string; match?: string }
  | { kind: 'action'; label: string; icon: string; onClick: 'search' | 'menu' }
> = [
  { kind: 'link', label: 'Início', icon: '🏠', to: '/dashboard' },
  { kind: 'link', label: 'Contratos', icon: '📋', to: '/contratos', match: '/contratos' },
  { kind: 'action', label: 'Buscar', icon: '⌕', onClick: 'search' },
  { kind: 'link', label: 'Financeiro', icon: '💰', to: '/caixa' },
  { kind: 'action', label: 'Mais', icon: '☰', onClick: 'menu' },
];

const BREAKPOINT = 768;

/**
 * Barra de navegação inferior para viewports mobile (largura ≤ 768px).
 * Porte da seção 5 de js/polish.js. "Buscar" abre o CommandPalette (quando
 * disponível); "Mais" alterna o drawer da sidebar.
 */
export default function BottomNav() {
  const { pathname } = useLocation();
  const [mobile, setMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= BREAKPOINT;
  });
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  useEffect(() => {
    let timer: number | null = null;
    const onResize = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setMobile(window.innerWidth <= BREAKPOINT);
      }, 120);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  if (!mobile) return null;

  const handleAction = (a: 'search' | 'menu') => {
    if (a === 'menu') {
      toggleSidebar();
      return;
    }
    // CommandPalette (F4-5b) ainda não está montado — dispara evento custom
    // para que ele se escute quando for adicionado. Sem listener, no-op.
    window.dispatchEvent(new CustomEvent('rh:open-command-palette'));
  };

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Navegação principal">
      {ITEMS.map((it) => {
        if (it.kind === 'action') {
          return (
            <button
              key={it.label}
              type="button"
              className="bottom-nav__item"
              onClick={() => handleAction(it.onClick)}
            >
              <span className="bottom-nav__icon">{it.icon}</span>
              <span>{it.label}</span>
            </button>
          );
        }
        const active = pathname.startsWith(it.match ?? it.to);
        return (
          <NavLink
            key={it.label}
            to={it.to}
            className={`bottom-nav__item${active ? ' is-active' : ''}`}
          >
            <span className="bottom-nav__icon">{it.icon}</span>
            <span>{it.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
