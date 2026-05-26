import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, ChevronsUpDown, LogOut } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarSeparator,
} from '../ui/sidebar';
import type { NavGroup, RouteDef } from '../../routes/config';
import { GROUP_ROUTES, NAV_GROUPS, ROUTES } from '../../routes/config';
import { podeAcessar, usePerfilStore } from '../../features/auth/perfilStore';
import { useCurrentUser, useLogout } from '../../features/auth/queries';
import NotificacoesBell from '../../features/recrutamento/NotificacoesBell';
import { cn } from '@/lib/cn';

function useRotasPermitidas(): RouteDef[] {
  const perfil = usePerfilStore((s) => s.current);
  return useMemo(
    () => ROUTES.filter((r) => podeAcessar(perfil, '#' + r.path)),
    [perfil],
  );
}

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '?';

interface SidebarProps {
  onNavigate: () => void;
}

// ─── Item de navegação simples ───
function NavItem({ route, onNavigate }: { route: RouteDef; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const isActive = pathname === route.path;
  const Icon = route.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <NavLink to={route.path} onClick={onNavigate}>
          {Icon && <Icon />}
          <span>{route.label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ─── Grupo colapsável ───
// Accordion exclusivo: abrir um fecha os outros (controlado pelo pai).
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
  const hasActiveChild = items.some((r) => r.path === pathname);
  const GroupIcon = group.icon;

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={onToggle} className="group/collapsible">
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            isActive={hasActiveChild}
            className="justify-between"
          >
            <span className="flex items-center gap-2 min-w-0">
              <GroupIcon className="size-4 shrink-0" />
              <span className="truncate">{group.label}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 opacity-50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((route) => (
              <SubNavItem key={route.path} route={route} onNavigate={onNavigate} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function SubNavItem({ route, onNavigate }: { route: RouteDef; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const isActive = pathname === route.path;
  const Icon = route.icon;

  return (
    <li className="group/menu-item relative">
      <SidebarMenuSubButton asChild isActive={isActive}>
        <NavLink to={route.path} onClick={onNavigate}>
          {Icon && <Icon />}
          <span>{route.label}</span>
        </NavLink>
      </SidebarMenuSubButton>
    </li>
  );
}

// ─── Accordion key ───
const ACCORDION_KEY = 'rhino-sb-open-group';

function readOpenGroup(): string | null {
  try { return localStorage.getItem(ACCORDION_KEY); } catch { return null; }
}
function writeOpenGroup(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACCORDION_KEY, id);
    else localStorage.removeItem(ACCORDION_KEY);
  } catch { /* ignore */ }
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const permitidas = useRotasPermitidas();
  const { pathname } = useLocation();

  const topLevel = permitidas.filter(
    (r) => r.label && !r.group && r.path !== '/configuracao',
  );
  const configRoute = permitidas.find((r) => r.path === '/configuracao');

  const activeGroupId =
    (NAV_GROUPS.find((g) =>
      GROUP_ROUTES[g.id].some((r) => r.path === pathname),
    )?.id ?? null) as string | null;

  const [openGroupId, setOpenGroupId] = useState<string | null>(
    () => activeGroupId ?? readOpenGroup(),
  );

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
      className="flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 h-screen overflow-y-auto z-[100]"
      style={{ width: 'var(--sidebar-width)' }}
    >
      {/* Logo */}
      <SidebarHeader className="border-b border-sidebar-border pb-0 min-h-[60px] justify-center">
        <div className="flex items-center px-2 py-1">
          <img className="w-32 h-auto block" src="/assets/logo.png" alt="Rhino" />
        </div>
      </SidebarHeader>

      {/* Navegação */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {topLevel.map((route) => (
                <NavItem key={route.path} route={route} onNavigate={onNavigate} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleGroups.length > 0 && <SidebarSeparator />}

        {visibleGroups.map(({ group, items }) => (
          <SidebarGroup key={group.id} className="py-0 px-2">
            <SidebarGroupContent>
              <SidebarMenu>
                <NavGroupSection
                  group={group}
                  items={items}
                  onNavigate={onNavigate}
                  open={openGroupId === group.id}
                  onToggle={() => toggleGroup(group.id)}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {configRoute && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <NavItem route={configRoute} onNavigate={onNavigate} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {/* Rodapé */}
      <SidebarFooter className="border-t border-sidebar-border pt-0">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Notificações */}
          </SidebarMenuItem>
        </SidebarMenu>
        <UserMenu />
      </SidebarFooter>
    </nav>
  );
}

function UserMenu() {
  const meQuery = useCurrentUser();
  const user = meQuery.data?.user;
  const perfil = usePerfilStore((s) => s.current);
  const clearPerfil = usePerfilStore((s) => s.clear);
  const logout = useLogout();

  async function handleLogout() {
    if (!window.confirm('Deseja sair?')) return;
    try { await logout.mutateAsync(); } catch { /* ignore */ }
    finally { clearPerfil(); location.reload(); }
  }

  if (!user) return null;

  const podeTrocarPerfil = !!perfil && !user?.nivelAcessoId;

  return (
    <div className="flex items-center gap-1 px-1">
      <NotificacoesBell />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={logout.isPending}
            aria-label="Menu do usuário"
            className={cn(
              'flex flex-1 items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-sm outline-none ring-sidebar-ring transition-colors',
              'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              'focus-visible:ring-2 disabled:opacity-50',
            )}
          >
            <LogOut size={16} className="shrink-0" />
            <span className="flex-1 truncate text-left font-semibold">
              {user.name || user.email}
            </span>
            <ChevronsUpDown size={14} className="shrink-0 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{user.name || user.email}</span>
              {user.name && (
                <span className="text-xs text-muted-foreground">{user.email}</span>
              )}
            </div>
          </DropdownMenuLabel>
          {perfil && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-2 font-normal">
                <span style={{ fontSize: 16 }}>{perfil.icon}</span>
                <span style={{ color: perfil.cor, fontWeight: 600 }}>{perfil.label}</span>
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
    </div>
  );
}
