import type { ReactNode } from 'react';

interface EmptyStateProps {
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
}

/** Estado vazio de listas/tabelas — classe .empty-state do CSS atual. */
export default function EmptyState({ message, icon, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon}
      <p>{message}</p>
      {action}
    </div>
  );
}
