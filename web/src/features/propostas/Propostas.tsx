import { useState, useCallback, useMemo, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import FormField from '../../components/ui/FormField';
import { Input } from '@/components/ui/input';

import { Combobox } from '../../components/ui/combobox';
import Spinner from '../../components/ui/Spinner';
import { toast } from 'sonner';
import { formatBRL } from '../../lib/format';
import type { Cliente } from '../clientes/types';
import { useClientes } from '../clientes/queries';
import { usePropostas } from '../resources';
import type { Proposta } from '../../types/domain';
import { useCriarProposta, useDeletarProposta, useDuplicarProposta } from './queries';
import { STATUS_COLORS, STATUS_LABELS, numeroCompleto } from './shared';
import DataTable, { type Column } from '../../components/ui/DataTable';

const num = (v: unknown): number => Number(v) || 0;

const TIPO_LABELS: Record<string, string> = {
  hh: 'HH',
  material: 'Material',
  ambos: 'HH + Material',
};

const CHIPS: { value: string; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'aceita', label: 'Aceita' },
  { value: 'rejeitada', label: 'Rejeitada' },
  { value: 'expirada', label: 'Expirada' },
];

function formatDate(d?: string): string {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR') : '—';
}

/** Lista de Propostas Comerciais — migração de js/views/Propostas.js. */
export default function Propostas() {
  const navigate = useNavigate();
  const propostasQuery = usePropostas();
  const duplicar = useDuplicarProposta();
  const deletar = useDeletarProposta();

  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);

  const todas = propostasQuery.data ?? [];
  const totalGeral = todas.length;
  const contagem = todas.reduce<Record<string, number>>((acc, p) => {
    const s = p.status ?? 'rascunho';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const termo = busca.toLowerCase().trim();
  const propostas = todas.filter((p) => {
    const matchStatus = filtro === 'todos' || p.status === filtro;
    const matchBusca =
      !termo ||
      [p.numero, p.titulo, p.clienteEmpresa, p.clienteNome, p.referencia].some(
        (campo) => String(campo ?? '').toLowerCase().includes(termo),
      );
    return matchStatus && matchBusca;
  });

  const handleDuplicar = useCallback((p: Proposta) => {
    if (
      !window.confirm(
        'Criar nova revisão dessa proposta? A revisão atual ficará arquivada para histórico.',
      )
    ) {
      return;
    }
    duplicar.mutate(p.id, {
      onSuccess: (r) => {
        toast.success('Nova revisão criada');
        if (r.proposta) navigate(`/proposta/${r.proposta.id}`);
      },
      onError: (error) => toast.error(`Erro: ${error.message}`),
    });
  }, [duplicar, navigate]);

  const handleExcluir = useCallback((p: Proposta) => {
    if (
      !window.confirm(
        `Excluir ${numeroCompleto(p)}? O contrato em prospecção vinculado NÃO ` +
          `será apagado, apenas desvinculado.`,
      )
    ) {
      return;
    }
    deletar.mutate(p.id, {
      onSuccess: () => toast.success('Proposta excluída'),
      onError: (error) => toast.error(`Erro: ${error.message}`),
    });
  }, [deletar]);

  const propostaColumns = useMemo((): Column<Proposta>[] => [
    {
      id: 'numero',
      header: 'Número',
      sortable: true,
      sortAccessor: (p) => p.numero ?? '',
      cell: (p) => <strong>{numeroCompleto(p)}</strong>,
    },
    {
      id: 'titulo',
      header: 'Título',
      cell: (p) => p.titulo || '—',
    },
    {
      id: 'cliente',
      header: 'Cliente',
      cell: (p) => p.clienteEmpresa || p.clienteNome || '—',
    },
    {
      id: 'tipo',
      header: 'Tipo',
      cell: (p) => (
        <Badge style={{ background: 'rgba(31,73,125,.12)', color: '#1F497D' }}>
          {TIPO_LABELS[p.tipo ?? ''] ?? p.tipo ?? '—'}
        </Badge>
      ),
    },
    {
      id: 'valor',
      header: 'Valor',
      sortable: true,
      sortAccessor: (p) => num(p.valorTotal),
      align: 'right',
      cell: (p) => <strong>{formatBRL(num(p.valorTotal))}</strong>,
    },
    {
      id: 'emissao',
      header: 'Emissão',
      sortable: true,
      sortAccessor: (p) => p.dataEmissao ?? '',
      cell: (p) => formatDate(p.dataEmissao),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (p) => {
        const cor = STATUS_COLORS[p.status ?? 'rascunho'] ?? STATUS_COLORS.rascunho;
        return (
          <Badge style={{ background: cor.bg, color: cor.fg, border: `1px solid ${cor.border}` }}>
            {STATUS_LABELS[p.status ?? 'rascunho'] ?? p.status}
          </Badge>
        );
      },
    },
    {
      id: 'contrato',
      header: 'Contrato',
      cell: (p) =>
        p.contratoId ? (
          <Link
            className="action-link"
            to={`/contratos/${p.contratoId}`}
            onClick={(e) => e.stopPropagation()}
          >
            🔗 Ver
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      id: 'acoes',
      header: 'Ações',
      hideable: false,
      cell: (p) => (
        <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <Link className="action-link" to={`/proposta/${p.id}`}>Editar</Link>
          <a className="action-link" style={{ cursor: 'pointer' }} onClick={() => handleDuplicar(p)}>Rev.+1</a>
          <a className="action-link danger" style={{ cursor: 'pointer' }} onClick={() => handleExcluir(p)}>Excluir</a>
        </div>
      ),
    },
  ] as Column<Proposta>[], [handleDuplicar, handleExcluir]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Propostas Comerciais</h1>
          <p className="page-subtitle">
            {totalGeral} proposta{totalGeral !== 1 ? 's' : ''} no total
            {propostas.length !== totalGeral &&
              ` · ${propostas.length} exibida${
                propostas.length !== 1 ? 's' : ''
              }`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="lg" asChild>
            <Link to="/apresentacao">🏢 Apresentação</Link>
          </Button>
          <Button variant="secondary" size="lg" asChild>
            <Link to="/clausulas">📖 Cláusulas</Link>
          </Button>
          <Button size="lg" onClick={() => setNovaAberta(true)}>
            + Nova Proposta
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
        {CHIPS.map((chip) => {
          const n =
            chip.value === 'todos' ? totalGeral : contagem[chip.value] ?? 0;
          return (
            <Button
              key={chip.value}
              size="sm"
              variant={filtro === chip.value ? 'primary' : 'secondary'}
              onClick={() => setFiltro(chip.value)}
            >
              {chip.label}
              {n > 0 ? ` (${n})` : ''}
            </Button>
          );
        })}
      </div>

      <Card
        style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-lg)' }}
      >
        <Input
          placeholder="🔍 Buscar por número, título, cliente ou referência..."
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
        />
      </Card>

      {propostasQuery.isLoading ? (
        <Spinner label="Carregando propostas..." />
      ) : propostasQuery.isError ? (
        <Card style={{ padding: 24 }}>
          <p className="text-danger">Erro ao carregar propostas.</p>
        </Card>
      ) : (
        <DataTable
          rows={propostas}
          columns={propostaColumns}
          rowKey={(p) => String(p.id)}
          onRowClick={(p) => navigate(`/proposta/${p.id}`)}
          emptyMessage={
            termo || filtro !== 'todos'
              ? 'Nenhuma proposta encontrada com esses filtros'
              : 'Nenhuma proposta cadastrada.'
          }
          showColumnToggle
        />
      )}

      {novaAberta && <NovaPropostaModal onClose={() => setNovaAberta(false)} />}
    </>
  );
}

const TIPOS: { value: string; titulo: string; desc: string }[] = [
  { value: 'hh', titulo: 'Mão de Obra (HH)', desc: 'Apenas serviço/horas' },
  { value: 'material', titulo: 'Material', desc: 'Apenas fornecimento' },
  { value: 'ambos', titulo: 'HH + Material', desc: 'Completo' },
];

function NovaPropostaModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const clientesQuery = useClientes();
  const criar = useCriarProposta();

  const [clienteId, setClienteId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [referencia, setReferencia] = useState('');
  const [tipo, setTipo] = useState('ambos');

  const clientes = clientesQuery.data ?? [];

  function clienteLabel(c: Cliente): string {
    const base = c.empresa || c.nome;
    return c.nome && c.empresa && c.nome !== c.empresa
      ? `${base} (${c.nome})`
      : base;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!titulo.trim()) {
      toast.error('Título é obrigatório');
      return;
    }
    if (!clienteId) {
      toast.error('Selecione um cliente');
      return;
    }
    criar.mutate(
      {
        clienteId,
        titulo: titulo.trim(),
        referencia: referencia.trim() || null,
        tipo,
      },
      {
        onSuccess: (r) => {
          toast.success('Proposta criada — contrato em prospecção gerado');
          if (r.proposta) navigate(`/proposta/${r.proposta.id}`);
        },
        onError: (error) => toast.error(`Erro: ${error.message}`),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Nova Proposta Comercial</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <form id="form-nova-proposta" onSubmit={handleSubmit}>
        <FormField
          label="Cliente *"
          htmlFor="np-cliente"
          helper="Os dados do cliente serão preenchidos automaticamente."
        >
          <Combobox
            options={clientes.map((c) => ({ value: c.id, label: clienteLabel(c) }))}
            value={clienteId}
            onChange={setClienteId}
            placeholder="— Selecione um cliente —"
            searchPlaceholder="Pesquisar cliente..."
            emptyText="Nenhum cliente encontrado."
            disabled={clientesQuery.isLoading}
          />
        </FormField>

        <FormField label="Título da Proposta *" htmlFor="np-titulo">
          <Input
            id="np-titulo"
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
            required
            placeholder="Ex.: Fabricação e montagem de tubulação industrial"
          />
        </FormField>

        <FormField
          label="Referência / Identificação da Obra"
          htmlFor="np-ref"
        >
          <Input
            id="np-ref"
            value={referencia}
            onChange={(event) => setReferencia(event.target.value)}
            placeholder="Ex.: Linha L-202 — Tanque T-401"
          />
        </FormField>

        <div className="form-group">
          <label className="form-label">Tipo *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {TIPOS.map((t) => {
              const ativo = tipo === t.value;
              return (
                <label
                  key={t.value}
                  style={{
                    flex: 1,
                    cursor: 'pointer',
                    border: `1.5px solid ${
                      ativo ? 'var(--color-primary)' : 'var(--color-border)'
                    }`,
                    background: ativo ? 'rgba(31,73,125,.06)' : undefined,
                    borderRadius: 8,
                    padding: 10,
                    textAlign: 'center',
                  }}
                >
                  <input
                    type="radio"
                    name="tipo"
                    value={t.value}
                    checked={ativo}
                    onChange={() => setTipo(t.value)}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontWeight: 600 }}>{t.titulo}</div>
                  <small className="text-muted">{t.desc}</small>
                </label>
              );
            })}
          </div>
        </div>
      </form>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-nova-proposta" disabled={criar.isPending}>
            {criar.isPending ? 'Criando...' : 'Criar Proposta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
