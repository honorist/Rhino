import { Outlet } from 'react-router-dom';
import { Search } from 'lucide-react';
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
import AppSidebar from './Sidebar';
import Topbar from './Topbar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '../ui/sidebar';

const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ??
  (typeof window !== 'undefined'
    ? (window as Window & { __APP_VERSION__?: string }).__APP_VERSION__
    : undefined);

export default function Shell() {
  useOfflineSync();
  useAutoUpdate(APP_VERSION);
  const me = useCurrentUser();
  useRealtime(me.data?.user?.email);
  const tour = useAutoStartTour();
  const cmdk = useCommandPalette();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopProgressBar />
        {/* Mobile topbar (hidden on desktop via layout.css) */}
        <Topbar />
        {/* Desktop sticky header com SidebarTrigger + Cmd+K (hidden on mobile) */}
        <header className="hidden md:flex sticky top-0 z-10 items-center gap-2 border-b border-border bg-background/95 backdrop-blur-sm px-4 h-12 shrink-0">
          <SidebarTrigger className="-ml-1" />
          <button
            type="button"
            onClick={cmdk.show}
            className="ml-2 inline-flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors min-w-64"
            aria-label="Abrir busca (Ctrl+K)"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Buscar...</span>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </header>
        <main id="app" tabIndex={-1} className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
        <BottomNav />
      </SidebarInset>
      <ThemeCustomizer />
      <OfflineBanner />
      <BackToTop />
      <OnboardingTour active={tour.active} onFinish={tour.stop} />
      <CommandPalette open={cmdk.open} onClose={cmdk.hide} />
    </SidebarProvider>
  );
}
