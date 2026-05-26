import { useEffect, useRef } from 'react';
import Button from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { toast } from 'sonner';

interface RdoWhatsappModalProps {
  /** Texto pronto pra colar no grupo da obra. */
  texto: string;
  onClose: () => void;
}

/**
 * Modal "💬 Resumo do RDO" — porte da janela WhatsApp em js/views/contrato/rdos.js
 * (linhas ~407-450). Mostra textarea read-only + botão Copiar.
 */
export default function RdoWhatsappModal({ texto, onClose }: RdoWhatsappModalProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Seleciona o texto ao abrir, facilita Ctrl+A/C manual.
  useEffect(() => {
    taRef.current?.focus();
    taRef.current?.select();
  }, []);

  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Texto copiado! Cole no grupo do WhatsApp.');
    } catch {
      // Fallback: execCommand
      taRef.current?.focus();
      taRef.current?.select();
      try {
        document.execCommand('copy');
        toast.success('Texto copiado!');
      } catch {
        toast('Selecione o texto e copie com Ctrl+C.');
      }
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>💬 Resumo do RDO</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p
            style={{
              fontSize: 13,
              color: 'var(--color-text-muted)',
              margin: '0 0 8px',
            }}
          >
            Copie o texto e cole no grupo da obra no WhatsApp.
          </p>
          <textarea
            ref={taRef}
            readOnly
            value={texto}
            style={{
              width: '100%',
              height: 280,
              fontFamily: 'inherit',
              fontSize: 14,
              lineHeight: 1.55,
              padding: 10,
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              resize: 'vertical',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={handleCopiar}>📋 Copiar texto</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
