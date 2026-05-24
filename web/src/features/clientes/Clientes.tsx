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
import {
  useClientes,
  useCreateCliente,
  useDeleteCliente,
  useUpdateCliente,
} from './queries';
import type { Cliente, ClienteInput } from './types';

/** Tela de Clientes (CRM) — migração de js/views/Clientes.js. */
export default function Clientes() {
  const toast = useToast();
  const clientesQuery = useClientes();
  const deleteCliente = useDeleteCliente();

  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState<{ cliente: Cliente | null } | null>(null);

  const clientes = clientesQuery.data ?? [];
  const termo = busca.toLowerCase().trim();
  const filtrados = termo
    ? clientes.filter((c) =>
        [c.nome, c.empresa, c.email, c.telefone, c.cargo, c.setor]
          .some((campo) => (campo ?? '').toLowerCase().includes(termo)),
      )
    : clientes;

  function handleDelete(cliente: Cliente) {
    if (!window.confirm('Excluir este cliente?')) return;
    deleteCliente.mutate(cliente.id, {
      onSuccess: () => toast.show('Cliente removido', 'success'),
      onError: (error) => toast.show(error.message, 'danger'),
    });
  }

  const columns: Column<Cliente>[] = [
    { header: 'Nome', cell: (c) => <strong>{c.nome || '—'}</strong> },
    { header: 'Empresa', cell: (c) => c.empresa || '—' },
    {
      header: 'Cargo / Setor',
      cell: (c) =>
        c.cargo || c.setor ? (
          <div>
            {c.cargo && <div>{c.cargo}</div>}
            {c.setor && (
              <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                {c.setor}
              </div>
            )}
          </div>
        ) : (
          '—'
        ),
    },
    {
      header: 'Telefone',
      cell: (c) =>
        c.telefone ? (
          <a href={`tel:${c.telefone}`} style={{ color: 'var(--color-primary)' }}>
            {c.telefone}
          </a>
        ) : (
          '—'
        ),
    },
    {
      header: 'Email',
      cell: (c) =>
        c.email ? (
          <a href={`mailto:${c.email}`} style={{ color: 'var(--color-primary)' }}>
            {c.email}
          </a>
        ) : (
          '—'
        ),
    },
    {
      header: 'Ações',
      width: '120px',
      cell: (c) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setModal({ cliente: c })}
            aria-label="Editar cliente"
          >
            <Pencil size={14} />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleDelete(c)}
            aria-label="Excluir cliente"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  const total = clientes.length;

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${total} cliente${total !== 1 ? 's' : ''} cadastrado${total !== 1 ? 's' : ''}`}
        actions={
          <Button onClick={() => setModal({ cliente: null })}>
            + Novo Cliente
          </Button>
        }
      />

      <div
        className="card"
        style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-lg)' }}
      >
        <Input
          placeholder="🔍 Buscar por nome, empresa, email ou telefone..."
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
        />
      </div>

      {clientesQuery.isLoading ? (
        <Spinner label="Carregando clientes..." />
      ) : clientesQuery.isError ? (
        <div className="card" style={{ padding: 24 }}>
          <p className="text-danger">Erro ao carregar clientes. Tente novamente.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtrados}
          rowKey={(c) => c.id}
          emptyMessage={
            termo
              ? 'Nenhum cliente encontrado para a busca'
              : 'Nenhum cliente cadastrado'
          }
        />
      )}

      {modal && (
        <ClienteFormModal
          key={modal.cliente?.id ?? 'new'}
          cliente={modal.cliente}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

interface ClienteForm {
  nome: string;
  empresa: string;
  cargo: string;
  setor: string;
  telefone: string;
  email: string;
  endereco: string;
  notas: string;
  portalSenha: string;
  removerPortalAcesso: boolean;
}

interface ClienteFormModalProps {
  cliente: Cliente | null;
  onClose: () => void;
}

/** Modal de criação/edição de cliente. */
function ClienteFormModal({ cliente, onClose }: ClienteFormModalProps) {
  const toast = useToast();
  const createCliente = useCreateCliente();
  const updateCliente = useUpdateCliente();
  const isEdit = cliente !== null;
  const temPortal = Boolean(cliente?.portalEmail);

  const [form, setForm] = useState<ClienteForm>({
    nome: cliente?.nome ?? '',
    empresa: cliente?.empresa ?? '',
    cargo: cliente?.cargo ?? '',
    setor: cliente?.setor ?? '',
    telefone: cliente?.telefone ?? '',
    email: cliente?.email ?? '',
    endereco: cliente?.endereco ?? '',
    notas: cliente?.notas ?? '',
    portalSenha: '',
    removerPortalAcesso: false,
  });

  function setText<K extends keyof ClienteForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const saving = createCliente.isPending || updateCliente.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input: ClienteInput = {
      nome: form.nome.trim(),
      empresa: form.empresa.trim() || undefined,
      cargo: form.cargo.trim() || undefined,
      setor: form.setor.trim() || undefined,
      telefone: form.telefone.trim() || undefined,
      email: form.email.trim() || undefined,
      endereco: form.endereco.trim() || undefined,
      notas: form.notas.trim() || undefined,
    };
    if (form.portalSenha) {
      input.portalSenha = form.portalSenha;
      if (input.email) input.portalEmail = input.email;
    }
    if (form.removerPortalAcesso) input.removerPortalAcesso = true;

    const onSuccess = () => {
      toast.show(isEdit ? 'Cliente atualizado' : 'Cliente criado', 'success');
      onClose();
    };
    const onError = (error: Error) => toast.show(error.message, 'danger');

    if (isEdit && cliente) {
      updateCliente.mutate({ id: cliente.id, input }, { onSuccess, onError });
    } else {
      createCliente.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editar Cliente' : 'Novo Cliente'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-cliente" disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </>
      }
    >
      <form id="form-cliente" onSubmit={handleSubmit}>
        <div className="form-row">
          <FormField label="Nome *" htmlFor="cli-nome">
            <Input
              id="cli-nome"
              value={form.nome}
              onChange={(event) => setText('nome', event.target.value)}
              required
            />
          </FormField>
          <FormField label="Empresa" htmlFor="cli-empresa">
            <Input
              id="cli-empresa"
              value={form.empresa}
              onChange={(event) => setText('empresa', event.target.value)}
              placeholder="Razão social"
            />
          </FormField>
        </div>

        <div className="form-row">
          <FormField label="Cargo" htmlFor="cli-cargo">
            <Input
              id="cli-cargo"
              value={form.cargo}
              onChange={(event) => setText('cargo', event.target.value)}
              placeholder="Ex: Gerente de Compras"
            />
          </FormField>
          <FormField label="Setor" htmlFor="cli-setor">
            <Input
              id="cli-setor"
              value={form.setor}
              onChange={(event) => setText('setor', event.target.value)}
              placeholder="Ex: Engenharia, TI, Operações"
            />
          </FormField>
        </div>

        <div className="form-row">
          <FormField label="Telefone" htmlFor="cli-telefone">
            <Input
              id="cli-telefone"
              value={form.telefone}
              onChange={(event) => setText('telefone', event.target.value)}
              placeholder="(00) 00000-0000"
            />
          </FormField>
          <FormField label="Email" htmlFor="cli-email">
            <Input
              id="cli-email"
              type="email"
              value={form.email}
              onChange={(event) => setText('email', event.target.value)}
              placeholder="email@exemplo.com"
            />
          </FormField>
        </div>

        <FormField label="Endereço" htmlFor="cli-endereco">
          <Input
            id="cli-endereco"
            value={form.endereco}
            onChange={(event) => setText('endereco', event.target.value)}
            placeholder="Rua, número, bairro, cidade — UF"
          />
        </FormField>

        <FormField label="Notas" htmlFor="cli-notas">
          <Textarea
            id="cli-notas"
            value={form.notas}
            onChange={(event) => setText('notas', event.target.value)}
          />
        </FormField>

        <div
          className="form-group"
          style={{
            marginTop: 'var(--sp-md)',
            paddingTop: 'var(--sp-md)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>
            Acesso ao Portal do Cliente
          </h3>
          <p
            style={{
              margin: '0 0 var(--sp-sm)',
              fontSize: 13,
              color: 'var(--color-text-muted)',
            }}
          >
            O cliente entrará com o email cadastrado acima.
            {temPortal ? ' Portal atualmente ativo.' : ''}
          </p>
          <FormField
            label={temPortal ? 'Nova senha (vazio = manter)' : 'Senha de acesso'}
            htmlFor="cli-portal-senha"
          >
            <Input
              id="cli-portal-senha"
              type="password"
              autoComplete="new-password"
              value={form.portalSenha}
              onChange={(event) => setText('portalSenha', event.target.value)}
              placeholder={
                temPortal
                  ? 'Deixe vazio para manter a senha atual'
                  : 'Definir senha de acesso ao portal'
              }
            />
          </FormField>
          {temPortal && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--color-danger)',
              }}
            >
              <input
                type="checkbox"
                checked={form.removerPortalAcesso}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    removerPortalAcesso: event.target.checked,
                  }))
                }
              />
              Remover acesso ao portal
            </label>
          )}
        </div>
      </form>
    </Modal>
  );
}
