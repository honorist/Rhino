import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import DataTable, { type Column } from '../../components/ui/DataTable';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import FormField from '../../components/ui/FormField';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/native-select';

import Spinner from '../../components/ui/Spinner';
import { toast } from 'sonner';
import { useCurrentUser } from '../auth/queries';
import {
  useCreateUser,
  useNiveisAcesso,
  useRemoveUser,
  useUpdateUser,
  useUsers,
} from './queries';
import type { NivelAcesso, User, UserInput } from './types';

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

/** Tela de Usuários e Acessos — migração de js/views/Usuarios.js. */
export default function Usuarios() {
  const usersQuery = useUsers();
  const niveisQuery = useNiveisAcesso();
  const currentUserQuery = useCurrentUser();
  const removeUser = useRemoveUser();

  /** null = modal fechado · { user: null } = novo · { user } = edição. */
  const [modal, setModal] = useState<{ user: User | null } | null>(null);

  const niveis = niveisQuery.data ?? [];
  const niveisById: Record<string, NivelAcesso> = Object.fromEntries(
    niveis.map((nivel) => [nivel.id, nivel]),
  );
  const meEmail = currentUserQuery.data?.user.email;

  function handleDelete(user: User) {
    if (!window.confirm(`Excluir o usuário ${user.email}?`)) return;
    removeUser.mutate(user.id, {
      onSuccess: () => toast.success('Usuário excluído'),
      onError: (error) => toast.error(error.message),
    });
  }

  const columns: Column<User>[] = [
    {
      header: 'Email',
      cell: (user) => (
        <>
          {user.email}
          {user.email === meEmail && (
            <span
              style={{ color: 'var(--color-text-muted)', fontSize: 12, marginLeft: 6 }}
            >
              (você)
            </span>
          )}
        </>
      ),
    },
    { header: 'Nome', cell: (user) => user.name || '—' },
    {
      header: 'Nível de acesso',
      cell: (user) => {
        const nivel = user.nivelAcessoId ? niveisById[user.nivelAcessoId] : undefined;
        return nivel ? (
          <span style={{ color: nivel.cor, fontWeight: 600 }}>
            {nivel.icon} {nivel.label}
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-muted)' }}>sem nível</span>
        );
      },
    },
    {
      header: 'Status',
      cell: (user) =>
        user.isActive ? (
          <span style={{ color: '#10b981' }}>Ativo</span>
        ) : (
          <span style={{ color: '#aaa' }}>Desativado</span>
        ),
    },
    { header: 'Último login', cell: (user) => formatDateTime(user.lastLoginAt) },
    {
      header: 'Ações',
      width: '120px',
      cell: (user) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setModal({ user })}
            aria-label="Editar usuário"
          >
            <Pencil size={14} />
          </Button>
          {user.email !== meEmail && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleDelete(user)}
              aria-label="Excluir usuário"
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Usuários e Acessos"
        actions={
          <Button onClick={() => setModal({ user: null })}>+ Novo Usuário</Button>
        }
      />

      <p
        style={{
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--sp-md)',
          fontSize: 14,
        }}
      >
        Cada usuário precisa de email + senha para entrar e tem um{' '}
        <strong>nível de acesso</strong> (perfil), que define quais abas ele vê.
      </p>

      {usersQuery.isLoading ? (
        <Spinner label="Carregando usuários..." />
      ) : usersQuery.isError ? (
        <Card style={{ padding: 24 }}>
          <p className="text-muted">
            Falha ao carregar usuários: {usersQuery.error.message}
          </p>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={usersQuery.data ?? []}
          rowKey={(user) => user.id}
          emptyMessage="Nenhum usuário ainda"
          showColumnToggle
        />
      )}

      {modal && (
        <UserFormModal
          key={modal.user?.id ?? 'new'}
          user={modal.user}
          niveis={niveis}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

interface UserFormModalProps {
  user: User | null;
  niveis: NivelAcesso[];
  onClose: () => void;
}

/** Modal de criação/edição de usuário. */
function UserFormModal({ user, niveis, onClose }: UserFormModalProps) {
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const isEdit = user !== null;

  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [nivelAcessoId, setNivelAcessoId] = useState(user?.nivelAcessoId ?? '');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [showPassword, setShowPassword] = useState(false);

  const saving = createUser.isPending || updateUser.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input: UserInput = {
      email: email.trim(),
      name: name.trim() || null,
      nivelAcessoId: nivelAcessoId || null,
    };
    if (password) input.password = password;

    const onSuccess = () => {
      toast.success(isEdit ? 'Usuário atualizado' : 'Usuário criado');
      onClose();
    };
    const onError = (error: Error) => toast.error(error.message);

    if (isEdit && user) {
      input.isActive = isActive;
      updateUser.mutate({ id: user.id, input }, { onSuccess, onError });
    } else {
      createUser.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <form id="form-user" onSubmit={handleSubmit}>
        <FormField label="Email *" htmlFor="user-email">
          <Input
            id="user-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </FormField>

        <FormField label="Nome" htmlFor="user-name">
          <Input
            id="user-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>

        <FormField
          label={isEdit ? 'Nova senha (vazio = não altera)' : 'Senha *'}
          htmlFor="user-password"
          helper="Mínimo 8 caracteres."
        >
          <div style={{ position: 'relative' }}>
            <Input
              id="user-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required={!isEdit}
              style={{ paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                padding: 0,
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </FormField>

        <FormField label="Nível de acesso" htmlFor="user-nivel">
          <Select
            id="user-nivel"
            value={nivelAcessoId}
            onChange={(event) => setNivelAcessoId(event.target.value)}
          >
            <option value="">— sem nível (sem restrição) —</option>
            {niveis.map((nivel) => (
              <option key={nivel.id} value={nivel.id}>
                {nivel.icon} {nivel.label}
              </option>
            ))}
          </Select>
        </FormField>

        {isEdit && (
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              <span>Usuário ativo (pode fazer login)</span>
            </label>
          </div>
        )}
      </form>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-user" disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
