import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useCurrentUser } from '../../features/auth/queries';
import CommandPalette from '../../features/command-palette/CommandPalette';
import { useCommandPalette } from '../../features/command-palette/useCommandPalette';
import OnboardingTour from '../../features/onboarding/OnboardingTour';
import { useAutoStartTour } from '../../features/onboarding/useAutoStartTour';
import ThemeCustomizer from '../../features/theme/ThemeCustomizer';
import { useAutoUpdate } from '../../hooks/useAutoUpdate';
import { useRealtime } from '../../hooks/useRealtime';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import BackToTop from '../BackToTop';
import OfflineBanner from '../OfflineBanner';
import TopProgressBar from '../TopProgressBar';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

// Versão carregada — injetada via Vite (VITE_APP_VERSION). Em dev fica
// undefined e o auto-update é desativado.
const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ??
  (typeof window !== 'undefined' ? (window as Window & { __APP_VERSION__?: string }).__APP_VERSION__ : undefined);

/**
 * Layout raiz: grid sidebar + conteúdo (espelha #shell/#sidebar/#app do
 * index.html antigo). No mobile, a sidebar vira drawer controlado pela Topbar.
 */
export default function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);
  // instrumenta fetch global + drena fila ao reconectar
  useOfflineSync();
  // polling /api/health para auto-update silencioso em prod
  useAutoUpdate(APP_VERSION);
  // SSE de mutações: invalida queries do react-query em tempo real
  const me = useCurrentUser();
  useRealtime(me.data?.user?.email);
  // tour guiado para novos usuários
  const tour = useAutoStartTour();
  // Ctrl/Cmd+K e "/" abrem a paleta de comandos
  const cmdk = useCommandPalette();

  return (
    <div id="shell" data-nav-open={navOpen}>
      <TopProgressBar />
      <Topbar onMenuClick={() => setNavOpen((open) => !open)} />
      <Sidebar onNavigate={closeNav} />
      {navOpen && (
        <button
          type="button"
          className="rh-nav-backdrop"
          aria-label="Fechar menu"
          onClick={closeNav}
        />
      )}
      <main id="app" tabIndex={-1}>
        <Outlet />
      </main>
      <ThemeCustomizer />
      <OfflineBanner />
      <BackToTop />
      <BottomNav />
      <OnboardingTour active={tour.active} onFinish={tour.stop} />
      <CommandPalette open={cmdk.open} onClose={cmdk.hide} />
    </div>
  );
}
