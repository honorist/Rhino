import { useEffect, useState } from 'react';
import { shouldAutoStart } from './tourSteps';

/**
 * Dispara o tour para novos usuários após um pequeno delay (1.2s),
 * espelhando o auto-start de js/onboarding.js. Também expõe `start()`
 * para que telas de configuração possam forçar.
 */
export function useAutoStartTour() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!shouldAutoStart()) return;
    const id = window.setTimeout(() => setActive(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  return {
    active,
    start: () => setActive(true),
    stop: () => setActive(false),
  };
}
