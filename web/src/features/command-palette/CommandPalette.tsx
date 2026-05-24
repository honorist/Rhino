import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHighContrast } from '../../hooks/useHighContrast';
import { useUIStore } from '../../stores/uiStore';
import { buildCommandIndex, filterCommands, type CommandItem } from './commandIndex';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Paleta de comandos (Ctrl/Cmd+K). Porte da seção 4 de js/polish.js — busca
 * local + remota (M3, /api/search) com debounce implícito por token.
 */
export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const highContrast = useHighContrast();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<CommandItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef(0);

  // Itens locais (rotas + ações globais).
  const items = useMemo(
    () =>
      buildCommandIndex({
        navigate: (p) => {
          navigate(p);
          onClose();
        },
        toggleTheme,
        toggleHighContrast: highContrast.toggle,
      }),
    [navigate, toggleTheme, highContrast.toggle, onClose],
  );

  const local = useMemo(() => filterCommands(items, query), [items, query]);
  const filtered = useMemo(() => [...local, ...remote], [local, remote]);

  // Reset ao abrir.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setRemote([]);
      // Foca o input no próximo tick.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Mantém active dentro dos limites quando filtered muda.
  useEffect(() => {
    setActive((a) => (filtered.length ? Math.min(a, filtered.length - 1) : 0));
  }, [filtered.length]);

  // Busca remota — só dispara com query >= 2 chars.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setRemote([]);
      return;
    }
    const myToken = ++tokenRef.current;
    (async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          credentials: 'same-origin',
        });
        if (!r.ok) return;
        const j = (await r.json()) as {
          results?: Array<{ kind: string; title: string; hint?: string; hash?: string; path?: string }>;
        };
        if (myToken !== tokenRef.current) return; // outra busca chegou
        const items: CommandItem[] = (j.results ?? []).map((res) => ({
          icon: '◇',
          label: `${res.kind}: ${res.title}`,
          hint: res.hint ?? '',
          run: () => {
            // Backend ainda devolve `hash` (#/x) por compatibilidade — converte
            // para path-based no React.
            const path = res.path ?? (res.hash ? res.hash.replace(/^#/, '') : '/');
            navigate(path);
            onClose();
          },
        }));
        setRemote(items);
      } catch {
        /* offline / 401 — silencioso */
      }
    })();
  }, [open, query, navigate, onClose]);

  // Atalhos do teclado quando aberto.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (filtered.length ? (a + 1) % filtered.length : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) =>
          filtered.length ? (a - 1 + filtered.length) % filtered.length : 0,
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const it = filtered[active];
        if (it) {
          try {
            it.run();
          } catch (err) {
            console.error(err);
          }
        }
        return;
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, filtered, active, onClose]);

  if (!open) return null;

  return (
    <div
      className="cmdk-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar e navegar"
      >
        <div className="cmdk-input-wrap">
          <span className="cmdk-input-wrap__icon">⌕</span>
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            placeholder="Buscar contratos, clientes, NFs, telas… (/ ou ⌘K)"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="cmdk-kbd">esc</kbd>
        </div>
        <div className="cmdk-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="cmdk-empty">Nada encontrado</div>
          ) : (
            filtered.map((it, i) => (
              <div
                key={`${it.label}-${i}`}
                className={'cmdk-item' + (i === active ? ' is-active' : '')}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  try {
                    it.run();
                  } catch (err) {
                    console.error(err);
                  }
                }}
              >
                <span className="cmdk-item__icon">{it.icon || '·'}</span>
                <span className="cmdk-item__label">{it.label}</span>
                <span className="cmdk-item__hint">{it.hint}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
