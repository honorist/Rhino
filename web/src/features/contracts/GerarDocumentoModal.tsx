import { useState } from 'react';
import Button from '../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import FormField from '../../components/ui/FormField';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '../../components/ui/combobox';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import { useDocTemplates } from '../documentos/queries';
import type { Contract } from './types';

/** Substitui as variáveis {{...}} do template pelos dados do contrato. */
function preencherVariaveis(body: string, contract: Contract): string {
  const mapa: Record<string, string> = {
    cliente: contract.client ?? '',
    contrato: contract.name ?? '',
    numero: contract.contractNumber ?? '',
    valor: formatBRL(Number(contract.value) || 0),
    inicio: formatDateBR(contract.startDate),
    fim: formatDateBR(contract.endDate),
    data: new Date().toLocaleDateString('pt-BR'),
    endereco: contract.endereco ?? '',
  };
  return body.replace(/\{\{(\w+)\}\}/gi, (m, chave: string) => {
    const v = mapa[chave.toLowerCase()];
    return v !== undefined ? v : m;
  });
}

async function gerarPdf(nome: string, conteudo: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const linhas = doc.splitTextToSize(conteudo, 170);
  let y = 25;
  for (const linha of linhas) {
    if (y > 270) {
      doc.addPage();
      y = 25;
    }
    doc.text(linha, 20, y);
    y += 6;
  }
  doc.save(`${nome.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}

interface GerarDocumentoModalProps {
  contract: Contract;
  onClose: () => void;
}

/** Gera um documento do contrato a partir de um template — porte de showModalGerarDocumento. */
export default function GerarDocumentoModal({
  contract,
  onClose,
}: GerarDocumentoModalProps) {
  const toast = useToast();
  const templatesQuery = useDocTemplates();
  const templates = (templatesQuery.data ?? []).filter((t) => t.body);

  const [templateId, setTemplateId] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [gerando, setGerando] = useState(false);

  function selecionar(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    setConteudo(
      tpl ? preencherVariaveis(String(tpl.body ?? ''), contract) : '',
    );
  }

  async function handleGerar() {
    if (!conteudo.trim()) {
      toast.show('Selecione um template', 'warning');
      return;
    }
    const tpl = templates.find((t) => t.id === templateId);
    setGerando(true);
    try {
      await gerarPdf(String(tpl?.nome ?? 'documento'), conteudo);
      toast.show('PDF gerado', 'success');
      onClose();
    } catch {
      toast.show('Falha ao gerar o PDF', 'danger');
    } finally {
      setGerando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>📋 Gerar Documento do Contrato</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {templates.length === 0 ? (
            <p className="text-muted">
              Nenhum template com corpo de texto. Crie um em Configurações →
              Templates.
            </p>
          ) : (
            <>
              <FormField label="Template" htmlFor="gd-tpl">
                <Combobox
                  id="gd-tpl"
                  options={templates.map((t) => ({ value: t.id, label: String(t.nome ?? '') }))}
                  value={templateId}
                  onChange={selecionar}
                  placeholder="— Selecione —"
                  searchPlaceholder="Pesquisar template..."
                  emptyText="Nenhum template encontrado."
                />
              </FormField>
              <FormField
                label="Pré-visualização (variáveis já substituídas)"
                htmlFor="gd-prev"
                helper="Variáveis: {{cliente}} {{contrato}} {{numero}} {{valor}} {{inicio}} {{fim}} {{data}} {{endereco}}"
              >
                <Textarea
                  id="gd-prev"
                  rows={12}
                  value={conteudo}
                  onChange={(e) => setConteudo(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
              </FormField>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={gerando}>
            Cancelar
          </Button>
          <Button onClick={handleGerar} disabled={gerando}>
            {gerando ? 'Gerando…' : '📄 Gerar PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
