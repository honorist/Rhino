import { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import type { NavGroup, RouteDef } from '../../routes/config';
import { GROUP_ROUTES, NAV_GROUPS, ROUTES } from '../../routes/config';
import { podeAcessar, usePerfilStore } from '../../features/auth/perfilStore';
import { useCurrentUser, useLogout } from '../../features/auth/queries';
import NotificacoesBell from '../../features/recrutamento/NotificacoesBell';

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

const APP_VERSION = '2.0.0-react';

interface SidebarProps {
  /** Chamado ao clicar em qualquer item — fecha o drawer no mobile. */
  onNavigate: () => void;
}

// ─── Persistência do estado aberto/fechado dos grupos ───
function groupStorageKey(id: string): string {
  return `rhino-group-${id}`;
}

function readGroupOpen(id: string): boolean {
  try {
    return JSON.parse(localStorage.getItem(groupStorageKey(id)) ?? 'false') === true;
  } catch {
    return false;
  }
}

function writeGroupOpen(id: string, open: boolean): void {
  try {
    localStorage.setItem(groupStorageKey(id), JSON.stringify(open));
  } catch {
    /* localStorage indisponível — ignora silenciosamente */
  }
}

// ─── Item de navegação (link) ───
function NavItem({ route, onNavigate }: { route: RouteDef; onNavigate: () => void }) {
  const Icon = route.icon;
  return (
    <li className="nav-item">
      <NavLink
        to={route.path}
        className={({ isActive }) => (isActive ? 'active' : undefined)}
        onClick={onNavigate}
      >
        <span className="nav-icon">{Icon ? <Icon size={18} /> : null}</span>
        <span className="nav-label">{route.label}</span>
      </NavLink>
    </li>
  );
}

// ─── Grupo colapsável ───
function NavGroupSection({
  group,
  items,
  onNavigate,
}: {
  group: NavGroup;
  items: RouteDef[];
  onNavigate: () => void;
}) {
  const { pathname } = useLocation();
  const hasActiveChild = items.some((route) => route.path === pathname);
  const [open, setOpen] = useState(() => readGroupOpen(group.id) || hasActiveChild);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    writeGroupOpen(group.id, next);
  };

  const GroupIcon = group.icon;

  return (
    <li className="nav-group-item">
      <button
        type="button"
        className={hasActiveChild ? 'nav-group-header active' : 'nav-group-header'}
        onClick={toggle}
        aria-expanded={open}
      >
        <span className="nav-icon">
          <GroupIcon size={18} />
        </span>
        <span className="nav-group-label">{group.label}</span>
        <span className={open ? 'nav-group-arrow open' : 'nav-group-arrow'}>
          <ChevronRight size={16} />
        </span>
      </button>
      <ul className={open ? 'nav-group-children open' : 'nav-group-children'}>
        {items.map((route) => (
          <NavItem key={route.path} route={route} onNavigate={onNavigate} />
        ))}
      </ul>
    </li>
  );
}

/** Menu lateral — itens de topo, grupos colapsáveis e Configuração. */
export default function Sidebar({ onNavigate }: SidebarProps) {
  const permitidas = useRotasPermitidas();

  const topLevel = permitidas.filter(
    (route) => route.label && !route.group && route.path !== '/configuracao',
  );
  const configRoute = permitidas.find((route) => route.path === '/configuracao');

  // Para cada grupo, mostra só as rotas do grupo que o perfil pode acessar.
  // Grupo com zero filhos visíveis é omitido da sidebar.
  const visibleGroups = NAV_GROUPS.map((group) => ({
    group,
    items: GROUP_ROUTES[group.id].filter((r) =>
      permitidas.some((p) => p.path === r.path),
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <nav id="sidebar" aria-label="Menu principal">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img className="sidebar-logo-img" src="/assets/logo.png" alt="Rhino" />
        </div>
      </div>

      <ul className="nav-links">
        {topLevel.map((route) => (
          <NavItem key={route.path} route={route} onNavigate={onNavigate} />
        ))}
        {visibleGroups.map(({ group, items }) => (
          <NavGroupSection
            key={group.id}
            group={group}
            items={items}
            onNavigate={onNavigate}
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
    <div className="sidebar-footer">
      {user && <NotificacoesBell />}
      {user && (
        <button
          id="btn-logout"
          type="button"
          className="theme-toggle-btn"
          onClick={handleLogout}
          disabled={logout.isPending}
          title={`Sair (${user.email})`}
          aria-label="Sair"
          style={{ marginBottom: 4 }}
        >
          <span className="theme-toggle-icon">
            <LogOut size={16} />
          </span>
          <span style={{ fontWeight: 600 }}>{user.name || user.email}</span>
          <span
            style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-text-muted)' }}
          >
            sair
          </span>
        </button>
      )}
      {perfil &&
        (podeTrocarPerfil ? (
          <button
            id="btn-trocar-perfil"
            type="button"
            className="theme-toggle-btn"
            onClick={() => clearPerfil()}
            title="Trocar perfil"
            style={{ marginBottom: 4 }}
          >
            <span className="theme-toggle-icon" style={{ fontSize: 18 }}>
              {perfil.icon}
            </span>
            <span style={{ color: perfil.cor, fontWeight: 600 }}>{perfil.label}</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 13,
                color: 'var(--color-text-muted)',
              }}
            >
              trocar
            </span>
          </button>
        ) : (
          <div
            className="theme-toggle-btn"
            title="Seu nível de acesso"
            style={{ marginBottom: 4, cursor: 'default' }}
          >
            <span className="theme-toggle-icon" style={{ fontSize: 18 }}>
              {perfil.icon}
            </span>
            <span style={{ color: perfil.cor, fontWeight: 600 }}>{perfil.label}</span>
          </div>
        ))}
      <div className="sidebar-version">Rhino v{APP_VERSION}</div>
    </div>
  );
}
