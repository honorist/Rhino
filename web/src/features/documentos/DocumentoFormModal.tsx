import { useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Select, Textarea } from '../../components/ui/controls';
import { useToast } from '../../components/ui/toast/ToastContext';
import type { Documento } from '../../types/domain';
import { useRecursos } from '../resources';
import { TIPOS_DOC } from './constants';
import {
  useAddDocumento,
  useRemoverArquivoDoc,
  useUpdateDocumento,
  useDocTemplates,
  type DocumentoInput,
} from './queries';

const MAX_BYTES = 10 * 1024 * 1024;

function formatBytes(b?: number): string {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

/** Soma `meses` a uma data ISO e devolve a nova data ISO. */
function somarMeses(dataISO: string, meses: number): string {
  if (!dataISO) return '';
  const d = new Date(`${dataISO}T12:00:00`);
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

interface DocumentoFormModalProps {
  recursoId: string;
  doc: Documento | null;
  onClose: () => void;
}

/** Modal de criação/edição de documento de um colaborador. */
export default function DocumentoFormModal({
  recursoId,
  doc,
  onClose,
}: DocumentoFormModalProps) {
  const toast = useToast();
  const recursosQuery = useRecursos();
  const templatesQuery = useDocTemplates();
  const addMut = useAddDocumento();
  const updateMut = useUpdateDocumento();
  const removerArquivo = useRemoverArquivoDoc();
  const isEdit = Boolean(doc);

  const recurso = (recursosQuery.data ?? []).find((r) => r.id === recursoId);

  /** Templates aplicáveis ao recurso + mapa tipo→meses. */
  const { tipoOptions, mesesPorTipo } = useMemo(() => {
    const meses = new Map<string, number>();
    for (const t of TIPOS_DOC) meses.set(t.key, t.meses);
    const templates = (templatesQuery.data ?? []).filter(
      (t) =>
        !recurso?.contractId || !t.empresaId || t.empresaId === recurso.contractId,
    );
    for (const t of templates) {
      meses.set(`tpl:${t.id}`, t.periodicidadeMeses ?? 12);
    }
    return { tipoOptions: templates, mesesPorTipo: meses };
  }, [templatesQuery.data, recurso?.contractId]);

  const [tipo, setTipo] = useState(doc?.tipo ?? '');
  const [dataEmissao, setDataEmissao] = useState(doc?.dataEmissao ?? '');
  const [dataVencimento, setDataVencimento] = useState(
    doc?.dataVencimento ?? '',
  );
  const [responsavel, setResponsavel] = useState(doc?.responsavel ?? '');
  const [resultado, setResultado] = useState(doc?.resultado ?? '');
  const [observacoes, setObservacoes] = useState(doc?.observacoes ?? '');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);

  /** Recalcula a validade a partir da emissão e do tipo escolhido. */
  function recalcVencimento(emissao: string, tipoSel: string) {
    const meses = mesesPorTipo.get(tipoSel);
    if (emissao && meses) setDataVencimento(somarMeses(emissao, meses));
  }

  function tipoLabelDe(tipoKey: string): string {
    if (tipoKey.startsWith('tpl:')) {
      const t = tipoOptions.find((x) => `tpl:${x.id}` === tipoKey);
      return t?.nome ?? tipoKey;
    }
    return TIPOS_DOC.find((t) => t.key === tipoKey)?.label ?? tipoKey;
  }

  async function submit() {
    if (!tipo) {
      toast.show('Selecione o tipo de documento', 'danger');
      return;
    }
    if (arquivo && arquivo.size > MAX_BYTES) {
      toast.show('Arquivo excede 10 MB', 'danger');
      return;
    }
    const templateId = tipo.startsWith('tpl:') ? tipo.slice(4) : undefined;
    const input: DocumentoInput = {
      tipo,
      tipoLabel: tipoLabelDe(tipo),
      ...(templateId ? { templateId } : {}),
      dataEmissao,
      dataVencimento,
      responsavel,
      resultado,
      observacoes,
    };

    setEnviando(true);
    try {
      let savedDocId: string | null = doc?.id ?? null;
      if (doc) {
        await updateMut.mutateAsync({ recursoId, docId: doc.id, input });
      } else {
        const res = await addMut.mutateAsync({ recursoId, input });
        const rec = res.recursos.find((r) => r.id === recursoId);
        savedDocId = rec?.documentos?.slice(-1)[0]?.id ?? null;
      }

      if (arquivo && savedDocId) {
        const fd = new FormData();
        fd.append('file', arquivo);
        const up = await fetch(
          `/api/recursos/${recursoId}/documentos/${savedDocId}/arquivo`,
          { method: 'POST', credentials: 'same-origin', body: fd },
        );
        if (!up.ok) throw new Error((await up.text()) || `HTTP ${up.status}`);
      }
      toast.show(isEdit ? 'Documento atualizado!' : 'Documento adicionado!', 'success');
      onClose();
    } catch (e) {
      toast.show(
        `Erro ao salvar documento: ${e instanceof Error ? e.message : ''}`,
        'danger',
      );
    } finally {
      setEnviando(false);
    }
  }

  function handleRemoverArquivo() {
    if (!doc) return;
    if (
      !window.confirm(
        'Remover o arquivo anexado deste documento? O documento em si permanece.',
      )
    ) {
      return;
    }
    removerArquivo.mutate(
      { recursoId, docId: doc.id },
      {
        onSuccess: () => toast.show('Arquivo removido', 'success'),
        onError: (e) => toast.show(e.message, 'danger'),
      },
    );
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editar Documento' : 'Adicionar Documento'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={enviando}>
            {enviando
              ? 'Salvando…'
              : isEdit
                ? 'Salvar Alterações'
                : 'Adicionar Documento'}
          </Button>
        </>
      }
    >
      <FormField label="Tipo de Documento *" htmlFor="doc-tipo">
        <Select
          id="doc-tipo"
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value);
            recalcVencimento(dataEmissao, e.target.value);
          }}
        >
          <option value="">— Selecione —</option>
          <optgroup label="Tipos padrão">
            {TIPOS_DOC.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label} — {t.full}
              </option>
            ))}
          </optgroup>
          {tipoOptions.length > 0 && (
            <optgroup label="Templates personalizados">
              {tipoOptions.map((t) => (
                <option key={t.id} value={`tpl:${t.id}`}>
                  {t.nome} — {t.periodicidadeMeses ?? 12}m
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </FormField>

      <Row>
        <div style={{ flex: 1, minWidth: 150 }}>
          <FormField label="Data de Emissão" htmlFor="doc-emissao">
            <Input
              id="doc-emissao"
              type="date"
              value={dataEmissao}
              onChange={(e) => {
                setDataEmissao(e.target.value);
                recalcVencimento(e.target.value, tipo);
              }}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <FormField
            label="Data de Validade"
            htmlFor="doc-venc"
            helper="Calculada ao escolher o tipo e a emissão"
          >
            <Input
              id="doc-venc"
              type="date"
              value={dataVencimento}
              onChange={(e) => setDataVencimento(e.target.value)}
            />
          </FormField>
        </div>
      </Row>

      <Row>
        <div style={{ flex: 1, minWidth: 180 }}>
          <FormField label="Responsável / Emissor" htmlFor="doc-resp">
            <Input
              id="doc-resp"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Ex: Dr. João Silva — CRM 12345"
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <FormField label="Resultado" htmlFor="doc-result">
            <Input
              id="doc-result"
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              placeholder="Ex: Apto, Aprovado..."
            />
          </FormField>
        </div>
      </Row>

      <FormField label="Observações" htmlFor="doc-obs">
        <Textarea
          id="doc-obs"
          rows={2}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Informações adicionais..."
        />
      </FormField>

      <FormField
        label="📎 Arquivo Anexado"
        helper={
          doc?.arquivo
            ? 'Selecione um arquivo para SUBSTITUIR o atual.'
            : 'PDF, JPG ou PNG (até 10 MB).'
        }
      >
        {doc?.arquivo && (
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
              marginBottom: 'var(--sp-sm)',
            }}
          >
            <span style={{ fontSize: 20 }}>
              {(doc.arquivo.mimeType ?? '').includes('pdf') ? '📄' : '🖼️'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ fontWeight: 600, fontSize: 14, wordBreak: 'break-all' }}
              >
                {doc.arquivo.filename}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {formatBytes(doc.arquivo.sizeBytes)}
              </div>
            </div>
            <Button variant="secondary" size="sm" asChild>
              <a
                href={`/api/recursos/${recursoId}/documentos/${doc.id}/arquivo`}
                target="_blank"
                rel="noreferrer"
              >
                ⬇️ Baixar
              </a>
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleRemoverArquivo}
              disabled={removerArquivo.isPending}
            >
              🗑️ Remover
            </Button>
          </div>
        )}
        <Input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />
      </FormField>
    </Modal>
  );
}
