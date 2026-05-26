import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/button';
import DataTable, { type Column, type FacetedFilter } from '../../components/ui/data-table';
import { Badge } from '../../components/ui/badge';
import Card from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import Spinner from '../../components/ui/spinner';
import { toast } from 'sonner';
import type { Clausula } from '../../types/domain';
import {
  useClausulas,
  useCreateClausula,
  useRemoveClausula,
  useUpdateClausula,
} from '../resources';

type ClausulaInput = Partial<Omit<Clausula, 'id'>>;
type ViewMode = 'cards' | 'tabela';

const CATEGORIAS: { value: string; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'obrigacoes_contratada', label: 'Obrigações da Contratada' },
  { value: 'obrigacoes_contratante', label: 'Obrigações da Contratante' },
  { value: 'pagamento', label: 'Pagamento' },
  { value: 'garantia', label: 'Garantia' },
  { value: 'geral', label: 'Geral' },
];

const CATEGORIAS_FORM = CATEGORIAS.filter((c) => c.value !== 'todas');

function categoriaLabel(value: string): string {
  return CATEGORIAS.find((c) => c.value === value)?.label ?? value;
}

const VIEW_STORAGE_KEY = 'clausulas-view';

/** Biblioteca de Cláusulas — migração de js/views/Clausulas.js. */
export default function Clausulas() {
  const clausulasQuery = useClausulas();
  const updateClausula = useUpdateClausula();
  const removeClausula = useRemoveClausula();

  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode) || 'cards',
  );
  const [modal, setModal] = useState<{ clausula: Clausula | null } | null>(null);

  const todas = clausulasQuery.data ?? [];
  const contagem = todas.reduce<Record<string, number>>((acc, c) => {
    acc[c.categoria] = (acc[c.categoria] ?? 0) + 1;
    return acc;
  }, {});

  const termo = busca.toLowerCase().trim();
  const clausulas = todas.filter((c) => {
    const matchCat = filtro === 'todas' || c.categoria === filtro;
    const matchBusca =
      !termo ||
      c.titulo.toLowerCase().includes(termo) ||
      c.texto.toLowerCase().includes(termo) ||
      (c.tags ?? []).join(' ').toLowerCase().includes(termo);
    return matchCat && matchBusca;
  });

  function trocarView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  function handleToggle(c: Clausula) {
    updateClausula.mutate(
      { id: c.id, input: { ativa: !c.ativa } },
      { onError: (error) => toast.error(`Erro: ${error.message}`) },
    );
  }

  function handleExcluir(c: Clausula) {
    if (
      !window.confirm(
        'Excluir esta cláusula? Propostas que já a usam não serão afetadas.',
      )
    ) {
      return;
    }
    removeClausula.mutate(c.id, {
      onSuccess: () => toast.success('Cláusula excluída'),
      onError: (error) => toast.error(`Erro: ${error.message}`),
    });
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Biblioteca de Cláusulas</h1>
          <p className="page-subtitle">
            {todas.length} cláusula{todas.length !== 1 ? 's' : ''} cadastrada
            {todas.length !== 1 ? 's' : ''} · reutilizáveis em propostas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            size="sm"
            variant={viewMode === 'cards' ? 'primary' : 'secondary'}
            onClick={() => trocarView('cards')}
          >
            ⊞ Cards
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'tabela' ? 'primary' : 'secondary'}
            onClick={() => trocarView('tabela')}
          >
            ☰ Tabela
          </Button>
          <Button variant="secondary" size="lg" asChild>
            <Link to="/proposta">← Voltar para Propostas</Link>
          </Button>
          <Button size="lg" onClick={() => setModal({ clausula: null })}>
            + Nova Cláusula
          </Button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          padding: '0 0 12px',
        }}
      >
        {CATEGORIAS.map((c) => (
          <Button
            key={c.value}
            size="sm"
            variant={filtro === c.value ? 'primary' : 'secondary'}
            onClick={() => setFiltro(c.value)}
          >
            {c.label}
            {c.value !== 'todas' && contagem[c.value]
              ? ` (${contagem[c.value]})`
              : ''}
          </Button>
        ))}
      </div>

      <Card
        style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-lg)' }}
      >
        <Input
          placeholder="🔍 Buscar por título, texto ou tag..."
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
        />
      </Card>

      {clausulasQuery.isLoading ? (
        <Spinner label="Carregando cláusulas..." />
      ) : clausulasQuery.isError ? (
        <Card style={{ padding: 24 }}>
          <p className="text-danger">Erro ao carregar cláusulas.</p>
        </Card>
      ) : clausulas.length === 0 ? (
        <Card
          style={{
            padding: 'var(--sp-xl)',
            textAlign: 'center',
            color: 'var(--color-text-muted)',
          }}
        >
          Nenhuma cláusula encontrada.
        </Card>
      ) : viewMode === 'tabela' ? (
        <ClausulasTabela
          clausulas={clausulas}
          onEditar={(c) => setModal({ clausula: c })}
          onToggle={handleToggle}
          onExcluir={handleExcluir}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
            gap: 16,
          }}
        >
          {clausulas.map((c) => (
            <ClausulaCard
              key={c.id}
              clausula={c}
              onEditar={() => setModal({ clausula: c })}
              onToggle={() => handleToggle(c)}
              onExcluir={() => handleExcluir(c)}
            />
          ))}
        </div>
      )}

      {modal && (
        <ClausulaModal
          key={modal.clausula?.id ?? 'new'}
          clausula={modal.clausula}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

interface CardProps {
  clausula: Clausula;
  onEditar: () => void;
  onToggle: () => void;
  onExcluir: () => void;
}

function ClausulaCard({ clausula, onEditar, onToggle, onExcluir }: CardProps) {
  const tags = clausula.tags ?? [];
  return (
    <Card
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: clausula.ativa ? 1 : 0.55,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <strong style={{ fontSize: 15 }}>{clausula.titulo}</strong>
        {!clausula.ativa && (
          <Badge style={{ background: '#fee', color: '#900', fontSize: 11 }}>
            inativa
          </Badge>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#1F497D', fontWeight: 600 }}>
        {categoriaLabel(clausula.categoria)}
      </div>
      <p
        style={{
          fontSize: 13,
          color: 'var(--color-text-muted)',
          lineHeight: 1.5,
          margin: 0,
          maxHeight: 96,
          overflow: 'hidden',
        }}
      >
        {clausula.texto}
      </p>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {tags.map((t) => (
            <Badge
              key={t}
              style={{ background: '#f1f5f9', color: '#475569', fontSize: 10 }}
            >
              {t}
            </Badge>
          ))}
        </div>
      )}
      {(clausula.usoCount ?? 0) > 0 && (
        <div style={{ fontSize: 11, color: '#888' }}>
          Usada em {clausula.usoCount} proposta(s)
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 'auto',
          paddingTop: 8,
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <a className="action-link" style={{ cursor: 'pointer' }} onClick={onEditar}>
          Editar
        </a>
        <a className="action-link" style={{ cursor: 'pointer' }} onClick={onToggle}>
          {clausula.ativa ? 'Desativar' : 'Ativar'}
        </a>
        <a
          className="action-link danger"
          style={{ cursor: 'pointer' }}
          onClick={onExcluir}
        >
          Excluir
        </a>
      </div>
    </Card>
  );
}

interface TabelaProps {
  clausulas: Clausula[];
  onEditar: (c: Clausula) => void;
  onToggle: (c: Clausula) => void;
  onExcluir: (c: Clausula) => void;
}

const CLAUSULA_COLUMNS = (
  onEditar: (c: Clausula) => void,
  onToggle: (c: Clausula) => void,
  onExcluir: (c: Clausula) => void,
): Column<Clausula>[] => [
  {
    header: 'Título',
    cell: (c) => <strong className={c.ativa ? '' : 'opacity-55'}>{c.titulo}</strong>,
    sortable: true,
    sortAccessor: (c) => c.titulo,
  },
  {
    header: 'Categoria',
    cell: (c) => (
      <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
        {categoriaLabel(c.categoria)}
      </span>
    ),
    sortable: true,
    sortAccessor: (c) => c.categoria,
  },
  {
    header: 'Texto',
    cell: (c) => (
      <span className="text-sm text-muted-foreground opacity-55 block max-w-[380px] truncate">
        {c.texto.length > 120 ? `${c.texto.slice(0, 120)}…` : c.texto}
      </span>
    ),
  },
  {
    header: 'Tags',
    cell: (c) => {
      const tags = c.tags ?? [];
      return tags.length === 0 ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 3).map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">
              {t}
            </Badge>
          ))}
        </div>
      );
    },
  },
  {
    header: 'Uso',
    align: 'center',
    sortable: true,
    sortAccessor: (c) => c.usoCount ?? 0,
    cell: (c) => (
      <span className={`font-semibold ${(c.usoCount ?? 0) > 0 ? 'text-blue-700' : 'text-muted-foreground'}`}>
        {c.usoCount ?? 0}
      </span>
    ),
  },
  {
    header: 'Status',
    align: 'center',
    cell: (c) =>
      c.ativa ? (
        <Badge variant="success" className="text-[11px]">ativa</Badge>
      ) : (
        <Badge variant="destructive" className="text-[11px] opacity-70">inativa</Badge>
      ),
  },
  {
    header: 'Ações',
    cell: (c) => (
      <div className="flex gap-3">
        <button type="button" className="action-link" onClick={() => onEditar(c)}>Editar</button>
        <button type="button" className="action-link" onClick={() => onToggle(c)}>
          {c.ativa ? 'Desativar' : 'Ativar'}
        </button>
        <button type="button" className="action-link danger" onClick={() => onExcluir(c)}>Excluir</button>
      </div>
    ),
  },
];

const CLAUSULA_FILTERS: FacetedFilter<Clausula>[] = [
  {
    id: 'status',
    label: 'Status',
    accessor: (c) => c.ativa,
    options: [
      { label: 'Ativa', value: true },
      { label: 'Inativa', value: false },
    ],
  },
  {
    id: 'categoria',
    label: 'Categoria',
    accessor: (c) => c.categoria,
    options: CATEGORIAS_FORM.map((cat) => ({ label: cat.label, value: cat.value })),
  },
];

function ClausulasTabela({
  clausulas,
  onEditar,
  onToggle,
  onExcluir,
}: TabelaProps) {
  const columns = CLAUSULA_COLUMNS(onEditar, onToggle, onExcluir);
  return (
    <Card className="p-4">
      <DataTable
        rows={clausulas}
        columns={columns}
        rowKey={(c) => c.id}
        emptyMessage="Nenhuma cláusula encontrada"
        searchPlaceholder="Buscar por título ou texto…"
        globalFilterFn={(c, q) =>
          c.titulo.toLowerCase().includes(q) || c.texto.toLowerCase().includes(q)
        }
        filters={CLAUSULA_FILTERS}
      />
    </Card>
  );
}

interface ClausulaModalProps {
  clausula: Clausula | null;
  onClose: () => void;
}

function ClausulaModal({ clausula, onClose }: ClausulaModalProps) {
  const createClausula = useCreateClausula();
  const updateClausula = useUpdateClausula();
  const isEdit = clausula !== null;

  const [categoria, setCategoria] = useState(
    clausula?.categoria ?? 'obrigacoes_contratada',
  );
  const [titulo, setTitulo] = useState(clausula?.titulo ?? '');
  const [texto, setTexto] = useState(clausula?.texto ?? '');
  const [tags, setTags] = useState((clausula?.tags ?? []).join(', '));

  const saving = createClausula.isPending || updateClausula.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!titulo.trim() || !texto.trim()) {
      toast.error('Título e texto são obrigatórios');
      return;
    }
    const input: ClausulaInput = {
      categoria,
      titulo: titulo.trim(),
      texto: texto.trim(),
      tags: tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };

    const onSuccess = () => {
      toast.success(isEdit ? 'Cláusula atualizada' : 'Cláusula criada');
      onClose();
    };
    const onError = (error: Error) => toast.error(`Erro: ${error.message}`);

    if (isEdit && clausula) {
      updateClausula.mutate({ id: clausula.id, input }, { onSuccess, onError });
    } else {
      createClausula.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar Cláusula' : 'Nova Cláusula'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6">
          <form
            id="form-clausula"
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="cla-cat">Categoria *</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger id="cla-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_FORM.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cla-titulo">Título *</Label>
              <Input
                id="cla-titulo"
                value={titulo}
                onChange={(event) => setTitulo(event.target.value)}
                required
                placeholder="Ex.: EPIs e EPCs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cla-texto">Texto *</Label>
              <Textarea
                id="cla-texto"
                value={texto}
                onChange={(event) => setTexto(event.target.value)}
                rows={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cla-tags">Tags (separadas por vírgula)</Label>
              <Input
                id="cla-tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="seguranca, padrao, fabricacao"
              />
            </div>
          </form>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-clausula" disabled={saving}>
            {saving
              ? 'Salvando...'
              : isEdit
                ? 'Salvar Alterações'
                : 'Criar Cláusula'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
