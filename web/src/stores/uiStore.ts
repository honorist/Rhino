import { create } from 'zustand';

/**
 * Estado de UI/cliente (NÃO de servidor — isso é responsabilidade do
 * TanStack Query). Porte das partes não-dados do store.js: tema, sidebar.
 */

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'rhino-theme';

function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage indisponível */
  }
  return 'dark';
}

interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: readInitialTheme(),
  sidebarCollapsed: false,

  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignora */
    }
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },

  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
}));
