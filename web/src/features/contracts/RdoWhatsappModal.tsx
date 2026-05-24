import { useEffect, useRef } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/toast/ToastContext';

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
  const toast = useToast();
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Seleciona o texto ao abrir, facilita Ctrl+A/C manual.
  useEffect(() => {
    taRef.current?.focus();
    taRef.current?.select();
  }, []);

  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast.show('Texto copiado! Cole no grupo do WhatsApp.', 'success');
    } catch {
      // Fallback: execCommand
      taRef.current?.focus();
      taRef.current?.select();
      try {
        document.execCommand('copy');
        toast.show('Texto copiado!', 'success');
      } catch {
        toast.show('Selecione o texto e copie com Ctrl+C.', 'info');
      }
    }
  }

  return (
    <Modal
      open
      title="💬 Resumo do RDO"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={handleCopiar}>📋 Copiar texto</Button>
        </>
      }
    >
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
    </Modal>
  );
}
