import { useSidebar } from '../ui/sidebar';

/**
 * Cabeçalho mobile — só visível abaixo de 768px (ver layout.css).
 * No desktop a navegação é pela sidebar fixa.
 */
export default function Topbar() {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="rh-topbar">
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-foreground hover:bg-accent"
        onClick={toggleSidebar}
        aria-label="Abrir menu de navegação"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="18" height="18" x="3" y="3" rx="2"/>
          <path d="M9 3v18"/>
        </svg>
      </button>
      <span className="rh-topbar__brand">Rhino</span>
    </header>
  );
}
