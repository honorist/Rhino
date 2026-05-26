import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/cn';

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar="header"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar="footer"
      className={cn('flex flex-col gap-2 p-2 mt-auto', className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar="content"
      className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto', className)}
      {...props}
    />
  );
}

export function SidebarSeparator({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return (
    <hr
      data-sidebar="separator"
      className={cn('mx-2 my-1 border-sidebar-border', className)}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar="group"
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar="group-label"
      className={cn(
        'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opacity] duration-200 ease-in-out',
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar="group-content"
      className={cn('w-full text-sm', className)}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      data-sidebar="menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      data-sidebar="menu-item"
      className={cn('group/menu-item relative', className)}
      {...props}
    />
  );
}

// ─── Menu Button ───

const menuButtonBase =
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md px-2 outline-none ring-sidebar-ring transition-colors focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 [&>span:last-child]:truncate';

const menuButtonVariants = {
  default:
    'h-8 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-semibold',
  sm: 'h-7 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium',
  lg: 'h-12 py-2 text-base text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-semibold',
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
        data-active={isActive}
        className={cn(menuButtonBase, menuButtonVariants[size], className)}
        {...props}
      />
    );
  },
);
SidebarMenuButton.displayName = 'SidebarMenuButton';

// ─── Sub Menu (nested items with border-l) ───

export function SidebarMenuSub({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      data-sidebar="menu-sub"
      className={cn(
        'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
        className,
      )}
      {...props}
    />
  );
}

interface SidebarMenuSubButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  asChild?: boolean;
  isActive?: boolean;
}

export const SidebarMenuSubButton = React.forwardRef<HTMLAnchorElement, SidebarMenuSubButtonProps>(
  ({ asChild = false, isActive = false, className, ...props }, ref) => {
    const Comp = asChild ? (Slot as React.ElementType) : 'a';
    return (
      <Comp
        ref={ref}
        data-active={isActive}
        className={cn(
          'flex h-7 min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-xs text-sidebar-foreground outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-3.5 [&>svg]:shrink-0 [&>span]:truncate',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarMenuSubButton.displayName = 'SidebarMenuSubButton';
