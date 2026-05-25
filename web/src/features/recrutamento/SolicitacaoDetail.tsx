import { useState } from 'react';
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
              {!vaga.candidatos || vaga.candidatos.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13 }}>
                  Nenhum candidato adicionado ainda.
                </p>
              ) : (
                <table style={{ width: '100%', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th style={th()}>Nome</th>
                      <th style={th()}>Telefone</th>
                      <th style={th()}>Status</th>
                      <th style={th()}>Antecedentes</th>
                      <th style={th()}>Docs</th>
                      <th style={th()}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vaga.candidatos.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={td()}>
                          <strong>{c.nome}</strong>
                        </td>
                        <td style={td()}>{c.telefone || '—'}</td>
                        <td style={td()}>
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
                        </td>
                        <td style={td()}>
                          {c.antecedentesStatus === 'pendente' ? '⏳' : c.antecedentesStatus === 'ok' ? '✓' : '✗'}{' '}
                          {c.antecedentesStatus}
                        </td>
                        <td style={td()}>
                          {Object.keys(c.documentos || {}).length}/5
                        </td>
                        <td style={td()}>
                          <a
                            className="action-link"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setDetalhe(c)}
                          >
                            Abrir
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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

const th = (): React.CSSProperties => ({
  padding: '8px 6px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  color: '#64748B',
});
const td = (): React.CSSProperties => ({ padding: '8px 6px', verticalAlign: 'middle' });
