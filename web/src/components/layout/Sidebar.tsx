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
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '../ui/sidebar';
import type { NavGroup, RouteDef } from '../../routes/config';
import { GROUP_ROUTES, NAV_GROUPS, ROUTES } from '../../routes/config';
import { podeAcessar, usePerfilStore } from '../../features/auth/perfilStore';
import { useCurrentUser, useLogout } from '../../features/auth/queries';
import NotificacoesBell from '../../features/recrutamento/NotificacoesBell';
import { cn } from '@/lib/cn';

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '?';

function useRotasPermitidas(): RouteDef[] {
  const perfil = usePerfilStore((s) => s.current);
  return useMemo(
    () => ROUTES.filter((r) => podeAcessar(perfil, '#' + r.path)),
    [perfil],
  );
}

// ─── NavItem ─────────────────────────────────────────────────────────────────

function NavItem({ route }: { route: RouteDef }) {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const isActive = pathname === route.path;
  const Icon = route.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <NavLink to={route.path} onClick={() => setOpenMobile(false)}>
          {Icon && <Icon />}
          <span>{route.label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ─── NavGroupSection ─────────────────────────────────────────────────────────

function NavGroupSection({
  group,
  items,
  open,
  onToggle,
}: {
  group: NavGroup;
  items: RouteDef[];
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
          <SidebarMenuButton isActive={hasActiveChild} className="justify-between">
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
              <SubNavItem key={route.path} route={route} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

// ─── SubNavItem ───────────────────────────────────────────────────────────────

function SubNavItem({ route }: { route: RouteDef }) {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const isActive = pathname === route.path;
  const Icon = route.icon;

  return (
    <li>
      <SidebarMenuSubButton asChild isActive={isActive}>
        <NavLink to={route.path} onClick={() => setOpenMobile(false)}>
          {Icon && <Icon />}
          <span>{route.label}</span>
        </NavLink>
      </SidebarMenuSubButton>
    </li>
  );
}

// ─── Accordion ───────────────────────────────────────────────────────────────

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

// ─── AppSidebar ───────────────────────────────────────────────────────────────

export default function AppSidebar() {
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
    <Sidebar collapsible="icon">
      {/* Logo */}
      <SidebarHeader className="border-b border-sidebar-border py-3">
        <div className="flex items-center px-2">
          <img
            className="w-32 h-auto block group-data-[collapsible=icon]:hidden"
            src="/assets/logo.png"
            alt="Rhino"
          />
          <img
            className="hidden size-7 group-data-[collapsible=icon]:block"
            src="/assets/favicon.svg"
            alt="Rhino"
          />
        </div>
      </SidebarHeader>

      {/* Navegação */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {topLevel.map((route) => (
                <NavItem key={route.path} route={route} />
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
                  <NavItem route={configRoute} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {/* Rodapé */}
      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu />
        <div className="px-2 pb-1 text-[10px] text-sidebar-foreground/40 select-none group-data-[collapsible=icon]:hidden">
          v{APP_VERSION}
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

// ─── UserMenu ────────────────────────────────────────────────────────────────

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
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center gap-1">
          <NotificacoesBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">{user.name || user.email}</span>
                  {user.name && (
                    <span className="truncate text-xs text-sidebar-foreground/60">{user.email}</span>
                  )}
                </div>
                <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50 group-data-[collapsible=icon]:hidden" />
                <LogOut className="size-4 shrink-0 hidden group-data-[collapsible=icon]:block" />
              </SidebarMenuButton>
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
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
