import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import DataTable, { type Column } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/toast/ToastContext';
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
    <span className="badge" style={{ background: cfg.bg, color: cfg.cor }}>
      {label}
    </span>
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
    <span
      className="badge"
      title={v?.resumo ?? ''}
      style={{ background: cfg.bg, color: cfg.cor, fontWeight: 700 }}
    >
      {cfg.label}
      {score}
    </span>
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
  const toast = useToast();
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
        onSuccess: () => toast.show('Documento excluído', 'success'),
        onError: (e) => toast.show(e.message, 'danger'),
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
    <Modal
      open
      title={`Documentos — ${recurso?.nome ?? ''}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
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
    </Modal>
  );
}
