import { useEffect, useState } from 'react';

/**
 * Botão "voltar ao topo" que aparece após rolar o conteúdo.
 * Porte da seção 6 de js/polish.js. Observa `#app` se existir, senão window.
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const app = document.getElementById('app');
    const target: HTMLElement | Window = app ?? window;
    const getY = () =>
      target instanceof Window ? window.scrollY : (target as HTMLElement).scrollTop;

    const onScroll = () => setVisible(getY() > 480);
    target.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => target.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  const onClick = () => {
    const app = document.getElementById('app');
    if (app) app.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      className="rh-back-top is-visible"
      aria-label="Voltar ao topo"
      onClick={onClick}
    >
      ↑
    </button>
  );
}
