import { useRef, useState, type ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { toast } from 'sonner';
import type { Proposta } from '../../../types/domain';
import { useAtualizarAnexo, useDeletarAnexo } from '../queries';
import type { EditorTabProps, PropostaAnexo } from '../types';

interface UploadResponse {
  proposta: Proposta;
}

/** Extrai a lista de anexos da proposta devolvida por um endpoint. */
function extrairAnexos(proposta: Proposta): PropostaAnexo[] {
  return Array.isArray(proposta.anexos)
    ? (proposta.anexos as PropostaAnexo[])
    : [];
}

function tamanho(bytes?: number): string {
  return bytes ? `${Math.round(bytes / 1024)} KB` : '';
}

/**
 * Aba Anexos — upload de imagens ilustrativas e PDFs. Persistido por endpoints
 * próprios (`/anexos`); o upload usa FormData fora do cliente `api` tipado.
 */
export default function AnexosTab({ proposta, onLocalUpdate }: EditorTabProps) {
  const deletar = useDeletarAnexo();
  const atualizar = useAtualizarAnexo();
  const imgInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const propostaId = proposta.id;
  const imagens = proposta.anexos.filter(
    (a) => a.tipo === 'imagem' && a.secao === 'escopo',
  );
  const pdfs = proposta.anexos.filter((a) => a.tipo === 'pdf');

  async function enviarArquivos(
    fileList: FileList | null,
    tipo: 'imagem' | 'pdf',
    secao: string,
  ) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setUploading(true);
    try {
      let ultimaProposta: Proposta | null = null;
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('tipo', tipo);
        fd.append('secao', secao);
        const res = await fetch(`/api/propostas/${propostaId}/anexos`, {
          method: 'POST',
          credentials: 'same-origin',
          body: fd,
        });
        if (!res.ok) {
          throw new Error((await res.text()) || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as UploadResponse;
        ultimaProposta = json.proposta;
      }
      if (ultimaProposta) {
        onLocalUpdate({ anexos: extrairAnexos(ultimaProposta) });
      }
      toast.success(`${files.length} arquivo(s) enviado(s)`);
    } catch (e) {
      toast.error(
        `Erro: ${e instanceof Error ? e.message : 'falha no upload'}`
);
    } finally {
      setUploading(false);
    }
  }

  function handleImgChange(e: ChangeEvent<HTMLInputElement>) {
    void enviarArquivos(e.target.files, 'imagem', 'escopo').then(() => {
      if (imgInputRef.current) imgInputRef.current.value = '';
    });
  }
  function handlePdfChange(e: ChangeEvent<HTMLInputElement>) {
    void enviarArquivos(e.target.files, 'pdf', 'anexo_final').then(() => {
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    });
  }

  function remover(anexoId: string) {
    if (!window.confirm('Remover este anexo?')) return;
    deletar.mutate(
      { propostaId, anexoId },
      {
        onSuccess: (r) => onLocalUpdate({ anexos: extrairAnexos(r.proposta) }),
        onError: (e) => toast.error(`Erro: ${e.message}`),
      },
    );
  }

  function editarLegendaLocal(anexoId: string, legenda: string) {
    onLocalUpdate({
      anexos: proposta.anexos.map((a) =>
        a.id === anexoId ? { ...a, legenda } : a,
      ),
    });
  }
  function persistirLegenda(anexoId: string, legenda: string) {
    atualizar.mutate(
      { propostaId, anexoId, legenda },
      {
        onSuccess: (r) => onLocalUpdate({ anexos: extrairAnexos(r.proposta) }),
        onError: (e) => toast.error(`Erro: ${e.message}`),
      },
    );
  }

  return (
    <Card style={{ padding: 24 }}>
      {uploading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            color: 'white',
            fontSize: 18,
          }}
        >
          Enviando arquivo(s)...
        </div>
      )}

      <h3 style={{ margin: '0 0 16px', color: '#1F497D' }}>Anexos</h3>

      <section
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div>
            <h4 style={{ margin: 0, color: '#1F497D' }}>
              🖼️ Imagens Ilustrativas
            </h4>
            <p
              className="text-muted"
              style={{ margin: '4px 0 0', fontSize: 12 }}
            >
              Aparecem na seção "IMAGENS ILUSTRATIVAS" do DOCX/PDF, entre
              Objetivo e Escopo.
            </p>
          </div>
          <Button variant="secondary" asChild>
            <label>
              + Imagem
              <input
                ref={imgInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImgChange}
                style={{ display: 'none' }}
              />
            </label>
          </Button>
        </div>
        {imagens.length === 0 ? (
          <div style={vazioStyle}>
            Nenhuma imagem. Adicione fotos da área, esquemas ou referências
            visuais.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {imagens.map((a) => (
              <Card
                key={a.id}
                style={{
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <img
                  src={`/api/propostas/${propostaId}/anexos/${a.id}`}
                  alt={a.nome}
                  style={{
                    width: '100%',
                    height: 120,
                    objectFit: 'cover',
                    borderRadius: 4,
                    background: '#f1f5f9',
                  }}
                />
                <Input
                  value={a.legenda ?? ''}
                  placeholder="Legenda (opcional)"
                  onChange={(e) => editarLegendaLocal(a.id, e.target.value)}
                  onBlur={(e) => persistirLegenda(a.id, e.target.value)}
                  style={{ fontSize: 12, padding: '4px 6px' }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 11,
                    color: '#64748b',
                  }}
                >
                  <span
                    title={a.nome}
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 120,
                    }}
                  >
                    {a.nome}
                  </span>
                  <button
                    type="button"
                    title="Remover"
                    onClick={() => remover(a.id)}
                    style={{ ...iconBtnStyle, fontSize: 16 }}
                  >
                    ×
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section
        style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div>
            <h4 style={{ margin: 0, color: '#1F497D' }}>📎 Anexos PDF</h4>
            <p
              className="text-muted"
              style={{ margin: '4px 0 0', fontSize: 12 }}
            >
              Desenhos técnicos, certificados, especificações. Listados como
              referência ao final da proposta.
            </p>
          </div>
          <Button variant="secondary" asChild>
            <label>
              + PDF
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={handlePdfChange}
                style={{ display: 'none' }}
              />
            </label>
          </Button>
        </div>
        {pdfs.length === 0 ? (
          <div style={vazioStyle}>Nenhum PDF anexado.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pdfs.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 10,
                  background: '#f8fafc',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                }}
              >
                <span style={{ fontSize: 24 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: '#0f172a',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.nome}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {tamanho(a.sizeBytes)}
                  </div>
                </div>
                <a
                  href={`/api/propostas/${propostaId}/anexos/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="action-link"
                >
                  Abrir
                </a>
                <button
                  type="button"
                  title="Remover"
                  onClick={() => remover(a.id)}
                  style={iconBtnStyle}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </Card>
  );
}

const vazioStyle = {
  textAlign: 'center',
  padding: 24,
  color: '#94a3b8',
  border: '2px dashed #e2e8f0',
  borderRadius: 6,
} as const;

const iconBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#dc2626',
  fontSize: 18,
} as const;
