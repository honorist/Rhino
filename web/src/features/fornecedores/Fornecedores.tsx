import { useState, type FormEvent, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import DataTable, { type Column } from '../../components/ui/DataTable';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import FormField from '../../components/ui/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/native-select';

import Spinner from '../../components/ui/Spinner';
import { toast } from 'sonner';
import type { Fornecedor } from '../../types/domain';
import {
  useCreateFornecedor,
  useFornecedores,
  useRemoveFornecedor,
  useUpdateFornecedor,
} from '../resources';

type FornecedorInput = Partial<Omit<Fornecedor, 'id'>>;

const SUGESTOES_MATERIAIS = [
  'Elétrica', 'Estrutura Metálica', 'Andaime', 'Solda', 'Pintura',
  'Hidráulica', 'Alvenaria', 'Ferragens', 'Cimento', 'Madeira',
  'EPI', 'Ferramentas', 'Transporte', 'Hospedagem', 'Combustível',
];

function uniqueMateriais(fornecedores: Fornecedor[]): string[] {
  return [...new Set(fornecedores.flatMap((f) => f.materiais ?? []))].sort();
}

/** Tela de Fornecedores — migração de js/views/Fornecedores.js. */
export default function Fornecedores() {
  const fornecedoresQuery = useFornecedores();
  const removeFornecedor = useRemoveFornecedor();

  const [busca, setBusca] = useState('');
  const [filtroMaterial, setFiltroMaterial] = useState('');
  const [modal, setModal] = useState<{ fornecedor: Fornecedor | null } | null>(null);

  const fornecedores = fornecedoresQuery.data ?? [];
  const todosMateriais = uniqueMateriais(fornecedores);

  const termo = busca.toLowerCase().trim();
  const filtrados = fornecedores.filter((f) => {
    const matchBusca =
      !termo ||
      (f.nome ?? '').toLowerCase().includes(termo) ||
      (f.cnpj ?? '').includes(termo) ||
      (f.pessoaContato ?? '').toLowerCase().includes(termo) ||
      (f.telefone ?? '').includes(termo);
    const matchMaterial =
      !filtroMaterial || (f.materiais ?? []).includes(filtroMaterial);
    return matchBusca && matchMaterial;
  });

  function handleDelete(fornecedor: Fornecedor) {
    if (!window.confirm('Excluir este fornecedor?')) return;
    removeFornecedor.mutate(fornecedor.id, {
      onSuccess: () => toast.success('Fornecedor removido'),
      onError: (error) => toast.error(error.message),
    });
  }

  const columns: Column<Fornecedor>[] = [
    {
      header: 'Empresa',
      cell: (f) => (
        <div>
          <strong>{f.nome || '—'}</strong>
          {f.telefone && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              📞 {f.telefone}
            </div>
          )}
          {f.endereco && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              📍 {f.endereco.slice(0, 50)}
              {f.endereco.length > 50 ? '…' : ''}
            </div>
          )}
        </div>
      ),
    },
    { header: 'CNPJ', cell: (f) => <code>{f.cnpj || '—'}</code> },
    { header: 'Contato', cell: (f) => f.pessoaContato || '—' },
    {
      header: 'Materiais',
      cell: (f) =>
        f.materiais && f.materiais.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {f.materiais.map((material) => (
              <Badge key={material}>{material}</Badge>
            ))}
          </div>
        ) : (
          '—'
        ),
    },
    {
      header: 'Dados Bancários',
      cell: (f) => {
        if (!f.banco && !f.conta && !f.chavePix) return '—';
        return (
          <div style={{ fontSize: 13 }}>
            {(f.banco || f.conta) && (
              <div>
                🏦 {f.banco ?? ''} {f.agencia ? `Ag. ${f.agencia}` : ''}{' '}
                {f.conta ? `C. ${f.conta}` : ''}
              </div>
            )}
            {f.chavePix && (
              <div style={{ color: 'var(--color-info)', fontFamily: 'monospace' }}>
                📱 PIX: {f.chavePix}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: 'Ações',
      width: '120px',
      cell: (f) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setModal({ fornecedor: f })}
            aria-label="Editar fornecedor"
          >
            <Pencil size={14} />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleDelete(f)}
            aria-label="Excluir fornecedor"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  const total = fornecedores.length;

  return (
    <>
      <PageHeader
        title="Fornecedores"
        subtitle={`${total} fornecedor${total !== 1 ? 'es' : ''} cadastrado${total !== 1 ? 's' : ''}`}
        actions={
          <Button onClick={() => setModal({ fornecedor: null })}>
            + Novo Fornecedor
          </Button>
        }
      />

      <Card style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-lg)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 'var(--sp-md)',
          }}
        >
          <Input
            placeholder="🔍 Buscar por nome, CNPJ, contato ou telefone..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
          <Select
            value={filtroMaterial}
            onChange={(event) => setFiltroMaterial(event.target.value)}
            style={{ minWidth: 200 }}
          >
            <option value="">Todos os materiais</option>
            {todosMateriais.map((material) => (
              <option key={material} value={material}>
                {material}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {fornecedoresQuery.isLoading ? (
        <Spinner label="Carregando fornecedores..." />
      ) : fornecedoresQuery.isError ? (
        <Card style={{ padding: 24 }}>
          <p className="text-danger">
            Erro ao carregar fornecedores. Tente novamente.
          </p>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={filtrados}
          rowKey={(f) => f.id}
          emptyMessage={
            termo || filtroMaterial
              ? 'Nenhum fornecedor encontrado para os filtros'
              : 'Nenhum fornecedor cadastrado'
          }
          showColumnToggle
        />
      )}

      {modal && (
        <FornecedorFormModal
          key={modal.fornecedor?.id ?? 'new'}
          fornecedor={modal.fornecedor}
          sugestoes={[...new Set([...SUGESTOES_MATERIAIS, ...todosMateriais])].sort()}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

interface FornForm {
  nome: string;
  cnpj: string;
  endereco: string;
  telefone: string;
  pessoaContato: string;
  materiais: string;
  banco: string;
  agencia: string;
  conta: string;
  chavePix: string;
  notas: string;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--color-text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        margin: 'var(--sp-lg) 0 var(--sp-sm)',
      }}
    >
      {children}
    </div>
  );
}

interface FornecedorFormModalProps {
  fornecedor: Fornecedor | null;
  sugestoes: string[];
  onClose: () => void;
}

/** Modal de criação/edição de fornecedor. */
function FornecedorFormModal({
  fornecedor,
  sugestoes,
  onClose,
}: FornecedorFormModalProps) {
  const createFornecedor = useCreateFornecedor();
  const updateFornecedor = useUpdateFornecedor();
  const isEdit = fornecedor !== null;

  const [form, setForm] = useState<FornForm>({
    nome: fornecedor?.nome ?? '',
    cnpj: fornecedor?.cnpj ?? '',
    endereco: fornecedor?.endereco ?? '',
    telefone: fornecedor?.telefone ?? '',
    pessoaContato: fornecedor?.pessoaContato ?? '',
    materiais: (fornecedor?.materiais ?? []).join(', '),
    banco: fornecedor?.banco ?? '',
    agencia: fornecedor?.agencia ?? '',
    conta: fornecedor?.conta ?? '',
    chavePix: fornecedor?.chavePix ?? '',
    notas: fornecedor?.notas ?? '',
  });

  function set<K extends keyof FornForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const saving = createFornecedor.isPending || updateFornecedor.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input: FornecedorInput = {
      nome: form.nome.trim(),
      cnpj: form.cnpj.trim() || undefined,
      endereco: form.endereco.trim() || undefined,
      telefone: form.telefone.trim() || undefined,
      pessoaContato: form.pessoaContato.trim() || undefined,
      materiais: form.materiais
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      banco: form.banco.trim() || undefined,
      agencia: form.agencia.trim() || undefined,
      conta: form.conta.trim() || undefined,
      chavePix: form.chavePix.trim() || undefined,
      notas: form.notas.trim() || undefined,
    };

    const onSuccess = () => {
      toast.success(
        isEdit ? 'Fornecedor atualizado' : 'Fornecedor criado'
);
      onClose();
    };
    const onError = (error: Error) => toast.error(error.message);

    if (isEdit && fornecedor) {
      updateFornecedor.mutate({ id: fornecedor.id, input }, { onSuccess, onError });
    } else {
      createFornecedor.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <form id="form-fornecedor" onSubmit={handleSubmit}>
        <SectionLabel>Dados da Empresa</SectionLabel>
        <div className="form-row">
          <FormField label="Nome / Razão Social *" htmlFor="forn-nome">
            <Input
              id="forn-nome"
              value={form.nome}
              onChange={(event) => set('nome', event.target.value)}
              required
            />
          </FormField>
          <FormField label="CNPJ" htmlFor="forn-cnpj">
            <Input
              id="forn-cnpj"
              value={form.cnpj}
              onChange={(event) => set('cnpj', event.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </FormField>
        </div>
        <FormField label="Endereço" htmlFor="forn-endereco">
          <Textarea
            id="forn-endereco"
            value={form.endereco}
            onChange={(event) => set('endereco', event.target.value)}
            placeholder="Rua, número, bairro, cidade — UF, CEP"
          />
        </FormField>

        <SectionLabel>Contato</SectionLabel>
        <div className="form-row">
          <FormField label="Telefone" htmlFor="forn-telefone">
            <Input
              id="forn-telefone"
              value={form.telefone}
              onChange={(event) => set('telefone', event.target.value)}
              placeholder="(00) 00000-0000"
            />
          </FormField>
          <FormField label="Pessoa de Contato" htmlFor="forn-contato">
            <Input
              id="forn-contato"
              value={form.pessoaContato}
              onChange={(event) => set('pessoaContato', event.target.value)}
              placeholder="Nome do vendedor/atendente"
            />
          </FormField>
        </div>

        <SectionLabel>Materiais que Fornece</SectionLabel>
        <FormField
          label="Tipos de Material / Serviço"
          htmlFor="forn-materiais"
          helper="Separe múltiplos materiais por vírgula."
        >
          <>
            <Input
              id="forn-materiais"
              list="sugestoes-materiais"
              value={form.materiais}
              onChange={(event) => set('materiais', event.target.value)}
              placeholder="Ex: Elétrica, Estrutura Metálica, Andaime"
            />
            <datalist id="sugestoes-materiais">
              {sugestoes.map((sugestao) => (
                <option key={sugestao} value={sugestao} />
              ))}
            </datalist>
          </>
        </FormField>

        <SectionLabel>Dados para Pagamento</SectionLabel>
        <div className="form-row">
          <FormField label="Banco" htmlFor="forn-banco">
            <Input
              id="forn-banco"
              value={form.banco}
              onChange={(event) => set('banco', event.target.value)}
              placeholder="Ex: Itaú, Bradesco, Nubank"
            />
          </FormField>
          <FormField label="Agência" htmlFor="forn-agencia">
            <Input
              id="forn-agencia"
              value={form.agencia}
              onChange={(event) => set('agencia', event.target.value)}
              placeholder="0000"
            />
          </FormField>
        </div>
        <div className="form-row">
          <FormField label="Conta" htmlFor="forn-conta">
            <Input
              id="forn-conta"
              value={form.conta}
              onChange={(event) => set('conta', event.target.value)}
              placeholder="00000-0"
            />
          </FormField>
          <FormField label="Chave PIX" htmlFor="forn-pix">
            <Input
              id="forn-pix"
              value={form.chavePix}
              onChange={(event) => set('chavePix', event.target.value)}
              placeholder="CPF, e-mail, telefone ou aleatória"
            />
          </FormField>
        </div>

        <SectionLabel>Observações</SectionLabel>
        <FormField label="Condições comerciais, prazo de entrega, etc." htmlFor="forn-notas">
          <Textarea
            id="forn-notas"
            value={form.notas}
            onChange={(event) => set('notas', event.target.value)}
          />
        </FormField>
      </form>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-fornecedor" disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
