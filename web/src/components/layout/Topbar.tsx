import { Menu } from 'lucide-react';

interface TopbarProps {
  onMenuClick: () => void;
}

/**
 * Cabeçalho mobile — só visível abaixo de 900px (ver layout.css).
 * No desktop a navegação é inteiramente pela sidebar.
 */
export default function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="rh-topbar">
      <button
        type="button"
        className="rh-topbar__menu"
        onClick={onMenuClick}
        aria-label="Abrir menu de navegação"
      >
        <Menu size={22} />
      </button>
      <span className="rh-topbar__brand">Rhino</span>
    </header>
  );
}
