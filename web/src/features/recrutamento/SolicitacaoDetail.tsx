import { useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import FormField from '../../components/ui/FormField';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import Spinner from '../../components/ui/Spinner';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import DataTable, { type Column } from '../../components/ui/DataTable';
import CandidatoWizardModal from './CandidatoWizardModal';
import {
  useAdicionarCandidato,
  useCancelarSolicitacao,
  useSolicitacao,
} from './queries';
import {
  STATUS_CANDIDATO_COR,
  STATUS_CANDIDATO_LABEL,
  STATUS_SOLICITACAO_COR,
  STATUS_SOLICITACAO_LABEL,
  type Candidato,
} from './types';

interface Props {
  solicitacaoId: string;
  onClose: () => void;
}

/** Detalhe de uma solicitação — vagas + candidatos de cada uma. */
export default function SolicitacaoDetail({ solicitacaoId, onClose }: Props) {
  const { data, isLoading } = useSolicitacao(solicitacaoId);
  const cancelar = useCancelarSolicitacao();
  const [novoCand, setNovoCand] = useState<{ vagaId: string } | null>(null);
  const [detalhe, setDetalhe] = useState<Candidato | null>(null);

  const candidatoColumns = useMemo((): Column<Candidato>[] => [
    {
      id: 'nome',
      header: 'Nome',
      cell: (c) => <strong>{c.nome}</strong>,
    },
    {
      id: 'telefone',
      header: 'Telefone',
      cell: (c) => c.telefone || '—',
    },
    {
      id: 'status',
      header: 'Status',
      cell: (c) => (
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 700,
            background: STATUS_CANDIDATO_COR[c.status] + '22',
            color: STATUS_CANDIDATO_COR[c.status],
          }}
        >
          {STATUS_CANDIDATO_LABEL[c.status]}
        </span>
      ),
    },
    {
      id: 'antecedentes',
      header: 'Antecedentes',
      cell: (c) => (
        <>
          {c.antecedentesStatus === 'pendente' ? '⏳' : c.antecedentesStatus === 'ok' ? '✓' : '✗'}{' '}
          {c.antecedentesStatus}
        </>
      ),
    },
    {
      id: 'docs',
      header: 'Docs',
      cell: (c) => <>{Object.keys(c.documentos || {}).length}/5</>,
    },
    {
      id: 'acao',
      header: '',
      cell: (c) => (
        <a
          className="action-link"
          style={{ cursor: 'pointer' }}
          onClick={() => setDetalhe(c)}
        >
          Abrir
        </a>
      ),
    },
  ], []);

  if (isLoading) return <Spinner label="Carregando solicitação…" />;
  if (!data) return null;
  const sol = data.solicitacao;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[1120px]">
        <DialogHeader>
          <DialogTitle>{`Solicitação #${sol.id.slice(-6).toUpperCase()}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Header */}
          <div style={{ marginBottom: 'var(--sp-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 700,
                  background: STATUS_SOLICITACAO_COR[sol.status] + '22',
                  color: STATUS_SOLICITACAO_COR[sol.status],
                }}
              >
                {STATUS_SOLICITACAO_LABEL[sol.status]}
              </span>
              <span className="text-muted" style={{ fontSize: 13 }}>
                Aberta por <strong>{sol.solicitanteNome ?? '—'}</strong> em{' '}
                {new Date(sol.createdAt).toLocaleDateString('pt-BR')}
              </span>
            </div>
            {sol.observacoes && (
              <p className="text-muted" style={{ fontSize: 14, marginTop: 'var(--sp-sm)' }}>
                <strong>Obs:</strong> {sol.observacoes}
              </p>
            )}
          </div>

          {/* Vagas + candidatos */}
          {(sol.vagas ?? []).map((vaga) => (
            <Card key={vaga.id} style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-md)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 'var(--sp-sm)',
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  {vaga.cargo}{' '}
                  <span className="text-muted" style={{ fontSize: 13 }}>
                    — {vaga.qtdPreenchida}/{vaga.qtdTotal} preenchidas
                  </span>
                </h3>
                {sol.status === 'aberta' && vaga.qtdPreenchida < vaga.qtdTotal && (
                  <Button size="sm" onClick={() => setNovoCand({ vagaId: vaga.id })}>
                    + Candidato
                  </Button>
                )}
              </div>
              <DataTable
                rows={vaga.candidatos ?? []}
                columns={candidatoColumns}
                rowKey={(c) => c.id}
                emptyMessage="Nenhum candidato adicionado ainda."
              />
            </Card>
          ))}

          {novoCand && (
            <NovoCandidatoModal
              solicitacaoId={solicitacaoId}
              vagaId={novoCand.vagaId}
              onClose={() => setNovoCand(null)}
            />
          )}

          {detalhe && (
            <CandidatoWizardModal
              candidato={detalhe}
              solicitacaoId={solicitacaoId}
              onClose={() => setDetalhe(null)}
            />
          )}
        </div>
        <DialogFooter>
          {sol.status === 'aberta' && (
            <Button
              variant="secondary"
              onClick={() => {
                if (!window.confirm('Cancelar esta solicitação?')) return;
                cancelar
                  .mutateAsync(sol.id)
                  .then(() => {
                    toast('Solicitação cancelada.');
                    onClose();
                  })
                  .catch((e) => toast.error((e as Error).message));
              }}
            >
              Cancelar solicitação
            </Button>
          )}
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovoCandidatoModal({
  solicitacaoId,
  vagaId,
  onClose,
}: {
  solicitacaoId: string;
  vagaId: string;
  onClose: () => void;
}) {
  const adicionar = useAdicionarCandidato(solicitacaoId);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');

  async function handleSubmit() {
    if (!nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    try {
      await adicionar.mutateAsync({
        vagaId,
        input: { nome: nome.trim(), cpf, telefone, email },
      });
      toast.success('Candidato adicionado. Faça a triagem.');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Adicionar candidato</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <FormField label="Nome *" htmlFor="cand-nome">
            <Input id="cand-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </FormField>
          <FormField label="CPF" htmlFor="cand-cpf">
            <Input id="cand-cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} />
          </FormField>
          <FormField label="Telefone" htmlFor="cand-tel">
            <Input id="cand-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </FormField>
          <FormField label="Email" htmlFor="cand-email">
            <Input id="cand-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={adicionar.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={adicionar.isPending}>
            {adicionar.isPending ? 'Adicionando…' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

