import { useMemo, useState } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import FormField from '../../../components/ui/FormField';
import Modal from '../../../components/ui/Modal';
import Spinner from '../../../components/ui/Spinner';
import { Input } from '../../../components/ui/controls';
import { useToast } from '../../../components/ui/toast/ToastContext';
import {
  useBase,
  useCreateTipoBase,
  useRemoveTipoBase,
  useTiposBase,
  useUpdateTipoBase,
} from '../../resources';
import type { TipoBase } from '../../../types/domain';

interface TipoComUso extends TipoBase {
  sistema?: boolean;
  uso: number;
}

/**
 * Seção "Tipos de Custo" — porte de renderTiposCusto() em
 * js/views/Configuracao.js. CRUD com bloqueio para tipos do sistema e tipos
 * customizados em uso.
 */
export default function TiposCustoSection() {
  const tiposQuery = useTiposBase();
  const baseQuery = useBase();
  const [modal, setModal] = useState<{ tipo: TipoBase | null } | null>(null);
  const toast = useToast();
  const remover = useRemoveTipoBase();

  // Contagem de uso por tipo (lê BASE)
  const usoMap = useMemo(() => {
    const m = new Map<string, number>();
    (baseQuery.data ?? []).forEach((b) => {
      const k = (b as { type?: string }).type;
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    });
    return m;
  }, [baseQuery.data]);

  const tipos: TipoComUso[] = useMemo(
    () =>
      (tiposQuery.data ?? []).map((t) => ({
        ...t,
        sistema: (t as { sistema?: boolean }).sistema,
        uso: usoMap.get(t.key) ?? 0,
      })),
    [tiposQuery.data, usoMap],
  );

  async function handleDelete(t: TipoComUso) {
    if (t.sistema) {
      toast.show('Tipos do sistema não podem ser excluídos.', 'danger');
      return;
    }
    if (t.uso > 0) {
      toast.show(
        `Não dá pra excluir: existem ${t.uso} item(ns) em BASE usando este tipo.`,
        'danger',
      );
      return;
    }
    if (!window.confirm(`Excluir o tipo "${t.label}"?`)) return;
    remover.mutate(t.id, {
      onSuccess: () => toast.show('Tipo removido', 'success'),
      onError: (e) => toast.show(e.message, 'danger'),
    });
  }

  if (tiposQuery.isLoading) return <Spinner label="Carregando tipos…" />;

  return (
    <>
      <div className="page-header" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            🏷️ Tipos de Custo
          </h2>
          <p className="page-subtitle">
            Classificação de custos usados em BASE e Aportes
          </p>
        </div>
        <Button onClick={() => setModal({ tipo: null })}>+ Novo Tipo</Button>
      </div>

      <Card
        style={{
          padding: 'var(--sp-md)',
          marginBottom: 'var(--sp-lg)',
          background: 'rgba(49,130,206,.05)',
          borderLeft: '4px solid #3182CE',
        }}
      >
        <div style={{ fontSize: 14 }}>
          <strong>ℹ️ Sobre tipos de custo:</strong> Use esta área para cadastrar
          as categorias de custos que seu negócio utiliza. Aparecem nos
          formulários de <strong>BASE</strong> e <strong>Aportes</strong>.
          Tipos do <strong>sistema</strong> não podem ser excluídos.
          Customizados só podem ser excluídos se não estiverem em uso.
        </div>
      </Card>

      <Card style={{ padding: 0 }}>
        <div
          style={{
            padding: 'var(--sp-md) var(--sp-lg)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>Tipos Cadastrados</h3>
          <span className="text-muted" style={{ fontSize: 14 }}>
            {tipos.length} tipo{tipos.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={th()}>Ícone</th>
                <th style={th()}>Nome</th>
                <th style={th()}>Chave</th>
                <th style={th()}>Tipo</th>
                <th style={th()}>Uso</th>
                <th style={th()}></th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => (
                <tr
                  key={t.id}
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <td style={td()}>
                    <span
                      style={{
                        fontSize: 22,
                        background: t.cor ?? '#e5e7eb',
                        padding: '4px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {t.icon ?? '·'}
                    </span>
                  </td>
                  <td style={td()}>
                    <strong>{t.label}</strong>
                  </td>
                  <td
                    style={{
                      ...td(),
                      fontFamily: 'monospace',
                      fontSize: 13,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {t.key}
                  </td>
                  <td style={td()}>
                    {t.sistema ? (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: 'rgba(96,165,250,.12)',
                          color: '#1e3a8a',
                        }}
                      >
                        sistema
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: 'rgba(22,163,74,.12)',
                          color: '#166534',
                        }}
                      >
                        custom
                      </span>
                    )}
                  </td>
                  <td style={td()}>
                    {t.uso > 0 ? (
                      <strong>{t.uso}</strong>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td style={td()}>
                    <div className="actions-cell">
                      <a
                        className="action-link"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setModal({ tipo: t })}
                      >
                        Editar
                      </a>
                      {!t.sistema && (
                        <a
                          className="action-link danger"
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleDelete(t)}
                        >
                          Excluir
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && (
        <TipoModal
          tipo={modal.tipo}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function TipoModal({
  tipo,
  onClose,
}: {
  tipo: TipoBase | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const criar = useCreateTipoBase();
  const atualizar = useUpdateTipoBase();
  const sistema = (tipo as { sistema?: boolean } | null)?.sistema ?? false;
  const isEdit = !!tipo;

  const [label, setLabel] = useState(tipo?.label ?? '');
  const [key, setKey] = useState(tipo?.key ?? '');
  const [icon, setIcon] = useState(tipo?.icon ?? '');
  const [cor, setCor] = useState(tipo?.cor ?? '#3182CE');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !key.trim()) {
      toast.show('Nome e chave são obrigatórios', 'danger');
      return;
    }
    const payload = { label: label.trim(), key: key.trim(), icon, cor };
    const onSuccess = () => {
      toast.show(isEdit ? 'Tipo atualizado' : 'Tipo criado', 'success');
      onClose();
    };
    const onError = (e: Error) => toast.show(e.message, 'danger');
    if (isEdit && tipo) {
      atualizar.mutate({ id: tipo.id, input: payload }, { onSuccess, onError });
    } else {
      criar.mutate(payload, { onSuccess, onError });
    }
  }

  const saving = criar.isPending || atualizar.isPending;

  return (
    <Modal
      open
      title={isEdit ? `Editar Tipo: ${tipo?.label}` : 'Novo Tipo de Custo'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-tipo" disabled={saving}>
            {saving ? 'Salvando…' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </>
      }
    >
      <form id="form-tipo" onSubmit={handleSubmit}>
        <FormField label="Nome *" htmlFor="tipo-label">
          <Input
            id="tipo-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex.: Combustível"
            required
          />
        </FormField>

        <FormField
          label="Chave *"
          htmlFor="tipo-key"
          helper={
            sistema
              ? '🔒 Tipo do sistema — a chave não pode ser alterada'
              : 'Identificador interno (use snake_case sem espaços, ex.: combustivel)'
          }
        >
          <Input
            id="tipo-key"
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            placeholder="combustivel"
            disabled={sistema}
            required
          />
        </FormField>

        <FormField
          label="Ícone (emoji)"
          htmlFor="tipo-icon"
          helper="Use um emoji curto, ex.: ⛽ 🏠 🚚"
        >
          <Input
            id="tipo-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="⛽"
            maxLength={4}
          />
        </FormField>

        <FormField label="Cor" htmlFor="tipo-cor">
          <input
            type="color"
            id="tipo-cor"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            style={{ width: 80, height: 40, border: '1px solid var(--color-border)', borderRadius: 6 }}
          />
        </FormField>
      </form>
    </Modal>
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
