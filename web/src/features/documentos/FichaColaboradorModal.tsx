import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import Spinner from '../../components/ui/spinner';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import { useContracts } from '../contracts/queries';
import { useRecursos } from '../resources';

const GENERO_LABEL: Record<string, string> = {
  masculino: 'Masculino',
  feminino: 'Feminino',
  outro: 'Outro',
};

const STATUS_BADGE: Record<string, { bg: string; cor: string; texto: string }> = {
  funcionario: { bg: '#D1FAE5', cor: '#065F46', texto: 'Funcionário Ativo' },
  candidato: { bg: '#DBEAFE', cor: '#1E40AF', texto: 'Candidato' },
  ex_funcionario: { bg: '#E5E7EB', cor: '#374151', texto: 'Ex-Funcionário' },
};

/** Linha rótulo/valor da ficha — só renderiza se há valor. */
function Linha({ label, valor }: { label: string; valor: ReactNode }) {
  if (valor === null || valor === undefined || valor === '') return null;
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--sp-sm)',
        padding: 'var(--sp-sm) 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <span
        style={{ minWidth: 140, fontSize: 15, color: 'var(--color-text-muted)' }}
      >
        {label}
      </span>
      <span style={{ fontSize: 15, fontWeight: 500 }}>{valor}</span>
    </div>
  );
}

function Secao({ titulo }: { titulo: string }) {
  return (
    <h3
      style={{
        fontSize: 15,
        fontWeight: 700,
        color: 'var(--color-text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        margin: 'var(--sp-lg) 0 var(--sp-sm)',
      }}
    >
      {titulo}
    </h3>
  );
}

function calcularIdade(dataNascimento?: string): string | null {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  if (
    hoje.getMonth() < nasc.getMonth() ||
    (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate())
  ) {
    anos -= 1;
  }
  return `${anos} anos`;
}

interface FichaColaboradorModalProps {
  recursoId: string;
  onClose: () => void;
  onVerDocumentos: () => void;
}

/** Ficha (read-only) do colaborador. */
export default function FichaColaboradorModal({
  recursoId,
  onClose,
  onVerDocumentos,
}: FichaColaboradorModalProps) {
  const navigate = useNavigate();
  const recursosQuery = useRecursos();
  const contractsQuery = useContracts();

  const r = (recursosQuery.data ?? []).find((x) => x.id === recursoId);
  const contrato = r?.alocacaoAtual?.contractId
    ? (contractsQuery.data ?? []).find(
        (c) => c.id === r.alocacaoAtual?.contractId,
      )
    : null;

  const badge = r ? STATUS_BADGE[r.status ?? ''] : undefined;
  const idade = calcularIdade(r?.dataNascimento);
  const nascimento = r?.dataNascimento
    ? `${formatDateBR(r.dataNascimento)}${idade ? ` (${idade})` : ''}`
    : null;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{r?.nome ?? 'Colaborador'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {!r ? (
        <Spinner label="Carregando..." />
      ) : (
        <>
          {badge && (
            <Badge style={{ background: badge.bg, color: badge.cor }}>
              {badge.texto}
            </Badge>
          )}

          <Secao titulo="Dados Pessoais" />
          <Linha label="CPF" valor={r.cpf} />
          <Linha label="Data de Nascimento" valor={nascimento} />
          <Linha
            label="Gênero"
            valor={r.genero ? (GENERO_LABEL[r.genero] ?? r.genero) : null}
          />
          <Linha label="Telefone" valor={r.telefone} />
          <Linha label="Email" valor={r.email} />
          <Linha label="Endereço" valor={r.endereco} />

          <Secao titulo="Dados Profissionais" />
          <Linha label="Profissão" valor={r.profissao} />
          <Linha label="Admissão" valor={formatDateBR(r.dataAdmissao)} />
          <Linha
            label="Salário"
            valor={r.salario ? formatBRL(r.salario) : null}
          />
          <Linha label="PIS" valor={r.pis} />
          <Linha label="CNH" valor={r.cnh} />
          {contrato && (
            <Linha
              label="Obra Atual"
              valor={`${String(contrato.name ?? '')}${
                r.alocacaoAtual?.dataInicio
                  ? ` — desde ${formatDateBR(r.alocacaoAtual.dataInicio)}`
                  : ''
              }`}
            />
          )}
          {r.alocacaoAtual && (
            <Linha
              label="Ciclo de Trabalho"
              valor={`${r.alocacaoAtual.cicloTrabalho ?? 21}d trabalho / ${
                r.alocacaoAtual.cicloFolga ?? 7
              }d folga`}
            />
          )}
          {r.notas && (
            <div
              style={{
                marginTop: 'var(--sp-md)',
                padding: 'var(--sp-md)',
                background: 'var(--color-bg)',
                borderRadius: 6,
                fontSize: 15,
                color: 'var(--color-text-muted)',
              }}
            >
              {r.notas}
            </div>
          )}
        </>
      )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onVerDocumentos}>
            Ver Documentos
          </Button>
          <Button onClick={() => navigate('/recursos')}>Editar Cadastro</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
