import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Textarea } from '../../components/ui/controls';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import type { Socio } from '../../types/domain';
import {
  useCreateSocio,
  useInvestimentos,
  useRemoveSocio,
  useSocios,
  useUpdateSocio,
} from '../resources';

type SocioInput = Partial<Omit<Socio, 'id'>>;

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

/** Tela de Sócios e participações — migração de js/views/Socios.js. */
export default function Socios() {
  const toast = useToast();
  const sociosQuery = useSocios();
  const investimentosQuery = useInvestimentos();
  const removeSocio = useRemoveSocio();

  const [modal, setModal] = useState<{ socio: Socio | null } | null>(null);

  const socios = sociosQuery.data ?? [];
  const investimentos = investimentosQuery.data ?? [];
  const totalParticipacao = socios.reduce(
    (sum, socio) => sum + (socio.participacao || 0),
    0,
  );

  function totalInvestido(socioId: string): number {
    return investimentos
      .filter((investimento) => investimento.socioId === socioId)
      .reduce((sum, investimento) => sum + (investimento.value || 0), 0);
  }

  function handleDelete(socio: Socio) {
    if (
      !window.confirm(
        'Tem certeza? Todos os investimentos deste sócio serão removidos.',
      )
    ) {
      return;
    }
    removeSocio.mutate(socio.id, {
      onSuccess: () => toast.show('Sócio removido', 'success'),
      onError: (error) => toast.show(error.message, 'danger'),
    });
  }

  const columns: Column<Socio>[] = [
    { header: 'Nome', cell: (socio) => socio.name },
    { header: 'CPF/CNPJ', cell: (socio) => socio.document || '—' },
    { header: 'Email', cell: (socio) => socio.email || '—' },
    { header: 'Telefone', cell: (socio) => socio.phone || '—' },
    {
      header: 'Participação',
      align: 'right',
      cell: (socio) => `${socio.participacao.toFixed(2)}%`,
    },
    {
      header: 'Total Investido',
      align: 'right',
      cell: (socio) => formatBRL(totalInvestido(socio.id)),
    },
    {
      header: 'Ações',
      width: '120px',
      cell: (socio) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setModal({ socio })}
            aria-label="Editar sócio"
          >
            <Pencil size={14} />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleDelete(socio)}
            aria-label="Excluir sócio"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  const participacaoColor =
    totalParticipacao === 100
      ? 'var(--color-success)'
      : 'var(--color-warning)';

  return (
    <>
      <PageHeader
        title="Sócios"
        subtitle="Gerenciar sócios e participações"
        actions={
          <Button onClick={() => setModal({ socio: null })}>
            + Novo Sócio
          </Button>
        }
      />

      <div className="card" style={{ marginBottom: 'var(--sp-xl)' }}>
        <div className="card-header">
          <h3 className="card-title">Participação Total</h3>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--sp-lg)',
          }}
        >
          <Metric label="Total Sócios" value={String(socios.length)} />
          <Metric
            label="Participação Registrada"
            value={`${totalParticipacao.toFixed(2)}%`}
            color={participacaoColor}
          />
          <Metric
            label="Participação Faltante"
            value={`${(100 - totalParticipacao).toFixed(2)}%`}
            color="var(--color-info)"
          />
        </div>
      </div>

      {sociosQuery.isLoading ? (
        <Spinner label="Carregando sócios..." />
      ) : sociosQuery.isError ? (
        <div className="card" style={{ padding: 24 }}>
          <p className="text-danger">Erro ao carregar sócios. Tente novamente.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={socios}
          rowKey={(socio) => socio.id}
          emptyMessage="Nenhum sócio registrado"
        />
      )}

      {modal && (
        <SocioFormModal
          key={modal.socio?.id ?? 'new'}
          socio={modal.socio}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

interface SocioFormModalProps {
  socio: Socio | null;
  onClose: () => void;
}

/** Modal de criação/edição de sócio. */
function SocioFormModal({ socio, onClose }: SocioFormModalProps) {
  const toast = useToast();
  const createSocio = useCreateSocio();
  const updateSocio = useUpdateSocio();
  const isEdit = socio !== null;

  const [name, setName] = useState(socio?.name ?? '');
  const [documento, setDocumento] = useState(socio?.document ?? '');
  const [participacao, setParticipacao] = useState(
    socio?.participacao != null ? String(socio.participacao) : '',
  );
  const [email, setEmail] = useState(socio?.email ?? '');
  const [phone, setPhone] = useState(socio?.phone ?? '');
  const [notes, setNotes] = useState(socio?.notes ?? '');

  const saving = createSocio.isPending || updateSocio.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input: SocioInput = {
      name: name.trim(),
      document: documento.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
      participacao: Number.parseFloat(participacao) || 0,
    };

    const onSuccess = () => {
      toast.show(isEdit ? 'Sócio atualizado' : 'Sócio criado', 'success');
      onClose();
    };
    const onError = (error: Error) => toast.show(error.message, 'danger');

    if (isEdit && socio) {
      updateSocio.mutate({ id: socio.id, input }, { onSuccess, onError });
    } else {
      createSocio.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editar Sócio' : 'Novo Sócio'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-socio" disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </>
      }
    >
      <form id="form-socio" onSubmit={handleSubmit}>
        <FormField label="Nome/Razão Social *" htmlFor="socio-name">
          <Input
            id="socio-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </FormField>

        <div className="form-row">
          <FormField label="CPF/CNPJ" htmlFor="socio-doc">
            <Input
              id="socio-doc"
              value={documento}
              onChange={(event) => setDocumento(event.target.value)}
            />
          </FormField>
          <FormField label="Participação % *" htmlFor="socio-part">
            <Input
              id="socio-part"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={participacao}
              onChange={(event) => setParticipacao(event.target.value)}
              required
            />
          </FormField>
        </div>

        <div className="form-row">
          <FormField label="Email" htmlFor="socio-email">
            <Input
              id="socio-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
          <FormField label="Telefone" htmlFor="socio-phone">
            <Input
              id="socio-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="(00) 00000-0000"
            />
          </FormField>
        </div>

        <FormField label="Notas" htmlFor="socio-notes">
          <Textarea
            id="socio-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </FormField>
      </form>
    </Modal>
  );
}
