import { useState } from 'react';
import Button from '../../components/ui/Button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import Spinner from '../../components/ui/Spinner';
import DataTable, { type Column } from '../../components/ui/DataTable';
import { toast } from 'sonner';
import { formatDateBR } from '../../lib/formatDate';
import type { Documento } from '../../types/domain';
import { useRecursos } from '../resources';
import { diasRestantes, statusDoc, type DocStatus } from './conformidade';
import { useDeleteDocumento } from './queries';
import DocumentoFormModal from './DocumentoFormModal';
import ValidacaoModal from './ValidacaoModal';

const STATUS_CFG: Record<DocStatus, { bg: string; cor: string }> = {
  vigente: { bg: '#D1FAE5', cor: '#065F46' },
  vencendo: { bg: '#FEF3C7', cor: '#92400E' },
  vencido: { bg: '#FEE2E2', cor: '#991B1B' },
  pendente: { bg: '#F3F4F6', cor: '#6B7280' },
};

const VALIDACAO_CFG: Record<string, { bg: string; cor: string; label: string }> = {
  conforme: { bg: '#D1FAE5', cor: '#065F46', label: '✅ Conforme' },
  parcial: { bg: '#FEF3C7', cor: '#92400E', label: '⚠️ Parcial' },
  nao_conforme: { bg: '#FEE2E2', cor: '#991B1B', label: '❌ Não conforme' },
  nao_validado: { bg: '#F3F4F6', cor: '#6B7280', label: '⏳ Não validado' },
};

function StatusBadge({ doc }: { doc: Documento }) {
  const status = statusDoc(doc);
  const dias = diasRestantes(doc);
  const cfg = STATUS_CFG[status];
  const label =
    status === 'vencendo' && dias !== null
      ? `Vence em ${dias}d`
      : status === 'vencido' && dias !== null
        ? `Vencido há ${Math.abs(dias)}d`
        : status === 'vigente'
          ? 'Vigente'
          : 'Pendente';
  return (
    <Badge style={{ background: cfg.bg, color: cfg.cor }}>
      {label}
    </Badge>
  );
}

function ValidacaoBadge({ doc }: { doc: Documento }) {
  if (!doc.templateId) {
    return (
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>—</span>
    );
  }
  const v = doc.validacao;
  const cfg = VALIDACAO_CFG[v?.status ?? 'nao_validado'] ?? VALIDACAO_CFG.nao_validado;
  const score = v?.score != null ? ` ${v.score}%` : '';
  return (
    <Badge
      title={v?.resumo ?? ''}
      style={{ background: cfg.bg, color: cfg.cor, fontWeight: 700 }}
    >
      {cfg.label}
      {score}
    </Badge>
  );
}

type SubModal =
  | { tipo: 'form'; doc: Documento | null }
  | { tipo: 'validacao'; docId: string }
  | null;

interface DocumentosModalProps {
  recursoId: string;
  onClose: () => void;
}

/** Modal com a lista de documentos de um colaborador. */
export default function DocumentosModal({
  recursoId,
  onClose,
}: DocumentosModalProps) {
  const recursosQuery = useRecursos();
  const deletar = useDeleteDocumento();
  const [sub, setSub] = useState<SubModal>(null);

  const recurso = (recursosQuery.data ?? []).find((r) => r.id === recursoId);
  const docs = recurso?.documentos ?? [];

  function handleExcluir(docId: string) {
    if (!window.confirm('Excluir este documento?')) return;
    deletar.mutate(
      { recursoId, docId },
      {
        onSuccess: () => toast.success('Documento excluído'),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const columns: Column<Documento>[] = [
    {
      header: 'Tipo',
      cell: (d) => <strong>{d.tipoLabel || d.tipo}</strong>,
    },
    { header: 'Emissão', cell: (d) => formatDateBR(d.dataEmissao) },
    { header: 'Validade', cell: (d) => formatDateBR(d.dataVencimento) },
    { header: 'Status', cell: (d) => <StatusBadge doc={d} /> },
    { header: 'Validação IA', cell: (d) => <ValidacaoBadge doc={d} /> },
    { header: 'Responsável', cell: (d) => d.responsavel || '—' },
    {
      header: 'Ações',
      cell: (d) => (
        <div className="actions-cell">
          {d.templateId && (
            <a
              className="action-link"
              style={{ cursor: 'pointer' }}
              onClick={() => setSub({ tipo: 'validacao', docId: d.id })}
            >
              Ver validação
            </a>
          )}
          <a
            className="action-link"
            style={{ cursor: 'pointer' }}
            onClick={() => setSub({ tipo: 'form', doc: d })}
          >
            Editar
          </a>
          <a
            className="action-link danger"
            style={{ cursor: 'pointer' }}
            onClick={() => handleExcluir(d.id)}
          >
            Excluir
          </a>
        </div>
      ),
    },
  ];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{`Documentos — ${recurso?.nome ?? ''}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {!recurso ? (
        <Spinner label="Carregando..." />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--sp-md)',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 15,
                color: 'var(--color-text-muted)',
              }}
            >
              {recurso.profissao ?? ''}
            </p>
            <Button onClick={() => setSub({ tipo: 'form', doc: null })}>
              + Adicionar Documento
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={docs}
            rowKey={(d) => d.id}
            emptyMessage="Nenhum documento cadastrado"
          />
        </>
      )}

      {sub?.tipo === 'form' && (
        <DocumentoFormModal
          recursoId={recursoId}
          doc={sub.doc}
          onClose={() => setSub(null)}
        />
      )}
      {sub?.tipo === 'validacao' && (
        <ValidacaoModal
          recursoId={recursoId}
          docId={sub.docId}
          onClose={() => setSub(null)}
        />
      )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
