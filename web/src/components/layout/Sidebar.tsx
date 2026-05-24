import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { NavGroup, RouteDef } from '../../routes/config';
import { GROUP_ROUTES, NAV_GROUPS, ROUTES } from '../../routes/config';

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
  onNavigate,
}: {
  group: NavGroup;
  onNavigate: () => void;
}) {
  const items = GROUP_ROUTES[group.id];
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
  const topLevel = ROUTES.filter(
    (route) => route.label && !route.group && route.path !== '/configuracao',
  );
  const configRoute = ROUTES.find((route) => route.path === '/configuracao');

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
        {NAV_GROUPS.map((group) => (
          <NavGroupSection key={group.id} group={group} onNavigate={onNavigate} />
        ))}
        {configRoute && <NavItem route={configRoute} onNavigate={onNavigate} />}
      </ul>

      <div className="sidebar-footer">
        <div className="sidebar-version">Rhino v{APP_VERSION}</div>
      </div>
    </nav>
  );
}
