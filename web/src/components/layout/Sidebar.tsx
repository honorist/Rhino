import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, ChevronsUpDown, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { NavGroup, RouteDef } from '../../routes/config';
import { GROUP_ROUTES, NAV_GROUPS, ROUTES } from '../../routes/config';
import { podeAcessar, usePerfilStore } from '../../features/auth/perfilStore';
import { useCurrentUser, useLogout } from '../../features/auth/queries';
import NotificacoesBell from '../../features/recrutamento/NotificacoesBell';
import { cn } from '@/lib/cn';

/**
 * Filtra rotas conforme o perfil ativo. Espelha o `perfil.podeAcessar()` do
 * legacy. Sem perfil ativo (admin sem nível), libera tudo.
 *
 * Mapeia path-based (React) → hash-based (legacy) para conferir contra a
 * lista de abas do nível de acesso, que está armazenada no formato `#/x`.
 */
function useRotasPermitidas(): RouteDef[] {
  const perfil = usePerfilStore((s) => s.current);
  return useMemo(
    () => ROUTES.filter((r) => podeAcessar(perfil, '#' + r.path)),
    [perfil],
  );
}

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '?';

interface SidebarProps {
  /** Chamado ao clicar em qualquer item — fecha o drawer no mobile. */
  onNavigate: () => void;
}

// ─── Item de navegação (link) ───
function NavItem({
  route,
  onNavigate,
  nested = false,
}: {
  route: RouteDef;
  onNavigate: () => void;
  nested?: boolean;
}) {
  const Icon = route.icon;
  return (
    <li>
      <NavLink
        to={route.path}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2.5 rounded-md font-medium transition-colors',
            nested ? 'px-3 py-1.5 text-[13px]' : 'px-3 py-2 text-sm',
            isActive
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
          )
        }
        onClick={onNavigate}
      >
        {Icon && <Icon size={nested ? 15 : 18} className="shrink-0" />}
        <span>{route.label}</span>
      </NavLink>
    </li>
  );
}

// ─── Grupo colapsável ───
// Comportamento accordion EXCLUSIVO (porte do legacy): abrir um grupo fecha
// os outros. Controlado pelo pai Sidebar via prop `open` + callback `onToggle`.
function NavGroupSection({
  group,
  items,
  onNavigate,
  open,
  onToggle,
}: {
  group: NavGroup;
  items: RouteDef[];
  onNavigate: () => void;
  open: boolean;
  onToggle: () => void;
}) {
  const { pathname } = useLocation();
  const hasActiveChild = items.some((route) => route.path === pathname);

  const GroupIcon = group.icon;

  return (
    <li>
      <button
        type="button"
        className={cn(
          'flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors text-left bg-transparent border-0',
          hasActiveChild
            ? 'text-indigo-700 dark:text-indigo-400'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
        )}
        onClick={onToggle}
        aria-expanded={open}
      >
        <GroupIcon size={18} className="shrink-0" />
        <span className="flex-1">{group.label}</span>
        <ChevronRight
          size={14}
          className={cn(
            'shrink-0 opacity-50 transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
      </button>
      <ul
        className={cn(
          'list-none pl-5 space-y-0.5 overflow-hidden transition-all duration-200',
          open ? 'max-h-96 opacity-100 mt-0.5' : 'max-h-0 opacity-0',
        )}
      >
        {items.map((route) => (
          <NavItem key={route.path} route={route} onNavigate={onNavigate} nested />
        ))}
      </ul>
    </li>
  );
}

// Chave única que persiste o grupo aberto (accordion exclusivo).
const ACCORDION_KEY = 'rhino-sb-open-group';

function readOpenGroup(): string | null {
  try {
    return localStorage.getItem(ACCORDION_KEY);
  } catch {
    return null;
  }
}

function writeOpenGroup(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACCORDION_KEY, id);
    else localStorage.removeItem(ACCORDION_KEY);
  } catch {
    /* ignore */
  }
}

/** Menu lateral — itens de topo, grupos colapsáveis e Configuração. */
export default function Sidebar({ onNavigate }: SidebarProps) {
  const permitidas = useRotasPermitidas();
  const { pathname } = useLocation();

  const topLevel = permitidas.filter(
    (route) => route.label && !route.group && route.path !== '/configuracao',
  );
  const configRoute = permitidas.find((route) => route.path === '/configuracao');

  // Para cada grupo, mostra só as rotas do grupo que o perfil pode acessar.
  // Grupo com zero filhos visíveis é omitido da sidebar.
  // Grupo aberto: o do salvado em localStorage, OU o grupo que tem rota ativa
  // (prioriza rota ativa pra abrir automaticamente quando navega pra dentro).
  const activeGroupId = (NAV_GROUPS.find((g) =>
    GROUP_ROUTES[g.id].some((r) => r.path === pathname),
  )?.id ?? null) as string | null;
  const [openGroupId, setOpenGroupId] = useState<string | null>(
    () => activeGroupId ?? readOpenGroup(),
  );

  // Mantém aberto o grupo da rota ativa quando navega pra dentro dele.
  useEffect(() => {
    if (activeGroupId && activeGroupId !== openGroupId) {
      setOpenGroupId(activeGroupId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId]);

  function toggleGroup(id: string) {
    setOpenGroupId((prev) => {
      const next = prev === id ? null : id;
      writeOpenGroup(next);
      return next;
    });
  }

  const visibleGroups = NAV_GROUPS.map((group) => ({
    group,
    items: GROUP_ROUTES[group.id].filter((r) =>
      permitidas.some((p) => p.path === r.path),
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <nav
      id="sidebar"
      aria-label="Menu principal"
      className="flex flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 sticky top-0 h-screen overflow-y-auto z-[100]"
      style={{ width: 244 }}
    >
      <div className="flex items-center min-h-[60px] px-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <img className="w-36 h-auto block" src="/assets/logo.png" alt="Rhino" />
      </div>

      <ul className="flex-1 list-none p-2 space-y-0.5 overflow-y-auto">
        {topLevel.map((route) => (
          <NavItem key={route.path} route={route} onNavigate={onNavigate} />
        ))}
        {visibleGroups.map(({ group, items }) => (
          <NavGroupSection
            key={group.id}
            group={group}
            items={items}
            onNavigate={onNavigate}
            open={openGroupId === group.id}
            onToggle={() => toggleGroup(group.id)}
          />
        ))}
        {configRoute && <NavItem route={configRoute} onNavigate={onNavigate} />}
      </ul>

      <SidebarFooter />
    </nav>
  );
}

/**
 * Rodapé da sidebar — porte de js/app.js (linhas ~1016-1038).
 * Mostra: sininho de notificações + botão sair + perfil ativo + versão.
 */
function SidebarFooter() {
  const meQuery = useCurrentUser();
  const user = meQuery.data?.user;
  const perfil = usePerfilStore((s) => s.current);
  const clearPerfil = usePerfilStore((s) => s.clear);
  const logout = useLogout();

  async function handleLogout() {
    if (!window.confirm('Deseja sair?')) return;
    try {
      await logout.mutateAsync();
    } catch {
      /* ignore */
    } finally {
      clearPerfil();
      location.reload();
    }
  }

  // Só mostra "trocar perfil" se o user NÃO tem nivelAcessoId fixo.
  const podeTrocarPerfil = !!perfil && !user?.nivelAcessoId;

  return (
    <div className="p-2 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-1.5 shrink-0">
      {user && <NotificacoesBell />}
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors bg-transparent border-0"
              disabled={logout.isPending}
              aria-label="Menu do usuário"
            >
              <LogOut size={16} className="shrink-0" />
              <span className="flex-1 text-left truncate font-semibold">
                {user.name || user.email}
              </span>
              <ChevronsUpDown size={14} className="shrink-0 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">
                  {user.name || user.email}
                </span>
                {user.name && (
                  <span className="text-xs text-muted-foreground">
                    {user.email}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            {perfil && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2 font-normal">
                  <span style={{ fontSize: 16 }}>{perfil.icon}</span>
                  <span style={{ color: perfil.cor, fontWeight: 600 }}>
                    {perfil.label}
                  </span>
                </DropdownMenuLabel>
                {podeTrocarPerfil && (
                  <DropdownMenuItem onClick={() => clearPerfil()}>
                    Trocar Perfil
                  </DropdownMenuItem>
                )}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void handleLogout()}
              disabled={logout.isPending}
            >
              <LogOut size={14} />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <div className="px-3 py-1 text-xs text-slate-400 dark:text-slate-600 text-center">
        Rhino v{APP_VERSION}
      </div>
    </div>
  );
}
