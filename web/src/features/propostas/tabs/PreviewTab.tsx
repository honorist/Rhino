import { useState } from 'react';
import Button from '../../../components/ui/button';
import Card from '../../../components/ui/card';
import type { EditorTabProps } from '../types';

/**
 * Aba Preview — renderiza a proposta como HTML timbrado num iframe.
 * O endpoint `/api/propostas/:id/preview` devolve o documento completo.
 */
export default function PreviewTab({ proposta }: EditorTabProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const src = `/api/propostas/${proposta.id}/preview${
    reloadKey > 0 ? `?t=${reloadKey}` : ''
  }`;

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '14px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <strong>Preview do documento</strong>
          <p className="text-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            Visualização do que será gerado em DOCX e PDF. Dados salvos
            automaticamente.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => setReloadKey(Date.now())}>
            ↻ Recarregar
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              window.open(`/api/propostas/${proposta.id}/preview`, '_blank')
            }
          >
            ↗ Abrir em nova aba
          </Button>
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          height: 'calc(100vh - 280px)',
          minHeight: 600,
          background: '#525659',
        }}
      >
        <iframe
          key={reloadKey}
          title="Preview da proposta"
          src={src}
          sandbox="allow-same-origin"
          style={{
            border: 'none',
            width: '100%',
            height: '100%',
            background: 'white',
          }}
        />
      </div>
    </Card>
  );
}
