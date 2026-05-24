import { useEffect, useMemo, useState } from 'react';
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
    <li className="nav-group-item">
      <button
        type="button"
        className={hasActiveChild ? 'nav-group-header active' : 'nav-group-header'}
        onClick={onToggle}
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
