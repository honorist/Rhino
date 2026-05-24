import { useEffect, useRef, useState } from 'react';
import { CONTEUDOS, SECOES } from './manualContent';
import './manual.css';

/**
 * Manual do Usuário — porte de js/views/Manual.js.
 * Renderiza o conteúdo HTML das seções (mantido como string, igual ao vanilla)
 * e roda o Mermaid sobre os blocos `<pre class="mermaid">` após cada troca de
 * seção. Mermaid é carregado via import dinâmico (code-split).
 */
export default function Manual() {
  const [secao, setSecao] = useState<string>('inicio');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (!contentRef.current) return;
      try {
        const mermaid = (await import('mermaid')).default;
        if (cancelado) return;
        const nodes = contentRef.current.querySelectorAll<HTMLElement>(
          'pre.mermaid:not([data-processed])',
        );
        if (nodes.length === 0) return;
        nodes.forEach((el, i) => {
          el.id = `mmd-${secao}-${i}-${Date.now()}`;
          el.removeAttribute('data-processed');
        });
        await mermaid.run({ nodes });
      } catch {
        /* mermaid opcional — falha silenciosa */
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [secao]);

  const html = CONTEUDOS[secao] ?? CONTEUDOS.inicio;

  return (
    <div className="man-root">
      <div className="page-header">
        <div>
          <h1 className="page-title">📖 Manual do Usuário</h1>
          <p className="page-subtitle">Guia completo do sistema com fluxogramas</p>
        </div>
      </div>

      <div className="man-layout">
        <div className="man-menu">
          {SECOES.map((s) => (
            <button
              key={s.k}
              type="button"
              className={`man-menu-item${secao === s.k ? ' active' : ''}`}
              onClick={() => setSecao(s.k)}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div
          ref={contentRef}
          className="man-content"
          // Conteúdo do manual é estático e parte do bundle (não vem de usuário).
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
