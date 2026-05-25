import { useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import DataTable, { type Column } from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Select, Textarea } from '../../components/ui/controls';
import { DatePicker } from '../../components/ui/date-picker';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import type { BaseItem, BaseRecurrence, TipoBase } from '../../types/domain';
import type { Contract } from '../contracts/types';
import { useContracts } from '../contracts/queries';
import {
  useBase,
  useCreateBase,
  useRemoveBase,
  useTiposBase,
  useUpdateBase,
} from '../resources';
import { useAllocateBase } from './queries';

type BaseInput = Partial<Omit<BaseItem, 'id'>>;

const TIPO_FALLBACK: TipoBase = {
  id: 'outros',
  key: 'outros',
  label: 'Outros',
  icon: '🔹',
  cor: '#718096',
};

const FREQ_LABEL: Record<string, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatMonth(ym: string): string {
  if (!ym) return '';
  const [ano, mes] = ym.split('-').map(Number);
  const date = new Date(ano, mes - 1, 1);
  const label = date.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function shiftMonth(ym: string, delta: number): string {
  const [ano, mes] = ym.split('-').map(Number);
  const date = new Date(ano, mes - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function sumAllocations(item: BaseItem): number {
  return item.allocations.reduce((sum, alloc) => sum + alloc.value, 0);
}

/** Tela BASE — centro de custo mensal. Migração de js/views/Base.js. */
export default function Base() {
  const toast = useToast();
  const baseQuery = useBase();
  const tiposQuery = useTiposBase();
  const contractsQuery = useContracts();
  const removeBase = useRemoveBase();

  const [mes, setMes] = useState(currentYearMonth);
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [itemModal, setItemModal] = useState<{ item: BaseItem | null } | null>(null);
  const [alocarId, setAlocarId] = useState<string | null>(null);

  const itens = baseQuery.data ?? [];
  const tipos = tiposQuery.data ?? [];
  const contratos = contractsQuery.data ?? [];

  const tiposByKey: Record<string, TipoBase> = Object.fromEntries(
    tipos.map((tipo) => [tipo.key, tipo]),
  );
  const tipoOf = (key: string): TipoBase => tiposByKey[key] ?? TIPO_FALLBACK;

  const itensMes = itens.filter((item) => (item.date ?? '').slice(0, 7) === mes);
  const itensFiltrados =
    filtroTipo === 'todos'
      ? itensMes
      : itensMes.filter((item) =>
          (tiposByKey[item.type] ? item.type : 'outros') === filtroTipo,
        );

  const totalGeral = itens.reduce((sum, item) => sum + item.value, 0);
  const totalAlocado = itens.reduce((sum, item) => sum + sumAllocations(item), 0);
  const totalDisponivel = totalGeral - totalAlocado;
  const totalMes = itensMes.reduce((sum, item) => sum + item.value, 0);

  const mesesDisponiveis = [
    ...new Set(
      [...itens.map((item) => (item.date ?? '').slice(0, 7)).filter(Boolean), mes],
    ),
  ].sort().reverse();

  function handleDelete(item: BaseItem) {
    if (!window.confirm('Excluir este item e todas as suas alocações?')) return;
    removeBase.mutate(item.id, {
      onSuccess: () => toast.show('Item excluído', 'success'),
      onError: (error) => toast.show(error.message, 'danger'),
    });
  }

  const columns: Column<BaseItem>[] = [
    {
      header: 'Descrição',
      cell: (item) => <strong>{item.description}</strong>,
    },
    {
      header: 'Tipo',
      cell: (item) => {
        const tipo = tipoOf(tiposByKey[item.type] ? item.type : 'outros');
        return (
          <Badge
            style={{
              background: tipo.cor ? `${tipo.cor}22` : undefined,
              color: tipo.cor,
            }}
          >
            {tipo.icon} {tipo.label}
          </Badge>
        );
      },
    },
    {
      header: 'Data',
      cell: (item) =>
        item.date
          ? new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')
          : '—',
    },
    {
      header: 'Valor',
      align: 'right',
      cell: (item) => formatBRL(item.value),
    },
    {
      header: 'Alocações',
      cell: (item) =>
        item.allocations.length === 0 ? (
          <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            Nenhuma alocação
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {item.allocations.map((alloc, index) => (
              <div
                key={`${alloc.contractId}-${index}`}
                style={{ fontSize: 13, display: 'flex', gap: 8 }}
              >
                <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                  {contractLabel(contratos, alloc.contractId)}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--color-info)' }}>
                  {formatBRL(alloc.value)}
                </span>
              </div>
            ))}
          </div>
        ),
    },
    {
      header: 'Saldo',
      align: 'right',
      cell: (item) => {
        const saldo = item.value - sumAllocations(item);
        const cor =
          saldo > 0
            ? 'var(--color-warning)'
            : saldo === 0
              ? 'var(--color-success)'
              : 'var(--color-danger)';
        return <span style={{ fontWeight: 700, color: cor }}>{formatBRL(saldo)}</span>;
      },
    },
    {
      header: 'Ações',
      width: '170px',
      cell: (item) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAlocarId(item.id)}
          >
            Alocar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setItemModal({ item })}
            aria-label="Editar item"
          >
            <Pencil size={14} />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleDelete(item)}
            aria-label="Excluir item"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  const alocarItem = alocarId
    ? itens.find((item) => item.id === alocarId) ?? null
    : null;

  return (
    <>
      <PageHeader
        title="BASE — Centro de Custo"
        subtitle="Controle mensal por tipo de custo administrativo"
        actions={
          <Button onClick={() => setItemModal({ item: null })}>+ Novo Item</Button>
        }
      />

      {/* Controle de mês + KPIs globais */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setMes((m) => shiftMonth(m, -1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft size={16} />
          </Button>
          <Select
            value={mes}
            onChange={(event) => setMes(event.target.value)}
            style={{ minWidth: 190, fontWeight: 600 }}
          >
            {mesesDisponiveis.map((ym) => (
              <option key={ym} value={ym}>
                {formatMonth(ym)}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setMes((m) => shiftMonth(m, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
          <Kpi label="Total Geral" value={formatBRL(totalGeral)} />
          <Kpi
            label="Alocado"
            value={formatBRL(totalAlocado)}
            color="var(--color-info)"
          />
          <Kpi
            label="Não Alocado"
            value={formatBRL(totalDisponivel)}
            color={
              totalDisponivel >= 0
                ? 'var(--color-warning)'
                : 'var(--color-danger)'
            }
          />
        </div>
      </div>

      {/* Total do mês */}
      <Card
        style={{
          marginBottom: 'var(--sp-lg)',
          borderLeft: '4px solid var(--color-primary)',
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Total do Mês — {formatMonth(mes)}
        </div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: 'var(--color-primary)',
            marginTop: 4,
          }}
        >
          {formatBRL(totalMes)}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {itensMes.length} lançamento{itensMes.length !== 1 ? 's' : ''}
        </div>
      </Card>

      {/* Filtro por tipo */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: 'var(--sp-md)',
        }}
      >
        <Button
          size="sm"
          variant={filtroTipo === 'todos' ? 'primary' : 'secondary'}
          onClick={() => setFiltroTipo('todos')}
        >
          Todos
        </Button>
        {tipos.map((tipo) => (
          <Button
            key={tipo.key}
            size="sm"
            variant={filtroTipo === tipo.key ? 'primary' : 'secondary'}
            onClick={() => setFiltroTipo(tipo.key)}
          >
            {tipo.icon} {tipo.label}
          </Button>
        ))}
      </div>

      {baseQuery.isLoading ? (
        <Spinner label="Carregando BASE..." />
      ) : baseQuery.isError ? (
        <Card style={{ padding: 24 }}>
          <p className="text-danger">Erro ao carregar BASE. Tente novamente.</p>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={itensFiltrados}
          rowKey={(item) => item.id}
          emptyMessage="Nenhum item neste período/filtro"
        />
      )}

      {itemModal && (
        <BaseItemModal
          key={itemModal.item?.id ?? 'new'}
          item={itemModal.item}
          tipos={tipos}
          onClose={() => setItemModal(null)}
        />
      )}

      {alocarItem && (
        <AllocateModal
          item={alocarItem}
          contratos={contratos}
          onClose={() => setAlocarId(null)}
        />
      )}
    </>
  );
}

function contractLabel(contracts: Contract[], id: string): string {
  const contract = contracts.find((c) => c.id === id);
  return contract ? String(contract.name ?? 'Contrato') : '⚠️ Removido';
}

function Kpi({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

interface BaseItemModalProps {
  item: BaseItem | null;
  tipos: TipoBase[];
  onClose: () => void;
}

/** Modal de criação/edição de item da BASE. */
function BaseItemModal({ item, tipos, onClose }: BaseItemModalProps) {
  const toast = useToast();
  const createBase = useCreateBase();
  const updateBase = useUpdateBase();
  const isEdit = item !== null;
  const recorrencia = item?.metadata?.recurrence;

  const [description, setDescription] = useState(item?.description ?? '');
  const [type, setType] = useState(item?.type ?? tipos[0]?.key ?? '');
  const [value, setValue] = useState(item ? String(item.value) : '');
  const [date, setDate] = useState(
    item?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [recAtivo, setRecAtivo] = useState(Boolean(recorrencia?.active));
  const [recInicio, setRecInicio] = useState(recorrencia?.startDate ?? '');
  const [recFim, setRecFim] = useState(recorrencia?.endDate ?? '');
  const [recFreq, setRecFreq] = useState<string>(
    recorrencia?.frequency ?? 'monthly',
  );

  const saving = createBase.isPending || updateBase.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (recAtivo && (!recInicio || !recFim)) {
      toast.show('Informe início e fim da recorrência', 'danger');
      return;
    }
    if (recAtivo && recFim < recInicio) {
      toast.show('Data final deve ser posterior à inicial', 'danger');
      return;
    }

    const recurrence: BaseRecurrence | undefined = recAtivo
      ? {
          active: true,
          startDate: recInicio,
          endDate: recFim,
          frequency: recFreq as BaseRecurrence['frequency'],
        }
      : undefined;

    const input: BaseInput = {
      description: description.trim(),
      type,
      value: Number.parseFloat(value) || 0,
      date,
      notes: notes.trim() || undefined,
      metadata: recurrence ? { recurrence } : {},
    };

    const onSuccess = () => {
      toast.show(isEdit ? 'Item atualizado' : 'Item criado', 'success');
      onClose();
    };
    const onError = (error: Error) => toast.show(error.message, 'danger');

    if (isEdit && item) {
      updateBase.mutate({ id: item.id, input }, { onSuccess, onError });
    } else {
      createBase.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editar Item BASE' : 'Novo Item BASE'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-base" disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </>
      }
    >
      <form id="form-base" onSubmit={handleSubmit}>
        <FormField label="Descrição *" htmlFor="base-desc">
          <Input
            id="base-desc"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </FormField>

        <div className="form-row">
          <FormField label="Tipo *" htmlFor="base-type">
            <Select
              id="base-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              required
            >
              {tipos.map((tipo) => (
                <option key={tipo.key} value={tipo.key}>
                  {tipo.icon} {tipo.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Valor (BRL) *" htmlFor="base-value">
            <Input
              id="base-value"
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          </FormField>
        </div>

        <FormField label="Data *" htmlFor="base-date">
          <DatePicker
            id="base-date"
            value={date}
            onChange={(val) => setDate(val)}
          />
        </FormField>

        <div
          className="form-group"
          style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: 'var(--sp-md)',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={recAtivo}
              onChange={(event) => setRecAtivo(event.target.checked)}
            />
            <span style={{ fontWeight: 600 }}>Item recorrente</span>
          </label>
        </div>

        {recAtivo && (
          <>
            <div className="form-row">
              <FormField label="Início *" htmlFor="base-rec-inicio">
                <DatePicker
                  id="base-rec-inicio"
                  value={recInicio}
                  onChange={(val) => setRecInicio(val)}
                />
              </FormField>
              <FormField label="Fim *" htmlFor="base-rec-fim">
                <DatePicker
                  id="base-rec-fim"
                  value={recFim}
                  onChange={(val) => setRecFim(val)}
                />
              </FormField>
            </div>
            <FormField label="Frequência *" htmlFor="base-rec-freq">
              <Select
                id="base-rec-freq"
                value={recFreq}
                onChange={(event) => setRecFreq(event.target.value)}
              >
                {Object.entries(FREQ_LABEL).map(([freq, label]) => (
                  <option key={freq} value={freq}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
          </>
        )}

        <FormField label="Observações" htmlFor="base-notes">
          <Textarea
            id="base-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </FormField>
      </form>
    </Modal>
  );
}

interface AllocateModalProps {
  item: BaseItem;
  contratos: Contract[];
  onClose: () => void;
}

/** Modal de alocação de item da BASE a contratos. */
function AllocateModal({ item, contratos, onClose }: AllocateModalProps) {
  const toast = useToast();
  const allocate = useAllocateBase();

  const alocado = sumAllocations(item);
  const disponivel = item.value - alocado;
  const ativos = contratos.filter((contract) => contract.status === 'ativo');

  const [contractId, setContractId] = useState('');
  const [value, setValue] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const valor = Number.parseFloat(value) || 0;
    if (!contractId) {
      toast.show('Selecione um contrato', 'danger');
      return;
    }
    if (valor <= 0) {
      toast.show('Informe um valor válido', 'danger');
      return;
    }
    if (valor > disponivel) {
      toast.show('Valor excede o disponível', 'danger');
      return;
    }
    allocate.mutate(
      { id: item.id, contractId, value: valor },
      {
        onSuccess: () => {
          toast.show('Alocação criada', 'success');
          onClose();
        },
        onError: (error) => toast.show(error.message, 'danger'),
      },
    );
  }

  return (
    <Modal
      open
      title={`Alocar "${item.description}"`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          {disponivel > 0 && (
            <Button
              type="submit"
              form="form-alocar"
              variant="success"
              disabled={allocate.isPending}
            >
              {allocate.isPending ? 'Alocando...' : '+ Adicionar Alocação'}
            </Button>
          )}
        </>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--sp-sm)',
          marginBottom: 'var(--sp-lg)',
          padding: 'var(--sp-md)',
          background: 'var(--color-bg)',
          borderRadius: 8,
        }}
      >
        <Kpi label="Valor Total" value={formatBRL(item.value)} />
        <Kpi label="Alocado" value={formatBRL(alocado)} color="var(--color-info)" />
        <Kpi
          label="Disponível"
          value={formatBRL(disponivel)}
          color="var(--color-success)"
        />
      </div>

      {item.allocations.length > 0 && (
        <div style={{ marginBottom: 'var(--sp-lg)' }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Alocações existentes
          </div>
          {item.allocations.map((alloc, index) => (
            <div
              key={`${alloc.contractId}-${index}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: 'rgba(49,130,206,.06)',
                borderLeft: '3px solid var(--color-info)',
                borderRadius: 4,
                marginBottom: 4,
                fontSize: 14,
              }}
            >
              <strong>{contractLabel(contratos, alloc.contractId)}</strong>
              <span style={{ fontWeight: 700, color: 'var(--color-info)' }}>
                {formatBRL(alloc.value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {disponivel > 0 && (
        <form id="form-alocar" onSubmit={handleSubmit}>
          <div className="form-row">
            <FormField label="Contrato *" htmlFor="aloc-contrato">
              <Select
                id="aloc-contrato"
                value={contractId}
                onChange={(event) => setContractId(event.target.value)}
                required
              >
                <option value="">Selecionar...</option>
                {ativos.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {String(contract.name ?? 'Contrato')}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Valor a Alocar *"
              htmlFor="aloc-valor"
              helper={`Máximo: ${formatBRL(disponivel)}`}
            >
              <Input
                id="aloc-valor"
                type="number"
                step="0.01"
                min="0"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                required
              />
            </FormField>
          </div>
        </form>
      )}
    </Modal>
  );
}
