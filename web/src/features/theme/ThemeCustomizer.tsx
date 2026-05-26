import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import Button from '../../components/ui/button';
import { PRESETS } from './presets';
import { useTheme } from './useTheme';

/**
 * FAB + painel para personalizar o tema. Espelha o customizer do
 * js/themer.js antigo (mesmo CSS, classes .theme-customizer-fab/panel).
 * Some no mobile (regra CSS já existente).
 */
export default function ThemeCustomizer() {
  const { color, radius, setColor, setRadius, reset } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  // fechar ao clicar fora
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(t) &&
        fabRef.current &&
        !fabRef.current.contains(t)
      ) {
        setOpen(false);
      }
    }
    // delay para evitar capturar o próprio click que abriu o painel
    const id = window.setTimeout(() => {
      document.addEventListener('click', onDocClick);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', onDocClick);
    };
  }, [open]);

  const currentHex = color.toLowerCase();

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className="theme-customizer-fab"
        aria-label="Personalizar tema"
        title="Personalizar tema"
        onClick={() => setOpen((v) => !v)}
      >
        🎨
      </button>
      {open && (
        <div
          ref={panelRef}
          className="theme-customizer-panel"
          role="dialog"
          aria-label="Personalizar tema"
        >
          <h4>Personalizar tema</h4>
          <div className="theme-swatches">
            {PRESETS.map((p) => (
              <button
                key={p.hex}
                type="button"
                className={
                  'theme-swatch' +
                  (p.hex.toLowerCase() === currentHex ? ' is-active' : '')
                }
                style={{ background: p.hex }}
                title={p.name}
                aria-label={p.name}
                onClick={() => setColor(p.hex)}
              />
            ))}
          </div>
          <label>
            Raio de borda
            <input
              type="range"
              min={0}
              max={18}
              step={2}
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value, 10))}
            />
          </label>
          <Button
            type="button"
            size="sm"
            style={{ marginTop: 12, width: '100%' }}
            onClick={() => {
              reset();
              setOpen(false);
              toast('Tema padrão restaurado');
            }}
          >
            Restaurar padrão
          </Button>
        </div>
      )}
    </>
  );
}
