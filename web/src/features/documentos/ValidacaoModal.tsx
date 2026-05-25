import type { ReactNode } from 'react';
import Button from '../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { toast } from 'sonner';
import type { DocumentoValidacao } from '../../types/domain';
import { useDocTemplates, useValidarDocumento } from './queries';
import { useRecursos } from '../resources';

function Item({
  ok,
  label,
  extra,
}: {
  ok: boolean;
  label: string;
  extra?: ReactNode;
}) {
  return (
    <li
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        marginBottom: 4,
        fontSize: 13,
      }}
    >
      <span
        style={{
          color: ok ? '#10B981' : '#EF4444',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {ok ? '✓' : '✗'}
      </span>
      <div>
        <strong>{label}</strong>
        {extra && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {extra}
          </div>
        )}
      </div>
    </li>
  );
}

const COR_STATUS: Record<string, string> = {
  conforme: '#10B981',
  parcial: '#F59E0B',
  nao_conforme: '#EF4444',
};

function Relatorio({ val }: { val: DocumentoValidacao | null | undefined }) {
  if (!val) {
    return (
      <p
        className="text-muted"
        style={{ textAlign: 'center', padding: 'var(--sp-lg)' }}
      >
        Documento ainda não foi validado. Clique em "Validar agora".
      </p>
    );
  }
  if (val.status === 'nao_validado') {
    return (
      <div
        style={{
          padding: 'var(--sp-md)',
          background: '#FEF3C7',
          borderLeft: '3px solid #F59E0B',
          borderRadius: 6,
        }}
      >
        <strong>⏳ Não validado</strong>
        <br />
        <span style={{ fontSize: 13 }}>
          {val.motivo || val.erro || 'Validação pendente'}
        </span>
      </div>
    );
  }
  const cor = COR_STATUS[val.status] ?? '#F59E0B';
  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          marginBottom: 'var(--sp-md)',
        }}
      >
        <div style={{ fontSize: 42, fontWeight: 800, color: cor }}>
          {val.score ?? 0}%
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{val.resumo ?? ''}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Validado em{' '}
            {val.validadoEm
              ? new Date(val.validadoEm).toLocaleString('pt-BR')
              : '—'}{' '}
            · {val.modelo ?? ''}
          </div>
        </div>
      </div>

      {(val.problemas ?? []).length > 0 && (
        <div
          style={{
            padding: 10,
            background: '#FEE2E2',
            borderLeft: '3px solid #EF4444',
            borderRadius: 4,
            marginBottom: 'var(--sp-md)',
          }}
        >
          <strong>Problemas detectados:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {val.problemas?.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {(val.secoes ?? []).length > 0 && (
        <>
          <h4 style={{ margin: 'var(--sp-md) 0 6px', fontSize: 14 }}>
            Seções esperadas
          </h4>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {val.secoes?.map((s, i) => (
              <Item
                key={i}
                ok={s.encontrada}
                label={`Seção ${s.ordem ?? ''}`.trim()}
                extra={s.observacao}
              />
            ))}
          </ul>
        </>
      )}

      {(val.campos ?? []).length > 0 && (
        <>
          <h4 style={{ margin: 'var(--sp-md) 0 6px', fontSize: 14 }}>
            Campos extraídos
          </h4>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {val.campos?.map((c, i) => (
              <Item
                key={i}
                ok={c.encontrado}
                label={c.nome}
                extra={c.valor ? `Valor: ${c.valor}` : undefined}
              />
            ))}
          </ul>
        </>
      )}

      {(val.elementos_visuais ?? []).length > 0 && (
        <>
          <h4 style={{ margin: 'var(--sp-md) 0 6px', fontSize: 14 }}>
            Elementos visuais
          </h4>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {val.elementos_visuais?.map((e, i) => (
              <Item key={i} ok={e.encontrado} label={e.descricao} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

interface ValidacaoModalProps {
  recursoId: string;
  docId: string;
  onClose: () => void;
}

export default function ValidacaoModal({
  recursoId,
  docId,
  onClose,
}: ValidacaoModalProps) {
  const recursosQuery = useRecursos();
  const templatesQuery = useDocTemplates();
  const validar = useValidarDocumento();

  const doc = (recursosQuery.data ?? [])
    .find((r) => r.id === recursoId)
    ?.documentos?.find((d) => d.id === docId);
  const template = (templatesQuery.data ?? []).find(
    (t) => t.id === doc?.templateId,
  );

  function revalidar() {
    validar.mutate(
      { recursoId, docId },
      {
        onSuccess: () => toast.success('Validação concluída'),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>
            Validação IA — {doc?.tipoLabel || doc?.tipo || ''}
          </DialogTitle>
          <DialogDescription>
            Template: {template?.nome || doc?.templateId || '—'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {validar.isPending ? (
            <p
              style={{
                textAlign: 'center',
                padding: 'var(--sp-lg)',
                color: 'var(--color-text-muted)',
              }}
            >
              ⏳ Analisando documento com Claude Vision... (pode levar 5-10s)
            </p>
          ) : (
            <Relatorio val={doc?.validacao} />
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button onClick={revalidar} disabled={validar.isPending}>
            {validar.isPending ? '⏳ Validando...' : '🔄 Validar agora'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
