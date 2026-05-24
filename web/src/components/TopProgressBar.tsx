import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

/**
 * Barra fininha no topo que reage a queries/mutations do react-query.
 * Porte da seção 10 (Top progress bar) de js/polish.js — antes acoplada
 * ao Store.loading; agora derivada nativamente do react-query.
 *
 * Estado é-loading? `is-loading`. Voltou a 0? `is-done` por 600 ms. Mount
 * inicial sem fetch não pisca a barra — só vira `is-done` na transição.
 */
export default function TopProgressBar() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const loading = fetching > 0 || mutating > 0;
  const wasLoadingRef = useRef<boolean>(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true;
      setDone(false);
      return undefined;
    }
    if (!wasLoadingRef.current) {
      // Mount inicial sem nada carregando — barra invisível
      return undefined;
    }
    wasLoadingRef.current = false;
    setDone(true);
    const id = window.setTimeout(() => setDone(false), 600);
    return () => window.clearTimeout(id);
  }, [loading]);

  const cls = loading ? 'is-loading' : done ? 'is-done' : '';
  return (
    <div id="rh-progress" className={cls}>
      <div className="rh-progress__fill" />
    </div>
  );
}
