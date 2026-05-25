import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import FormField from '../../../components/ui/FormField';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../../components/ui/dialog';
import Spinner from '../../../components/ui/Spinner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { useToast } from '../../../components/ui/toast/ToastContext';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import type { DocTemplate } from '../../../types/domain';

interface TemplatesResponse {
  templates?: DocTemplate[];
  doc_templates?: DocTemplate[];
}

/**
 * Seção "Templates de Docs" — porte de renderDocTemplates() em
 * js/views/Configuracao.js. CRUD simples de modelos usados no upload de
 * documentos dos colaboradores (ASO, NR-10, ART, etc).
 */
export default function DocTemplatesSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.docTemplates,
    queryFn: () => api.get<TemplatesResponse>('/api/doc-templates'),
  });
  const templates = data?.templates ?? data?.doc_templates ?? [];

  const [modal, setModal] = useState<{ template: DocTemplate | null } | null>(null);

  const remover = useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/api/doc-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.docTemplates });
      toast.show('Template removido', 'success');
    },
    onError: (e) => toast.show(e.message, 'danger'),
  });

  if (isLoading) return <Spinner label="Carregando templates…" />;

  return (
    <>
      <div className="page-header" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            📋 Templates de Documentos
          </h2>
          <p className="page-subtitle">
            Modelos (ASO, NR-10, ART...) usados no cadastro de documentos
          </p>
        </div>
        <Button onClick={() => setModal({ template: null })}>+ Novo Template</Button>
      </div>

      <Card style={{ padding: 0 }}>
        {templates.length === 0 ? (
          <p className="text-muted" style={{ padding: 'var(--sp-lg)' }}>
            Nenhum template cadastrado.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={th()}>Nome</th>
                  <th style={th()}>Validade</th>
                  <th style={th()}>Checklist</th>
                  <th style={th()}></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <td style={td()}>
                      <strong>{(t as { label?: string }).label ?? t.nome ?? '—'}</strong>
                    </td>
                    <td style={td()}>
                      {(t as { validadeMeses?: number }).validadeMeses ?? '—'} meses
                    </td>
                    <td style={td()}>
                      {((t as { checklist?: string[] }).checklist ?? []).length} item(s)
                    </td>
                    <td style={td()}>
                      <div className="actions-cell">
                        <a
                          className="action-link"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setModal({ template: t })}
                        >
                          Editar
                        </a>
                        <a
                          className="action-link danger"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            if (window.confirm(`Excluir template "${t.nome}"?`)) {
                              remover.mutate(t.id);
                            }
                          }}
                        >
                          Excluir
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && <TemplateModal template={modal.template} onClose={() => setModal(null)} />}
    </>
  );
}

function TemplateModal({
  template,
  onClose,
}: {
  template: DocTemplate | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const isEdit = !!template;
  const [label, setLabel] = useState(template?.nome ?? '');
  const [validade, setValidade] = useState(
    String((template as { validadeMeses?: number } | null)?.validadeMeses ?? '12'),
  );
  const [checklist, setChecklist] = useState(
    ((template as { checklist?: string[] } | null)?.checklist ?? []).join('\n'),
  );

  const salvar = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      if (isEdit && template) {
        return api.put<{ ok: boolean }>(`/api/doc-templates/${template.id}`, payload);
      }
      return api.post<{ ok: boolean }>('/api/doc-templates', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.docTemplates });
      toast.show(isEdit ? 'Template atualizado' : 'Template criado', 'success');
      onClose();
    },
    onError: (e) => toast.show(e.message, 'danger'),
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar: ${template?.nome}` : 'Novo Template'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <FormField label="Nome *" htmlFor="tpl-label">
        <Input id="tpl-label" value={label} onChange={(e) => setLabel(e.target.value)} required />
      </FormField>
      <FormField
        label="Validade (meses)"
        htmlFor="tpl-validade"
        helper="0 = sem validade"
      >
        <Input
          id="tpl-validade"
          type="number"
          min="0"
          value={validade}
          onChange={(e) => setValidade(e.target.value)}
        />
      </FormField>
      <FormField
        label="Checklist (1 item por linha)"
        htmlFor="tpl-checklist"
        helper="Itens que o usuário precisa marcar ao subir um documento desse tipo. Deixe vazio se não houver checklist."
      >
        <Textarea
          id="tpl-checklist"
          value={checklist}
          onChange={(e) => setChecklist(e.target.value)}
          rows={6}
          placeholder="Identificação do colaborador legível&#10;Carimbo e assinatura do médico&#10;Data de emissão visível"
        />
      </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              salvar.mutate({
                nome: label,
                label,
                validadeMeses: Number(validade) || 12,
                checklist: checklist.split('
').map((s) => s.trim()).filter(Boolean),
              })
            }
            disabled={salvar.isPending}
          >
            {salvar.isPending ? 'Salvando…' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const th = (): React.CSSProperties => ({
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  color: '#64748B',
});
const td = (): React.CSSProperties => ({
  padding: '10px 12px',
  verticalAlign: 'middle',
});
