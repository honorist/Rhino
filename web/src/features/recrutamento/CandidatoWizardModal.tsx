import { useState } from 'react';
import Button from '../../components/ui/Button';
import FormField from '../../components/ui/FormField';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/native-select';
import { useToast } from '../../components/ui/toast/ToastContext';
import {
  useAnexarDocumento,
  useAprovarCandidato,
  useAtualizarAntecedentes,
  useAtualizarTriagem,
} from './queries';
import {
  ANTECEDENTES_LABEL,
  DOC_LABEL,
  DOCUMENTOS_OBRIGATORIOS,
  STATUS_CANDIDATO_COR,
  STATUS_CANDIDATO_LABEL,
  type Candidato,
  type CandidatoStatus,
  type TipoDocumento,
} from './types';

interface Props {
  candidato: Candidato;
  solicitacaoId: string;
  onClose: () => void;
}

/**
 * Wizard com 4 etapas conforme o estado do candidato:
 *   1. Triagem (US-06)
 *   2. Antecedentes (US-07) — só com 'interessado'
 *   3. Documentos (US-08) — só com antecedentes OK
 *   4. Aprovação (US-09) — só com docs completos
 */
export default function CandidatoWizardModal({ candidato, solicitacaoId, onClose }: Props) {
  const toast = useToast();
  const triagem = useAtualizarTriagem(solicitacaoId);
  const antecedentes = useAtualizarAntecedentes(solicitacaoId);
  const anexar = useAnexarDocumento(solicitacaoId);
  const aprovar = useAprovarCandidato(solicitacaoId);

  // Estado local mirror — o servidor é fonte da verdade.
  const status = candidato.status;
  const antecedentesStatus = candidato.antecedentesStatus;
  const docs = candidato.documentos || {};

  const podeAvancar: Record<number, boolean> = {
    1: true, // sempre podemos mexer na triagem
    2: status === 'interessado' || antecedentesStatus !== 'pendente',
    3: antecedentesStatus === 'ok',
    4: DOCUMENTOS_OBRIGATORIOS.every((k) => docs[k]) && antecedentesStatus === 'ok',
  };

  const [step, setStep] = useState<1 | 2 | 3 | 4>(
    status === 'aprovado'
      ? 4
      : DOCUMENTOS_OBRIGATORIOS.every((k) => docs[k])
        ? 4
        : antecedentesStatus === 'ok'
          ? 3
          : status === 'interessado'
            ? 2
            : 1,
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[920px]">
        <DialogHeader>
          <DialogTitle>{`Candidato: ${candidato.nome}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--sp-md)' }}>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            background: STATUS_CANDIDATO_COR[status] + '22',
            color: STATUS_CANDIDATO_COR[status],
          }}
        >
          {STATUS_CANDIDATO_LABEL[status]}
        </span>
        <span className="text-muted" style={{ fontSize: 13 }}>
          · CPF: {candidato.cpf || '—'} · Tel: {candidato.telefone || '—'}
        </span>
      </div>

      {/* Stepper */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 'var(--sp-md)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {[
          [1, '1. Triagem'],
          [2, '2. Antecedentes'],
          [3, '3. Documentos'],
          [4, '4. Aprovação'],
        ].map(([n, l]) => {
          const num = n as 1 | 2 | 3 | 4;
          const ativo = step === num;
          const disponivel = podeAvancar[num];
          return (
            <button
              key={num}
              type="button"
              onClick={() => disponivel && setStep(num)}
              disabled={!disponivel}
              style={{
                padding: '8px 14px',
                border: 'none',
                background: 'transparent',
                borderBottom: `3px solid ${ativo ? 'var(--color-primary)' : 'transparent'}`,
                cursor: disponivel ? 'pointer' : 'not-allowed',
                opacity: disponivel ? 1 : 0.4,
                fontWeight: ativo ? 600 : 500,
                color: ativo ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontSize: 14,
              }}
            >
              {l}
            </button>
          );
        })}
      </div>

      {step === 1 && (
        <StepTriagem
          status={status}
          onChange={(novo) =>
            triagem
              .mutateAsync({ candidatoId: candidato.id, status: novo })
              .then(() => {
                toast.show('Triagem atualizada.', 'success');
                if (novo === 'interessado') setStep(2);
                else if (novo === 'sem_interesse') onClose();
              })
              .catch((e) => toast.show((e as Error).message, 'danger'))
          }
          loading={triagem.isPending}
        />
      )}

      {step === 2 && (
        <StepAntecedentes
          antecedentesStatus={antecedentesStatus}
          docAntecedentes={docs.antecedentes}
          onChange={(resultado, documento) =>
            antecedentes
              .mutateAsync({ candidatoId: candidato.id, resultado, documento })
              .then(() => {
                toast.show('Antecedentes registrados.', 'success');
                if (resultado === 'ok') setStep(3);
                else if (resultado === 'reprovado') onClose();
              })
              .catch((e) => toast.show((e as Error).message, 'danger'))
          }
          loading={antecedentes.isPending}
        />
      )}

      {step === 3 && (
        <StepDocumentos
          docs={docs}
          onAttach={(tipo, doc) =>
            anexar
              .mutateAsync({ candidatoId: candidato.id, tipo, documento: doc })
              .then(() => toast.show(`${DOC_LABEL[tipo]} anexado.`, 'success'))
              .catch((e) => toast.show((e as Error).message, 'danger'))
          }
          loading={anexar.isPending}
        />
      )}

      {step === 4 && (
        <StepAprovacao
          podeAprovar={podeAvancar[4]}
          jaAprovado={status === 'aprovado'}
          onAprovar={() =>
            aprovar
              .mutateAsync(candidato.id)
              .then(() => {
                toast.show(
                  'Candidato aprovado! Adicionado em Recursos como funcionário.',
                  'success',
                );
                onClose();
              })
              .catch((e) => toast.show((e as Error).message, 'danger'))
          }
          loading={aprovar.isPending}
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

// ─── Step 1: Triagem (US-06) ────────────────────────────────────────
function StepTriagem({
  status,
  onChange,
  loading,
}: {
  status: CandidatoStatus;
  onChange: (s: CandidatoStatus) => void;
  loading: boolean;
}) {
  return (
    <>
      <p style={{ marginTop: 0 }}>
        Após o primeiro contato, marque o engajamento do candidato:
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
        {(['contatado', 'interessado', 'sem_interesse'] as CandidatoStatus[]).map((s) => (
          <label
            key={s}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
              padding: 'var(--sp-md)',
              border: `2px solid ${status === s ? STATUS_CANDIDATO_COR[s] : 'var(--color-border)'}`,
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <input
              type="radio"
              checked={status === s}
              onChange={() => onChange(s)}
              disabled={loading}
            />
            <strong>{STATUS_CANDIDATO_LABEL[s]}</strong>
            <span className="text-muted" style={{ fontSize: 13 }}>
              {s === 'contatado' && '— ainda não respondeu'}
              {s === 'interessado' && '— libera próxima etapa (antecedentes)'}
              {s === 'sem_interesse' && '— encerra o processo deste candidato'}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

// ─── Step 2: Antecedentes (US-07) ───────────────────────────────────
function StepAntecedentes({
  antecedentesStatus,
  docAntecedentes,
  onChange,
  loading,
}: {
  antecedentesStatus: Candidato['antecedentesStatus'];
  docAntecedentes?: Candidato['documentos'][TipoDocumento];
  onChange: (resultado: Candidato['antecedentesStatus'], documento?: Candidato['documentos'][TipoDocumento]) => void;
  loading: boolean;
}) {
  const [resultado, setResultado] = useState<Candidato['antecedentesStatus']>(antecedentesStatus);
  const [filename, setFilename] = useState(docAntecedentes?.filename ?? '');
  const [storagePath, setStoragePath] = useState(docAntecedentes?.storagePath ?? '');

  return (
    <>
      <p style={{ marginTop: 0 }}>
        Solicite a consulta de antecedentes criminais e registre o resultado.
      </p>
      <FormField label="Resultado da consulta" htmlFor="ant-result">
        <Select
          id="ant-result"
          value={resultado}
          onChange={(e) => setResultado(e.target.value as Candidato['antecedentesStatus'])}
        >
          <option value="pendente">Pendente</option>
          <option value="ok">OK — sem ocorrências</option>
          <option value="reprovado">Reprovado — encerra o candidato</option>
        </Select>
      </FormField>

      <p
        className="text-muted"
        style={{ fontSize: 13, margin: 'var(--sp-md) 0 var(--sp-sm)' }}
      >
        Anexe o comprovante/documento (opcional, mas recomendado):
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-sm)' }}>
        <FormField label="Nome do arquivo" htmlFor="ant-fname">
          <Input
            id="ant-fname"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="antecedentes_jose_silva.pdf"
          />
        </FormField>
        <FormField label="Caminho/URL do arquivo" htmlFor="ant-path">
          <Input
            id="ant-path"
            value={storagePath}
            onChange={(e) => setStoragePath(e.target.value)}
            placeholder="/storage/.../arquivo.pdf"
          />
        </FormField>
      </div>

      <div style={{ marginTop: 'var(--sp-md)' }}>
        <Button
          disabled={loading || resultado === antecedentesStatus}
          onClick={() => {
            const documento = filename && storagePath
              ? { filename, storagePath, uploadedAt: new Date().toISOString() }
              : undefined;
            onChange(resultado, documento);
          }}
        >
          {loading ? 'Salvando…' : 'Salvar resultado'}
        </Button>
      </div>

      {antecedentesStatus !== 'pendente' && (
        <p
          className="text-muted"
          style={{ marginTop: 'var(--sp-sm)', fontSize: 13 }}
        >
          Status atual: <strong>{ANTECEDENTES_LABEL[antecedentesStatus]}</strong>
        </p>
      )}
    </>
  );
}

// ─── Step 3: Documentos (US-08) ─────────────────────────────────────
function StepDocumentos({
  docs,
  onAttach,
  loading,
}: {
  docs: Candidato['documentos'];
  onAttach: (tipo: TipoDocumento, doc: { filename: string; storagePath: string }) => void;
  loading: boolean;
}) {
  return (
    <>
      <p style={{ marginTop: 0 }}>
        Anexe os 4 documentos obrigatórios para liberar a aprovação final.
      </p>
      <table style={{ width: '100%', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <th style={th()}>Documento</th>
            <th style={th()}>Status</th>
            <th style={th()}>Arquivo</th>
            <th style={th()}></th>
          </tr>
        </thead>
        <tbody>
          {DOCUMENTOS_OBRIGATORIOS.map((tipo) => (
            <DocRow
              key={tipo}
              tipo={tipo}
              doc={docs[tipo]}
              onAttach={(d) => onAttach(tipo, d)}
              loading={loading}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}

function DocRow({
  tipo,
  doc,
  onAttach,
  loading,
}: {
  tipo: TipoDocumento;
  doc?: Candidato['documentos'][TipoDocumento];
  onAttach: (d: { filename: string; storagePath: string }) => void;
  loading: boolean;
}) {
  const [filename, setFilename] = useState(doc?.filename ?? '');
  const [storagePath, setStoragePath] = useState(doc?.storagePath ?? '');
  const anexado = !!doc;
  return (
    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
      <td style={td()}>
        <strong>{DOC_LABEL[tipo]}</strong>
      </td>
      <td style={td()}>
        {anexado ? (
          <span style={{ color: '#16A34A', fontWeight: 700 }}>✓ anexado</span>
        ) : (
          <span style={{ color: '#D97706', fontWeight: 700 }}>pendente</span>
        )}
      </td>
      <td style={td()}>
        <div style={{ display: 'flex', gap: 4 }}>
          <Input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="nome.pdf"
          />
          <Input
            value={storagePath}
            onChange={(e) => setStoragePath(e.target.value)}
            placeholder="/path/..."
          />
        </div>
      </td>
      <td style={td()}>
        <Button
          size="sm"
          disabled={loading || !filename || !storagePath}
          onClick={() => onAttach({ filename, storagePath })}
        >
          {anexado ? 'Substituir' : 'Anexar'}
        </Button>
      </td>
    </tr>
  );
}

// ─── Step 4: Aprovação (US-09) ──────────────────────────────────────
function StepAprovacao({
  podeAprovar,
  jaAprovado,
  onAprovar,
  loading,
}: {
  podeAprovar: boolean;
  jaAprovado: boolean;
  onAprovar: () => void;
  loading: boolean;
}) {
  if (jaAprovado) {
    return (
      <div
        style={{
          padding: 'var(--sp-lg)',
          textAlign: 'center',
          background: 'rgba(22,163,74,.08)',
          borderRadius: 8,
        }}
      >
        <h3>✅ Aprovado</h3>
        <p className="text-muted">
          Candidato já está cadastrado em <strong>Recursos</strong> como funcionário.
        </p>
      </div>
    );
  }
  return (
    <>
      <p style={{ marginTop: 0 }}>
        Confirme a contratação. O candidato será cadastrado em{' '}
        <strong>Recursos</strong> como funcionário, com todos os documentos
        migrados, e a vaga correspondente será decrementada.
      </p>
      {!podeAprovar && (
        <p style={{ color: '#D97706', fontSize: 13 }}>
          ⚠️ Antecedentes precisam estar OK e os 4 documentos anexados.
        </p>
      )}
      <Button onClick={onAprovar} disabled={!podeAprovar || loading}>
        {loading ? 'Aprovando…' : '✅ Aprovar e contratar'}
      </Button>
    </>
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
