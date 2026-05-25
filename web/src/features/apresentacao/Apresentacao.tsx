import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import FormField from '../../components/ui/FormField';
import Spinner from '../../components/ui/Spinner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { queryKeys } from '../../lib/queryKeys';
import {
  type ApresentacaoTextos,
  type CaseLogo,
  useApresentacao,
  useCaseLogos,
  useDeleteCaseLogo,
  useSaveApresentacao,
  useUpdateCaseLogo,
} from './queries';

/** Apresentação da Empresa — configuração global de propostas. */
export default function Apresentacao() {
  const qc = useQueryClient();
  const apresentacaoQuery = useApresentacao();
  const logosQuery = useCaseLogos();
  const salvar = useSaveApresentacao();
  const editarLogo = useUpdateCaseLogo();
  const excluirLogo = useDeleteCaseLogo();

  const [textos, setTextos] = useState<ApresentacaoTextos>({
    apresentacao: '',
    casesSucesso: '',
    segurancaSaude: '',
  });
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sincroniza estado local quando os dados chegam do servidor.
  const carregada = apresentacaoQuery.data;
  useEffect(() => {
    if (carregada) setTextos(carregada);
  }, [carregada]);

  if (apresentacaoQuery.isLoading || logosQuery.isLoading) {
    return <Spinner label="Carregando apresentação..." />;
  }

  const logos = logosQuery.data ?? [];

  function handleSalvar() {
    salvar.mutate(textos, {
      onSuccess: () => toast.success('Textos salvos'),
      onError: (e) => toast.error(e.message),
    });
  }

  async function uploadLogo(file: File) {
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('nome', file.name.replace(/\.[^.]+$/, ''));
      const res = await fetch('/api/case-logos', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      void qc.invalidateQueries({ queryKey: queryKeys.caseLogos });
      toast.success('Logo adicionada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro no upload');
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function patchLogo(id: string, patch: Partial<CaseLogo>) {
    editarLogo.mutate(
      { id, patch },
      { onError: (e) => toast.error(e.message) },
    );
  }
  function handleExcluirLogo(id: string) {
    if (!window.confirm('Excluir esta logo?')) return;
    excluirLogo.mutate(id, {
      onSuccess: () => toast.success('Logo removida'),
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Apresentação da Empresa</h1>
          <p className="page-subtitle">
            Configuração padrão usada em todas as propostas geradas.
          </p>
        </div>
        <Button variant="secondary" asChild>
          <Link to="/proposta">← Voltar para Propostas</Link>
        </Button>
      </div>

      <Card style={{ padding: 'var(--sp-lg)', marginBottom: 'var(--sp-lg)' }}>
        <h3 style={{ margin: '0 0 var(--sp-sm)', fontSize: 15 }}>
          Textos (aparecem no DOCX e PDF)
        </h3>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 0 }}>
          Os 3 campos são opcionais. Cada um vira uma seção na proposta
          gerada — vazio = oculto.
        </p>
        <FormField
          label="APRESENTAÇÃO — sobre a Rhino"
          htmlFor="apr-texto"
        >
          <Textarea
            id="apr-texto"
            rows={5}
            value={textos.apresentacao}
            onChange={(e) =>
              setTextos((t) => ({ ...t, apresentacao: e.target.value }))
            }
            placeholder="Ex: Fundada em 2015, a Rhino atua em manutenção industrial..."
          />
        </FormField>
        <FormField
          label="CASES DE SUCESSO RECENTES"
          htmlFor="apr-cases"
          helper="Use bullets (•) ou hifens (-) no início de cada linha."
        >
          <Textarea
            id="apr-cases"
            rows={5}
            value={textos.casesSucesso}
            onChange={(e) =>
              setTextos((t) => ({ ...t, casesSucesso: e.target.value }))
            }
            placeholder={'• Suzano — Tanque T-401 (2025)\n• Arauco — Tubulação L-202 (2024)'}
          />
        </FormField>
        <FormField label="SEGURANÇA E SAÚDE" htmlFor="apr-seg">
          <Textarea
            id="apr-seg"
            rows={5}
            value={textos.segurancaSaude}
            onChange={(e) =>
              setTextos((t) => ({ ...t, segurancaSaude: e.target.value }))
            }
            placeholder="Ex: A Rhino mantém política de segurança alinhada às NRs 10, 33, 34, 35..."
          />
        </FormField>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={handleSalvar} disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar Textos'}
          </Button>
        </div>
      </Card>

      <Card style={{ padding: 'var(--sp-lg)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 'var(--sp-md)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 15, color: '#1F497D' }}>
              Logos de Clientes (Cases)
            </h3>
            <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
              JPG/PNG/WebP até 2 MB — aparecem na seção "Cases de Sucesso" do
              documento.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadLogo(f);
            }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={enviando}
          >
            {enviando ? 'Enviando…' : '+ Adicionar Logo'}
          </Button>
        </div>

        {logos.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 36,
              color: '#94a3b8',
              border: '2px dashed #e2e8f0',
              borderRadius: 8,
            }}
          >
            Nenhuma logo cadastrada. Adicione logos dos clientes com cases
            relevantes.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: 12,
            }}
          >
            {logos.map((lg) => (
              <Card
                key={lg.id}
                style={{
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  opacity: lg.ativo === false ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    height: 80,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f8fafc',
                    borderRadius: 4,
                  }}
                >
                  <img
                    src={`/api/case-logos/${lg.id}/image`}
                    alt={lg.nome}
                    style={{
                      maxWidth: '100%',
                      maxHeight: 80,
                      objectFit: 'contain',
                    }}
                  />
                </div>
                <Input
                  value={lg.nome}
                  onChange={(e) => patchLogo(lg.id, { nome: e.target.value })}
                  placeholder="Nome"
                  style={{ fontSize: 12, padding: '3px 6px' }}
                />
                <Input
                  type="number"
                  min={0}
                  value={String(lg.ordem ?? 0)}
                  onChange={(e) =>
                    patchLogo(lg.id, { ordem: Number(e.target.value) || 0 })
                  }
                  style={{ fontSize: 12, padding: '3px 6px' }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                  }}
                >
                  <a
                    className="action-link"
                    style={{ cursor: 'pointer' }}
                    onClick={() => patchLogo(lg.id, { ativo: !lg.ativo })}
                  >
                    {lg.ativo === false ? 'Ativar' : 'Desativar'}
                  </a>
                  <a
                    className="action-link danger"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleExcluirLogo(lg.id)}
                  >
                    Excluir
                  </a>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
