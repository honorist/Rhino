import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Select, Textarea } from '../../components/ui/controls';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/ToastContext';
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
  const toast = useToast();
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
      { onError: (error) => toast.show(`Erro: ${error.message}`, 'danger') },
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
      onSuccess: () => toast.show('Cláusula excluída', 'success'),
      onError: (error) => toast.show(`Erro: ${error.message}`, 'danger'),
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
          <Link className="btn btn-secondary btn-lg" to="/proposta">
            ← Voltar para Propostas
          </Link>
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

      <div
        className="card"
        style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-lg)' }}
      >
        <Input
          placeholder="🔍 Buscar por título, texto ou tag..."
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
        />
      </div>

      {clausulasQuery.isLoading ? (
        <Spinner label="Carregando cláusulas..." />
      ) : clausulasQuery.isError ? (
        <div className="card" style={{ padding: 24 }}>
          <p className="text-danger">Erro ao carregar cláusulas.</p>
        </div>
      ) : clausulas.length === 0 ? (
        <div
          className="card"
          style={{
            padding: 'var(--sp-xl)',
            textAlign: 'center',
            color: 'var(--color-text-muted)',
          }}
        >
          Nenhuma cláusula encontrada.
        </div>
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
    <div
      className="card"
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
          <span
            className="badge"
            style={{ background: '#fee', color: '#900', fontSize: 11 }}
          >
            inativa
          </span>
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
            <span
              key={t}
              className="badge"
              style={{ background: '#f1f5f9', color: '#475569', fontSize: 10 }}
            >
              {t}
            </span>
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
    </div>
  );
}

interface TabelaProps {
  clausulas: Clausula[];
  onEditar: (c: Clausula) => void;
  onToggle: (c: Clausula) => void;
  onExcluir: (c: Clausula) => void;
}

function ClausulasTabela({
  clausulas,
  onEditar,
  onToggle,
  onExcluir,
}: TabelaProps) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Categoria</th>
              <th>Texto</th>
              <th>Tags</th>
              <th style={{ textAlign: 'center' }}>Uso</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {clausulas.map((c) => {
              const tags = c.tags ?? [];
              return (
                <tr key={c.id} style={{ opacity: c.ativa ? 1 : 0.55 }}>
                  <td>
                    <strong>{c.titulo}</strong>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: 12,
                        color: '#1F497D',
                        fontWeight: 600,
                      }}
                    >
                      {categoriaLabel(c.categoria)}
                    </span>
                  </td>
                  <td
                    style={{
                      fontSize: 13,
                      color: 'var(--color-text-muted)',
                      maxWidth: 380,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.texto.length > 120
                      ? `${c.texto.slice(0, 120)}…`
                      : c.texto}
                  </td>
                  <td>
                    {tags.length === 0 ? (
                      <span className="text-muted" style={{ fontSize: 11 }}>
                        —
                      </span>
                    ) : (
                      tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="badge"
                          style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            fontSize: 10,
                            marginRight: 3,
                          }}
                        >
                          {t}
                        </span>
                      ))
                    )}
                  </td>
                  <td
                    style={{
                      textAlign: 'center',
                      fontWeight: 600,
                      color: (c.usoCount ?? 0) > 0 ? '#1F497D' : '#94a3b8',
                    }}
                  >
                    {c.usoCount ?? 0}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {c.ativa ? (
                      <span
                        className="badge"
                        style={{
                          background: 'rgba(16,185,129,.15)',
                          color: '#10b981',
                          fontSize: 11,
                        }}
                      >
                        ativa
                      </span>
                    ) : (
                      <span
                        className="badge"
                        style={{ background: '#fee', color: '#900', fontSize: 11 }}
                      >
                        inativa
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <a
                        className="action-link"
                        style={{ cursor: 'pointer' }}
                        onClick={() => onEditar(c)}
                      >
                        Editar
                      </a>
                      <a
                        className="action-link"
                        style={{ cursor: 'pointer' }}
                        onClick={() => onToggle(c)}
                      >
                        {c.ativa ? 'Desativar' : 'Ativar'}
                      </a>
                      <a
                        className="action-link danger"
                        style={{ cursor: 'pointer' }}
                        onClick={() => onExcluir(c)}
                      >
                        Excluir
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ClausulaModalProps {
  clausula: Clausula | null;
  onClose: () => void;
}

function ClausulaModal({ clausula, onClose }: ClausulaModalProps) {
  const toast = useToast();
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
      toast.show('Título e texto são obrigatórios', 'danger');
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
      toast.show(isEdit ? 'Cláusula atualizada' : 'Cláusula criada', 'success');
      onClose();
    };
    const onError = (error: Error) => toast.show(`Erro: ${error.message}`, 'danger');

    if (isEdit && clausula) {
      updateClausula.mutate({ id: clausula.id, input }, { onSuccess, onError });
    } else {
      createClausula.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editar Cláusula' : 'Nova Cláusula'}
      onClose={onClose}
      footer={
        <>
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
        </>
      }
    >
      <form id="form-clausula" onSubmit={handleSubmit}>
        <FormField label="Categoria *" htmlFor="cla-cat">
          <Select
            id="cla-cat"
            value={categoria}
            onChange={(event) => setCategoria(event.target.value)}
          >
            {CATEGORIAS_FORM.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Título *" htmlFor="cla-titulo">
          <Input
            id="cla-titulo"
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
            required
            placeholder="Ex.: EPIs e EPCs"
          />
        </FormField>
        <FormField label="Texto *" htmlFor="cla-texto">
          <Textarea
            id="cla-texto"
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            rows={8}
            required
          />
        </FormField>
        <FormField label="Tags (separadas por vírgula)" htmlFor="cla-tags">
          <Input
            id="cla-tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="seguranca, padrao, fabricacao"
          />
        </FormField>
      </form>
    </Modal>
  );
}
