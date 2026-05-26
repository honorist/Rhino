import * as React from 'react';
import { PanelLeftIcon } from 'lucide-react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/cn';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from './sheet';
import Button from './button';

// ─── Constants ───────────────────────────────────────────────────────────────

const SIDEBAR_COOKIE_NAME = 'sidebar_state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_MOBILE = '18rem';
const SIDEBAR_WIDTH_ICON = '3rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';
const MOBILE_BREAKPOINT = 768;

// ─── useIsMobile ─────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

// ─── Context ─────────────────────────────────────────────────────────────────

type SidebarContextProps = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used inside SidebarProvider');
  return ctx;
}

// ─── SidebarProvider ─────────────────────────────────────────────────────────

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  const [_open, _setOpen] = React.useState(() => {
    try {
      const c = document.cookie
        .split(';')
        .find((s) => s.trim().startsWith(SIDEBAR_COOKIE_NAME + '='));
      if (c) return c.split('=')[1].trim() === 'true';
    } catch { /**/ }
    return defaultOpen;
  });

  const open = openProp ?? _open;

  const setOpen = React.useCallback(
    (value: boolean | ((v: boolean) => boolean)) => {
      const next = typeof value === 'function' ? value(open) : value;
      if (setOpenProp) setOpenProp(next);
      else _setOpen(next);
      try {
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${next}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
      } catch { /**/ }
    },
    [open, setOpenProp],
  );

  const toggleSidebar = React.useCallback(
    () => (isMobile ? setOpenMobile((v) => !v) : setOpen((v) => !v)),
    [isMobile, setOpen],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === SIDEBAR_KEYBOARD_SHORTCUT && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  const state = open ? 'expanded' : 'collapsed';

  const ctx = React.useMemo<SidebarContextProps>(
    () => ({ state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }),
    [state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={ctx}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            '--sidebar-width': SIDEBAR_WIDTH,
            '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn('group/sidebar-wrapper flex min-h-screen w-full', className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'offcanvas',
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'left' | 'right';
  variant?: 'sidebar' | 'floating' | 'inset';
  collapsible?: 'offcanvas' | 'icon' | 'none';
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === 'none') {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          'bg-sidebar text-sidebar-foreground flex h-full flex-col',
          className,
        )}
        style={{ width: 'var(--sidebar-width)' }}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          side={side}
          className={cn('bg-sidebar text-sidebar-foreground p-0 [&>button]:hidden', className)}
          style={{ width: SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}
          {...props}
        >
          <SheetTitle className="sr-only">Navegação</SheetTitle>
          <SheetDescription className="sr-only">Menu lateral</SheetDescription>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  const isCollapsed = state === 'collapsed';
  const iconWidth = 'var(--sidebar-width-icon)';
  const fullWidth = 'var(--sidebar-width)';

  return (
    <div
      className="text-sidebar-foreground group peer hidden md:block"
      data-state={state}
      data-collapsible={isCollapsed ? collapsible : ''}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* Gap div — reserva espaço no flex container */}
      <div
        data-slot="sidebar-gap"
        style={{
          width:
            isCollapsed && collapsible === 'offcanvas'
              ? 0
              : isCollapsed && collapsible === 'icon'
                ? iconWidth
                : fullWidth,
          transition: 'width 200ms linear',
        }}
      />
      {/* Fixed panel */}
      <div
        className={cn(
          'fixed inset-y-0 z-10 hidden h-screen flex-col md:flex',
          side === 'left' ? 'left-0' : 'right-0',
          variant !== 'floating' && variant !== 'inset' && side === 'left' && 'border-r border-sidebar-border',
          variant !== 'floating' && variant !== 'inset' && side === 'right' && 'border-l border-sidebar-border',
          variant === 'floating' && 'rounded-lg border border-sidebar-border shadow-sm m-2',
          className,
        )}
        style={{
          width:
            isCollapsed && collapsible === 'offcanvas'
              ? 0
              : isCollapsed && collapsible === 'icon'
                ? iconWidth
                : fullWidth,
          [side === 'left' ? 'left' : 'right']:
            isCollapsed && collapsible === 'offcanvas'
              ? `calc(${fullWidth} * -1)`
              : 0,
          transition: 'left 200ms linear, right 200ms linear, width 200ms linear',
          overflow: 'hidden',
        }}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          className="bg-sidebar flex h-full w-full flex-col overflow-hidden"
          style={{ width: fullWidth }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── SidebarTrigger ──────────────────────────────────────────────────────────

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      data-slot="sidebar-trigger"
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      className={cn('size-7', className)}
      onClick={(e) => {
        onClick?.(e);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Alternar menu</span>
    </Button>
  );
}

// ─── SidebarRail ─────────────────────────────────────────────────────────────

export function SidebarRail({ className, ...props }: React.ComponentProps<'button'>) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      data-slot="sidebar-rail"
      aria-label="Alternar menu lateral"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Alternar menu"
      className={cn(
        'absolute inset-y-0 z-20 hidden w-4 cursor-col-resize transition-colors sm:flex',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:bg-sidebar-border after:opacity-0 hover:after:opacity-100',
        '-right-2',
        className,
      )}
      {...props}
    />
  );
}

// ─── SidebarInset ─────────────────────────────────────────────────────────────

export function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn('bg-background relative flex min-h-screen flex-1 flex-col overflow-hidden', className)}
      {...props}
    />
  );
}

// ─── Header / Footer / Content / Separator ───────────────────────────────────

export function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden', className)}
      {...props}
    />
  );
}

export function SidebarSeparator({ className, ...props }: React.ComponentProps<'hr'>) {
  return (
    <hr
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn('mx-2 my-1 w-auto border-sidebar-border', className)}
      {...props}
    />
  );
}

// ─── Group ────────────────────────────────────────────────────────────────────

export function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'div';
  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        'text-sidebar-foreground/70 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-none transition-opacity duration-200',
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn('w-full text-sm', className)}
      {...props}
    />
  );
}

// ─── Menu ─────────────────────────────────────────────────────────────────────

export function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn('group/menu-item relative', className)}
      {...props}
    />
  );
}

// ─── MenuButton ──────────────────────────────────────────────────────────────

const menuButtonBase =
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md px-2 outline-none ring-sidebar-ring transition-colors focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 [&>span:last-child]:truncate hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-semibold';

const menuButtonSizes: Record<string, string> = {
  default: 'h-8 text-sm py-1.5',
  sm: 'h-7 text-xs py-1',
  lg: 'h-12 text-sm',
};

interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  isActive?: boolean;
  size?: 'default' | 'sm' | 'lg';
}

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ asChild = false, isActive = false, size = 'default', className, ...props }, ref) => {
    const Comp = asChild ? (Slot as React.ElementType) : 'button';
    return (
      <Comp
        ref={ref}
        data-slot="sidebar-menu-button"
        data-sidebar="menu-button"
        data-active={isActive}
        className={cn(menuButtonBase, menuButtonSizes[size], className)}
        {...props}
      />
    );
  },
);
SidebarMenuButton.displayName = 'SidebarMenuButton';

// ─── MenuBadge ───────────────────────────────────────────────────────────────

export function SidebarMenuBadge({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        'text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium select-none tabular-nums',
        className,
      )}
      {...props}
    />
  );
}

// ─── Sub Menu ────────────────────────────────────────────────────────────────

export function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        'border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5',
        className,
      )}
      {...props}
    />
  );
}

interface SidebarMenuSubButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  asChild?: boolean;
  isActive?: boolean;
  size?: 'sm' | 'md';
}

export const SidebarMenuSubButton = React.forwardRef<HTMLAnchorElement, SidebarMenuSubButtonProps>(
  ({ asChild = false, isActive = false, size = 'md', className, ...props }, ref) => {
    const Comp = asChild ? (Slot as React.ElementType) : 'a';
    return (
      <Comp
        ref={ref}
        data-slot="sidebar-menu-sub-button"
        data-sidebar="menu-sub-button"
        data-active={isActive}
        className={cn(
          'text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-7 min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 [&>span]:truncate',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
          size === 'sm' && 'text-xs',
          size === 'md' && 'text-sm',
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarMenuSubButton.displayName = 'SidebarMenuSubButton';
