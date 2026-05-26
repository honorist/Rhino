import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

interface SpinnerProps {
  label?: string;
  /** Tamanho do ícone em px. Default 20. */
  size?: number;
  className?: string;
}

/**
 * Indicador de carregamento — agora com ícone animado (lucide Loader2).
 * Mantém a classe `loading-spinner` para compat com CSS legado e o
 * aria-live para acessibilidade.
 */
export default function Spinner({ label = 'Carregando...', size = 20, className }: SpinnerProps) {
  return (
    <div
      className={cn(
        'loading-spinner inline-flex items-center gap-2 text-muted-foreground',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="animate-spin" size={size} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
