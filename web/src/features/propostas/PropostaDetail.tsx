import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/ToastContext';
import type { PropostaStatus } from '../../types/domain';
import { STATUS_COLORS, STATUS_LABELS, numeroCompleto } from './shared';
import {
  useAceitarProposta,
  useAutosaveProposta,
  useDuplicarProposta,
  useEnviarProposta,
  useProposta,
  useRejeitarProposta,
} from './queries';
import type { EditorTabProps, PropostaDetalhe, PropostaPatch } from './types';
import DadosGeraisTab from './tabs/DadosGeraisTab';
import EscopoTab from './tabs/EscopoTab';
import ObrigacoesTab from './tabs/ObrigacoesTab';
import CronogramaTab from './tabs/CronogramaTab';
import InvestimentoTab from './tabs/InvestimentoTab';
import CustoInternoTab from './tabs/CustoInternoTab';
import AnexosTab from './tabs/AnexosTab';
import PreviewTab from './tabs/PreviewTab';

/** Atraso do autosave após a última edição (ms). */
const AUTOSAVE_DELAY = 800;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface TabDef {
  id: string;
  label: string;
  icon: string;
  Component: ComponentType<EditorTabProps>;
}

const TABS: TabDef[] = [
  { id: 'dados', label: 'Dados Gerais', icon: '📋', Component: DadosGeraisTab },
  { id: 'escopo', label: 'Escopo / Fora', icon: '📑', Component: EscopoTab },
  { id: 'obrigacoes', label: 'Obrigações', icon: '⚖️', Component: ObrigacoesTab },
  { id: 'cronograma', label: 'Cronograma', icon: '📅', Component: CronogramaTab },
  { id: 'investimento', label: 'Investimento', icon: '💰', Component: InvestimentoTab },
  { id: 'custo-interno', label: '🔒 Custo Interno', icon: '', Component: CustoInternoTab },
  { id: 'anexos', label: 'Anexos', icon: '📎', Component: AnexosTab },
  { id: 'preview', label: 'Preview', icon: '👁️', Component: PreviewTab },
];

interface EditorApi {
  proposta: PropostaDetalhe | null;
  isLoading: boolean;
  isError: boolean;
  saveState: SaveState;
  onChange: (patch: PropostaPatch) => void;
  onLocalUpdate: (patch: PropostaPatch) => void;
  flushNow: () => Promise<void>;
  setStatusLocal: (status: PropostaStatus) => void;
}

/**
 * Estado do editor: mantém uma cópia local editável da proposta (fonte da
 * verdade enquanto a aba está aberta) e faz autosave debounced via PUT.
 */
function usePropostaEditor(id: string): EditorApi {
  const query = useProposta(id);
  const { mutateAsync: autosave } = useAutosaveProposta();
  const toast = useToast();

  const [proposta, setProposta] = useState<PropostaDetalhe | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const pendingRef = useRef<PropostaPatch>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Copia a resposta do servidor para o estado local — uma única vez.
  useEffect(() => {
    if (query.data) setProposta((prev) => prev ?? query.data);
  }, [query.data]);

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingRef.current = {};
    setSaveState('saving');
    try {
      await autosave({ id, patch });
      setSaveState('saved');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      // Re-injeta o patch (mantendo edições novas por cima) para nova tentativa.
      pendingRef.current = { ...patch, ...pendingRef.current };
      setSaveState('error');
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      toast.show(`Falha ao salvar: ${message}`, 'danger');
    }
  }, [id, autosave, toast]);

  const onChange = useCallback(
    (patch: PropostaPatch) => {
      setProposta((prev) => (prev ? { ...prev, ...patch } : prev));
      pendingRef.current = { ...pendingRef.current, ...patch };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, AUTOSAVE_DELAY);
    },
    [flush],
  );

  const onLocalUpdate = useCallback((patch: PropostaPatch) => {
    setProposta((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const setStatusLocal = useCallback((status: PropostaStatus) => {
    setProposta((prev) => (prev ? { ...prev, status } : prev));
  }, []);

  // Salva pendências ao desmontar (sair do editor).
  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  return {
    proposta,
    isLoading: query.isLoading,
    isError: query.isError,
    saveState,
    onChange,
    onLocalUpdate,
    flushNow: flush,
    setStatusLocal,
  };
}

/** Indicador de salvamento ao lado do título. */
function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving') {
    return <span style={{ fontSize: 12, color: '#64748b' }}>salvando…</span>;
  }
  if (state === 'saved') {
    return <span style={{ fontSize: 12, color: '#10b981' }}>✓ salvo</span>;
  }
  if (state === 'error') {
    return <span style={{ fontSize: 12, color: '#dc2626' }}>⚠ erro ao salvar</span>;
  }
  return null;
}

/** Editor de uma proposta — orquestra as 8 abas + autosave. */
function PropostaEditorView({ id }: { id: string }) {
  const toast = useToast();
  const navigate = useNavigate();
  const editor = usePropostaEditor(id);
  const { proposta, saveState, onChange, onLocalUpdate, flushNow, setStatusLocal } =
    editor;

  const [currentTab, setCurrentTab] = useState('dados');

  const enviar = useEnviarProposta();
  const aceitar = useAceitarProposta();
  const rejeitar = useRejeitarProposta();
  const duplicar = useDuplicarProposta();

  if (editor.isLoading) {
    return <Spinner label="Carregando proposta..." />;
  }
  if (editor.isError || !proposta) {
    return <div className="error-banner">Proposta não encontrada.</div>;
  }

  const status = proposta.status ?? 'rascunho';
  const cor = STATUS_COLORS[status] ?? STATUS_COLORS.rascunho;
  const cliente =
    proposta.clienteEmpresa || proposta.clienteNome || '— sem cliente —';

  function handleEnviar() {
    if (
      !window.confirm(
        'Marcar proposta como ENVIADA? Use isso após enviar ao cliente. O ' +
          'contrato em prospecção continuará vinculado e ativará ao marcar como Aceita.',
      )
    ) {
      return;
    }
    void flushNow().then(() => {
      enviar.mutate(id, {
        onSuccess: () => {
          setStatusLocal('enviada');
          toast.show('Proposta marcada como enviada', 'success');
        },
        onError: (error) => toast.show(`Erro: ${error.message}`, 'danger'),
      });
    });
  }

  function handleAceitar() {
    if (
      !window.confirm(
        'Marcar como ACEITA? O contrato em prospecção vinculado mudará ' +
          'automaticamente para "ativo".',
      )
    ) {
      return;
    }
    aceitar.mutate(id, {
      onSuccess: () => {
        setStatusLocal('aceita');
        toast.show('Proposta aceita! Contrato ativado.', 'success');
      },
      onError: (error) => toast.show(`Erro: ${error.message}`, 'danger'),
    });
  }

  function handleRejeitar() {
    const motivo = window.prompt('Motivo da rejeição (opcional):');
    if (motivo === null) return;
    rejeitar.mutate(
      { id, motivo },
      {
        onSuccess: () => {
          setStatusLocal('rejeitada');
          toast.show('Proposta rejeitada', 'warning');
        },
        onError: (error) => toast.show(`Erro: ${error.message}`, 'danger'),
      },
    );
  }

  function handleDuplicar() {
    if (
      !window.confirm(
        'Criar nova revisão (Rev.+1)? A versão atual será preservada para histórico.',
      )
    ) {
      return;
    }
    void flushNow().then(() => {
      duplicar.mutate(id, {
        onSuccess: (r) => {
          if (r.proposta) navigate(`/proposta/${r.proposta.id}`);
        },
        onError: (error) => toast.show(`Erro: ${error.message}`, 'danger'),
      });
    });
  }

  function handleDownload(format: 'docx' | 'pdf') {
    void flushNow().then(() => {
      window.open(`/api/propostas/${id}/${format}`, '_blank');
    });
  }

  const ActiveTab =
    (TABS.find((t) => t.id === currentTab) ?? TABS[0]).Component;

  return (
    <>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <Link to="/proposta" className="action-link" style={{ color: '#64748b' }}>
              ← Propostas
            </Link>
            <span style={{ color: '#cbd5e1' }}>/</span>
            <h1 className="page-title" style={{ margin: 0 }}>
              {numeroCompleto(proposta)}
            </h1>
            <span
              className="badge"
              style={{
                background: cor.bg,
                color: cor.fg,
                border: `1px solid ${cor.border}`,
                padding: '4px 12px',
                borderRadius: 14,
              }}
            >
              {STATUS_LABELS[status] ?? status}
            </span>
            <SaveIndicator state={saveState} />
          </div>
          <p className="page-subtitle" style={{ marginTop: 4 }}>
            {proposta.titulo || 'Sem título'} · {cliente}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {status === 'rascunho' && (
            <Button onClick={handleEnviar} disabled={enviar.isPending}>
              📨 Marcar como Enviada
            </Button>
          )}
          {status === 'enviada' && (
            <>
              <Button
                variant="success"
                onClick={handleAceitar}
                disabled={aceitar.isPending}
              >
                ✓ Marcar como Aceita
              </Button>
              <Button
                variant="secondary"
                onClick={handleRejeitar}
                disabled={rejeitar.isPending}
              >
                ✗ Rejeitar
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            onClick={handleDuplicar}
            disabled={duplicar.isPending}
            title="Cria nova revisão (Rev.+1)"
          >
            📋 Nova Revisão
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleDownload('docx')}
            title="Baixar DOCX timbrado"
          >
            📄 DOCX
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleDownload('pdf')}
            title="Baixar PDF"
          >
            📑 PDF
          </Button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <Tabs value={currentTab} onValueChange={setCurrentTab}>
          <TabsList className="h-auto w-full justify-start rounded-none border-b border-border bg-transparent p-0 px-2 overflow-x-auto gap-0">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="rounded-none border-b-[3px] border-transparent bg-transparent px-[18px] py-[14px] text-sm font-normal text-muted-foreground whitespace-nowrap data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                {tab.icon} {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="tab-content">
        <ActiveTab
          proposta={proposta}
          onChange={onChange}
          onLocalUpdate={onLocalUpdate}
        />
      </div>
    </>
  );
}

/**
 * Editor de Proposta (/proposta/:id) — porte de js/views/PropostaDetail.js.
 * A `key={id}` força a remontagem (estado local limpo) ao trocar de proposta.
 */
export default function PropostaDetail() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <div className="error-banner">ID da proposta não informado.</div>;
  }
  return <PropostaEditorView key={id} id={id} />;
}
