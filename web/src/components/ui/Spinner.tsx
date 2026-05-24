interface SpinnerProps {
  label?: string;
}

/** Indicador de carregamento — classe .loading-spinner do CSS atual. */
export default function Spinner({ label = 'Carregando...' }: SpinnerProps) {
  return (
    <div className="loading-spinner" role="status" aria-live="polite">
      {label}
    </div>
  );
}
