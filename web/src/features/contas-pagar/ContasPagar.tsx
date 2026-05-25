import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import { Badge } from '../../components/ui/badge';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Select, Textarea } from '../../components/ui/controls';
import { DatePicker } from '../../components/ui/date-picker';
import { Combobox } from '../../components/ui/combobox';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import type { ContaPagar, Fornecedor } from '../../types/domain';
import type { Contract } from '../contracts/types';
import { useContracts } from '../contracts/queries';
import { useContasPagar, useFornecedores } from '../resources';
import {
  useClassifyExpense,
  useCreateContaPagar,
  useDeleteContaPagar,
  useEstornarConta,
  usePagarConta,
  useProcessarRecorrencias,
  useUpdateContaPagar,
  type ContaPagarInput,
} from './queries';

const num = (v: unknown): number => Number(v) || 0;
const MS_DIA = 86_400_000;

const CATEGORIAS: { value: string; label: string }[] = [
  { value: 'fornecedor', label: 'Fornecedor' },
  { value: 'mao_de_obra', label: 'Mão de Obra' },
  { value: 'material', label: 'Material' },
  { value: 'hospedagem', label: 'Hospedagem' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'servico', label: 'Serviço' },
  { value: 'outros', label: 'Outros' },
];

const PERIODICIDADES: { value: string; label: string }[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
];

const FORMAS_PAGAMENTO: { forma: string; icone: string }[] = [
  { forma: 'PIX', icone: '⚡' },
  { forma: 'Boleto', icone: '📄' },
  { forma: 'Cartão', icone: '💳' },
  { forma: 'Transferência', icone: '🏦' },
  { forma: 'Dinheiro', icone: '💵' },
  { forma: 'Cheque', icone: '📝' },
];

type FiltroStatus = 'pendente' | 'pago' | 'todos';

const FILTROS: { value: FiltroStatus; label: string }[] = [
  { value: 'pendente', label: '⏳ Pendentes' },
  { value: 'pago', label: '✅ Pagas' },
  { value: 'todos', label: '📋 Todas' },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function formatDate(d?: string): string {
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '—';
}

/** Dias entre hoje e a data (negativo = vencida). */
function diasAte(dataVencimento?: string): number | null {
  if (!dataVencimento) return null;
  return Math.floor(
    (new Date(dataVencimento).getTime() - Date.now()) / MS_DIA,
  );
}

/** Tela de Contas a Pagar — migração de js/views/ContasPagar.js. */
export default function ContasPagar() {
  const toast = useToast();
  const contasQuery = useContasPagar();
  const fornecedoresQuery = useFornecedores();
  const contractsQuery = useContracts();
  const deleteConta = useDeleteContaPagar();
  const estornarConta = useEstornarConta();
  const processarRecorrencias = useProcessarRecorrencias();

  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('pendente');
  const [contaModal, setContaModal] = useState<{ conta: ContaPagar | null } | null>(
    null,
  );
  const [pagarId, setPagarId] = useState<string | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  // F7: dispara o processamento de recorrências ao montar (idempotente).
  const { mutate: dispararRecorrencias } = processarRecorrencias;
  useEffect(() => {
    dispararRecorrencias();
  }, [dispararRecorrencias]);

  const contas = contasQuery.data ?? [];
  const fornecedores = fornecedoresQuery.data ?? [];
  const contratos = contractsQuery.data ?? [];

  const hoje = todayStr();
  const em7 = dateStr(7);

  const pendentes = contas.filter((c) => c.status === 'pendente');
  const pagas = contas.filter((c) => c.status === 'pago');
  const vencidas = pendentes.filter(
    (c) => c.dataVencimento && c.dataVencimento < hoje,
  );
  const proximasVencer = pendentes.filter(
    (c) =>
      c.dataVencimento && c.dataVencimento >= hoje && c.dataVencimento <= em7,
  );
  const noPrazo = pendentes.filter(
    (c) => c.dataVencimento && c.dataVencimento > em7,
  );
  const totalPendente = pendentes.reduce((s, c) => s + num(c.valor), 0);

  const total = contas.length;
  const pctOk =
    total > 0
      ? Math.round(((pagas.length + noPrazo.length) / total) * 100)
      : 100;
  const statusGeral =
    vencidas.length > 0
      ? { cor: '#E53E3E', bg: 'rgba(229,62,62,.07)', texto: 'Atenção urgente', icone: '🔴' }
      : proximasVencer.length > 0
        ? { cor: '#D69E2E', bg: 'rgba(214,158,46,.07)', texto: 'Requer atenção', icone: '⚠️' }
        : { cor: '#38A169', bg: 'rgba(56,161,105,.07)', texto: 'Tudo em dia', icone: '✅' };

  const proximasTimeline = pendentes
    .filter((c) => {
      const dias = diasAte(c.dataVencimento);
      return dias !== null && dias >= -30 && dias <= 30;
    })
    .slice()
    .sort((a, b) =>
      (a.dataVencimento ?? '').localeCompare(b.dataVencimento ?? ''),
    )
    .slice(0, 5);

  const filtradas = (
    filtroStatus === 'pendente'
      ? pendentes
      : filtroStatus === 'pago'
        ? pagas
        : contas
  )
    .slice()
    .sort((a, b) => {
      if (a.status === 'pendente' && b.status !== 'pendente') return -1;
      if (a.status !== 'pendente' && b.status === 'pendente') return 1;
      return (a.dataVencimento ?? '') < (b.dataVencimento ?? '') ? -1 : 1;
    });

  const fornecedorById = (id?: string): Fornecedor | undefined =>
    id ? fornecedores.find((f) => f.id === id) : undefined;

  function handleEstornar(id: string) {
    if (
      !window.confirm(
        'Estornar este pagamento? A saída no caixa será removida.',
      )
    ) {
      return;
    }
    estornarConta.mutate(id, {
      onSuccess: () => toast.show('Pagamento estornado', 'success'),
      onError: (error) => toast.show(error.message, 'danger'),
    });
  }

  function handleExcluir(id: string) {
    if (
      !window.confirm(
        'Excluir esta conta? Se estiver paga, a saída no caixa também será removida.',
      )
    ) {
      return;
    }
    deleteConta.mutate(id, {
      onSuccess: () => toast.show('Conta removida', 'success'),
      onError: (error) => toast.show(error.message, 'danger'),
    });
  }

  const contaDoModal = pagarId
    ? contas.find((c) => c.id === pagarId) ?? null
    : null;
  const contaDetalhe = detalheId
    ? contas.find((c) => c.id === detalheId) ?? null
    : null;

  return (
    <>
      <PageHeader
        title="Contas a Pagar"
        subtitle={`${pendentes.length} pendente${
          pendentes.length !== 1 ? 's' : ''
        } · Total ${formatBRL(totalPendente)}`}
        actions={
          <Button size="lg" onClick={() => setContaModal({ conta: null })}>
            + Nova Conta
          </Button>
        }
      />

      {contasQuery.isLoading ? (
        <Spinner label="Carregando contas..." />
      ) : contasQuery.isError ? (
        <Card style={{ padding: 24 }}>
          <p className="text-danger">
            Erro ao carregar contas a pagar. Tente novamente.
          </p>
        </Card>
      ) : (
        <>
          <div
            style={{
              background: statusGeral.bg,
              border: `1px solid ${statusGeral.cor}30`,
              borderRadius: 8,
              padding: 'var(--sp-sm) var(--sp-md)',
              marginBottom: 'var(--sp-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-lg)',
              flexWrap: 'wrap',
            }}
          >
            <PanelMetric icone="🔴" valor={vencidas.length} cor="#E53E3E" rotulo="Vencidas" />
            <PanelDivisor cor={statusGeral.cor} />
            <PanelMetric
              icone="⚠️"
              valor={proximasVencer.length}
              cor="#D69E2E"
              rotulo="Próx. 7d"
            />
            <PanelDivisor cor={statusGeral.cor} />
            <PanelMetric icone="✅" valor={noPrazo.length} cor="#38A169" rotulo="No prazo" />
            <PanelDivisor cor={statusGeral.cor} />
            <PanelMetric icone="💸" valor={pagas.length} cor="#3182CE" rotulo="Pagas" />
            <PanelDivisor cor={statusGeral.cor} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              <span>💰</span>
              <span style={{ fontWeight: 800, color: 'var(--color-danger)' }}>
                {formatBRL(totalPendente)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                A pagar
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
              <span style={{ fontWeight: 700, color: statusGeral.cor }}>
                {statusGeral.icone} {statusGeral.texto}
              </span>
              <div
                style={{
                  width: 80,
                  height: 6,
                  background: 'rgba(0,0,0,.08)',
                  borderRadius: 99,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pctOk}%`,
                    background: statusGeral.cor,
                    borderRadius: 99,
                  }}
                />
              </div>
              <span style={{ fontWeight: 800, color: statusGeral.cor }}>
                {pctOk}%
              </span>
            </div>
          </div>

          {proximasTimeline.length > 0 && (
            <Card style={{ marginBottom: 'var(--sp-xl)', padding: 'var(--sp-lg)' }}>
              <h3
                className="text-[15px] font-semibold tracking-tight mb-4"
              >
                Próximos Vencimentos
              </h3>
              <div>
                {proximasTimeline.map((c, idx) => (
                  <TimelineItem
                    key={c.id}
                    conta={c}
                    fornecedor={fornecedorById(c.fornecedorId)}
                    ultimo={idx === proximasTimeline.length - 1}
                  />
                ))}
              </div>
            </Card>
          )}

          <Card
            style={{
              padding: 'var(--sp-md)',
              marginBottom: 'var(--sp-lg)',
              display: 'flex',
              gap: 'var(--sp-sm)',
            }}
          >
            {FILTROS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filtroStatus === f.value ? 'primary' : 'secondary'}
                onClick={() => setFiltroStatus(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </Card>

          <Card>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Descrição / NF</th>
                    <th>Fornecedor</th>
                    <th>Emissão</th>
                    <th>Vencimento</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center text-muted"
                        style={{ padding: 'var(--sp-xl)' }}
                      >
                        Nenhuma conta{' '}
                        {filtroStatus === 'pendente'
                          ? 'pendente'
                          : filtroStatus === 'pago'
                            ? 'paga'
                            : ''}{' '}
                        cadastrada
                      </td>
                    </tr>
                  ) : (
                    filtradas.map((c) => (
                      <ContaRow
                        key={c.id}
                        conta={c}
                        fornecedor={fornecedorById(c.fornecedorId)}
                        hoje={hoje}
                        em7={em7}
                        onDetalhe={() => setDetalheId(c.id)}
                        onPagar={() => setPagarId(c.id)}
                        onEstornar={() => handleEstornar(c.id)}
                        onEditar={() => setContaModal({ conta: c })}
                        onExcluir={() => handleExcluir(c.id)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {contaModal && (
        <ContaModal
          key={contaModal.conta?.id ?? 'new'}
          conta={contaModal.conta}
          fornecedores={fornecedores}
          contratos={contratos}
          onClose={() => setContaModal(null)}
        />
      )}

      {contaDoModal && (
        <PagarModal conta={contaDoModal} onClose={() => setPagarId(null)} />
      )}

      {contaDetalhe && (
        <DetailModal
          conta={contaDetalhe}
          fornecedor={fornecedorById(contaDetalhe.fornecedorId)}
          contrato={contratos.find((c) => c.id === contaDetalhe.contractId)}
          onClose={() => setDetalheId(null)}
          onPagar={() => {
            setDetalheId(null);
            setPagarId(contaDetalhe.id);
          }}
          onEstornar={() => {
            setDetalheId(null);
            handleEstornar(contaDetalhe.id);
          }}
        />
      )}
    </>
  );
}

function PanelMetric({
  icone,
  valor,
  cor,
  rotulo,
}: {
  icone: string;
  valor: number;
  cor: string;
  rotulo: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
      <span>{icone}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: cor, lineHeight: 1 }}>
        {valor}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {rotulo}
      </span>
    </div>
  );
}

function PanelDivisor({ cor }: { cor: string }) {
  return (
    <div style={{ width: 1, height: 20, background: `${cor}25` }} />
  );
}

function TimelineItem({
  conta,
  fornecedor,
  ultimo,
}: {
  conta: ContaPagar;
  fornecedor: Fornecedor | undefined;
  ultimo: boolean;
}) {
  const dias = diasAte(conta.dataVencimento) ?? 0;
  const cor = dias < 0 ? '#E53E3E' : dias <= 7 ? '#D69E2E' : '#38A169';
  const diasTxt =
    dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? 'HOJE' : `em ${dias}d`;
  const data = conta.dataVencimento
    ? new Date(`${conta.dataVencimento}T12:00:00`)
    : null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-lg)',
        padding: 'var(--sp-md) 0',
        borderBottom: ultimo ? undefined : '1px solid var(--color-border)',
      }}
    >
      <div style={{ textAlign: 'center', minWidth: 52 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: cor, lineHeight: 1 }}>
          {data ? data.getDate() : '—'}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
          }}
        >
          {data ? data.toLocaleDateString('pt-BR', { month: 'short' }) : ''}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {conta.descricao}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {fornecedor ? fornecedor.nome : '—'}
          {conta.numeroNF ? ` · NF ${conta.numeroNF}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 700, color: 'var(--color-danger)' }}>
          {formatBRL(num(conta.valor))}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: cor }}>
          {diasTxt}
        </div>
      </div>
    </div>
  );
}

interface ContaRowProps {
  conta: ContaPagar;
  fornecedor: Fornecedor | undefined;
  hoje: string;
  em7: string;
  onDetalhe: () => void;
  onPagar: () => void;
  onEstornar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}

function ContaRow({
  conta,
  fornecedor,
  hoje,
  em7,
  onDetalhe,
  onPagar,
  onEstornar,
  onEditar,
  onExcluir,
}: ContaRowProps) {
  const vencida =
    conta.status === 'pendente' &&
    !!conta.dataVencimento &&
    conta.dataVencimento < hoje;
  const proxima =
    conta.status === 'pendente' &&
    !!conta.dataVencimento &&
    conta.dataVencimento >= hoje &&
    conta.dataVencimento <= em7;
  const vencCor = vencida
    ? 'var(--color-danger)'
    : proxima
      ? 'var(--color-warning)'
      : 'var(--color-text)';

  const dias = diasAte(conta.dataVencimento);
  let diasLabel: ReactNode = null;
  if (dias !== null && conta.status === 'pendente') {
    if (dias < 0) {
      diasLabel = (
        <div style={{ fontSize: 13, color: 'var(--color-danger)', fontWeight: 700 }}>
          {Math.abs(dias)}d vencida
        </div>
      );
    } else if (dias === 0) {
      diasLabel = (
        <div style={{ fontSize: 13, color: 'var(--color-warning)', fontWeight: 700 }}>
          vence hoje
        </div>
      );
    } else {
      diasLabel = (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          em {dias}d
        </div>
      );
    }
  }

  function stop(handler: () => void) {
    return (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      handler();
    };
  }

  return (
    <tr style={{ cursor: 'pointer' }} onClick={onDetalhe}>
      <td>
        <strong>{conta.descricao || '—'}</strong>
        {conta.numeroNF && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            NF {conta.numeroNF}
          </div>
        )}
      </td>
      <td>
        {fornecedor ? (
          fornecedor.nome || '—'
        ) : (
          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
        )}
      </td>
      <td style={{ fontSize: 13 }}>{formatDate(conta.dataEmissao)}</td>
      <td>
        <span
          style={{ color: vencCor, fontWeight: vencida || proxima ? 700 : 400 }}
        >
          {formatDate(conta.dataVencimento)}
        </span>
        {diasLabel}
      </td>
      <td
        style={{
          textAlign: 'right',
          fontWeight: 700,
          color: 'var(--color-danger)',
        }}
      >
        {formatBRL(num(conta.valor))}
      </td>
      <td>
        {conta.status === 'pago' ? (
          <>
            <Badge variant="success">Pago</Badge>
            {conta.dataPagamento && (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--color-text-muted)',
                  marginTop: 2,
                }}
              >
                {formatDate(conta.dataPagamento)}
                {conta.formaPagamento ? ` · ${conta.formaPagamento}` : ''}
              </div>
            )}
          </>
        ) : vencida ? (
          <Badge
            style={{ background: 'rgba(229,62,62,.15)', color: 'var(--color-danger)' }}
          >
            Vencida
          </Badge>
        ) : (
          <Badge
            style={{ background: 'rgba(214,158,46,.12)', color: 'var(--color-warning)' }}
          >
            Pendente
          </Badge>
        )}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 8 }}>
          {conta.status === 'pendente' ? (
            <a
              className="action-link"
              style={{ cursor: 'pointer', color: 'var(--color-success)' }}
              onClick={stop(onPagar)}
            >
              Pagar
            </a>
          ) : (
            <a
              className="action-link"
              style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }}
              onClick={stop(onEstornar)}
            >
              Estornar
            </a>
          )}
          <a
            className="action-link"
            style={{ cursor: 'pointer' }}
            onClick={stop(onEditar)}
          >
            Editar
          </a>
          <a
            className="action-link danger"
            style={{ cursor: 'pointer' }}
            onClick={stop(onExcluir)}
          >
            Excluir
          </a>
        </div>
      </td>
    </tr>
  );
}

interface ContaModalProps {
  conta: ContaPagar | null;
  fornecedores: Fornecedor[];
  contratos: Contract[];
  onClose: () => void;
}

/** Modal de criação/edição de conta a pagar. */
function ContaModal({ conta, fornecedores, contratos, onClose }: ContaModalProps) {
  const toast = useToast();
  const createConta = useCreateContaPagar();
  const updateConta = useUpdateContaPagar();
  const classify = useClassifyExpense();
  const isEdit = conta !== null;

  const [descricao, setDescricao] = useState(conta?.descricao ?? '');
  const [numeroNF, setNumeroNF] = useState(conta?.numeroNF ?? '');
  const [category, setCategory] = useState(conta?.category ?? 'fornecedor');
  const [fornecedorId, setFornecedorId] = useState(conta?.fornecedorId ?? '');
  const [contractId, setContractId] = useState(conta?.contractId ?? '');
  const [valor, setValor] = useState(conta ? String(conta.valor) : '');
  const [dataEmissao, setDataEmissao] = useState(
    conta?.dataEmissao ?? todayStr(),
  );
  const [dataVencimento, setDataVencimento] = useState(
    conta?.dataVencimento ?? '',
  );
  const [observacoes, setObservacoes] = useState(conta?.observacoes ?? '');
  const [recorrente, setRecorrente] = useState(Boolean(conta?.recorrente));
  const [periodicidade, setPeriodicidade] = useState(
    conta?.periodicidade ?? 'mensal',
  );

  const saving = createConta.isPending || updateConta.isPending;

  function handleClassify() {
    if (!descricao.trim()) {
      toast.show('Preencha a descrição primeiro', 'danger');
      return;
    }
    const fornecedorNome =
      fornecedores.find((f) => f.id === fornecedorId)?.nome ?? '';
    classify.mutate(
      {
        descricao: descricao.trim(),
        valor: Number.parseFloat(valor) || 0,
        fornecedor: fornecedorNome,
      },
      {
        onSuccess: (data) => {
          if (data.category) setCategory(data.category);
          if (data.contractId) setContractId(data.contractId);
          const conf = data.confidence
            ? ` (${Math.round(data.confidence * 100)}% confiança)`
            : '';
          toast.show(`IA sugeriu: ${data.category ?? '—'}${conf}`, 'success');
        },
        onError: (error) =>
          toast.show(`IA não disponível: ${error.message}`, 'danger'),
      },
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!descricao.trim()) {
      toast.show('Descrição é obrigatória', 'danger');
      return;
    }
    if (!dataVencimento) {
      toast.show('Data de vencimento é obrigatória', 'danger');
      return;
    }
    const valorNum = Number.parseFloat(valor) || 0;
    if (valorNum <= 0) {
      toast.show('Valor inválido', 'danger');
      return;
    }

    const input: ContaPagarInput = {
      descricao: descricao.trim(),
      numeroNF: numeroNF.trim() || undefined,
      category,
      valor: valorNum,
      dataEmissao: dataEmissao || undefined,
      dataVencimento,
      observacoes: observacoes.trim() || undefined,
      recorrente,
      fornecedorId: fornecedorId || undefined,
      contractId: contractId || undefined,
      periodicidade: recorrente ? periodicidade : undefined,
    };

    const onSuccess = () => {
      toast.show(isEdit ? 'Conta atualizada' : 'Conta criada', 'success');
      onClose();
    };
    const onError = (error: Error) => toast.show(error.message, 'danger');

    if (isEdit && conta) {
      updateConta.mutate({ id: conta.id, input }, { onSuccess, onError });
    } else {
      createConta.mutate(input, { onSuccess, onError });
    }
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editar Conta' : 'Nova Conta a Pagar'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-conta" disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </>
      }
    >
      <form id="form-conta" onSubmit={handleSubmit}>
        <FormField
          label="Descrição *"
          htmlFor="cp-desc"
          helper={
            !isEdit
              ? 'Use a classificação por IA para sugerir categoria e contrato.'
              : undefined
          }
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              id="cp-desc"
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              required
              placeholder="Ex.: Material elétrico, Serviço de transporte..."
              style={{ flex: 1 }}
            />
            {!isEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClassify}
                disabled={classify.isPending}
              >
                {classify.isPending ? '⏳' : '🤖 Classificar'}
              </Button>
            )}
          </div>
        </FormField>

        <div className="form-row">
          <FormField label="Número da NF" htmlFor="cp-nf">
            <Input
              id="cp-nf"
              value={numeroNF}
              onChange={(event) => setNumeroNF(event.target.value)}
              placeholder="Ex.: 001234"
            />
          </FormField>
          <FormField label="Categoria" htmlFor="cp-cat">
            <Select
              id="cp-cat"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="form-row">
          <FormField label="Fornecedor" htmlFor="cp-forn">
            <Combobox
              id="cp-forn"
              options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
              value={fornecedorId}
              onChange={setFornecedorId}
              placeholder="— Selecionar —"
              searchPlaceholder="Pesquisar fornecedor..."
              emptyText="Nenhum fornecedor encontrado."
            />
          </FormField>
          <FormField label="Contrato (opcional)" htmlFor="cp-contr">
            <Combobox
              id="cp-contr"
              options={contratos.map((c) => ({ value: c.id, label: String(c.name ?? 'Contrato') }))}
              value={contractId}
              onChange={setContractId}
              placeholder="— Nenhum —"
              searchPlaceholder="Pesquisar contrato..."
              emptyText="Nenhum contrato encontrado."
            />
          </FormField>
        </div>

        <div className="form-row">
          <FormField label="Valor *" htmlFor="cp-valor">
            <Input
              id="cp-valor"
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(event) => setValor(event.target.value)}
              required
            />
          </FormField>
          <FormField label="Data de Emissão" htmlFor="cp-emissao">
            <DatePicker
              id="cp-emissao"
              value={dataEmissao}
              onChange={(val) => setDataEmissao(val)}
            />
          </FormField>
        </div>

        <FormField label="Data de Vencimento *" htmlFor="cp-venc">
          <DatePicker
            id="cp-venc"
            value={dataVencimento}
            onChange={(val) => setDataVencimento(val)}
          />
        </FormField>

        <FormField label="Observações" htmlFor="cp-obs">
          <Textarea
            id="cp-obs"
            value={observacoes}
            onChange={(event) => setObservacoes(event.target.value)}
          />
        </FormField>

        <div
          className="form-group"
          style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: 'var(--sp-sm)',
            marginTop: 'var(--sp-sm)',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={recorrente}
              onChange={(event) => setRecorrente(event.target.checked)}
            />
            <span style={{ fontWeight: 600 }}>
              🔄 Conta recorrente (lançamento automático)
            </span>
          </label>
        </div>

        {recorrente && (
          <FormField label="Periodicidade" htmlFor="cp-period">
            <Select
              id="cp-period"
              value={periodicidade}
              onChange={(event) => setPeriodicidade(event.target.value)}
            >
              {PERIODICIDADES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </form>
    </Modal>
  );
}

interface PagarModalProps {
  conta: ContaPagar;
  onClose: () => void;
}

/** Modal de registro de pagamento de uma conta. */
function PagarModal({ conta, onClose }: PagarModalProps) {
  const toast = useToast();
  const pagarConta = usePagarConta();

  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [dataPagamento, setDataPagamento] = useState(todayStr);
  const [valorPago, setValorPago] = useState(String(num(conta.valor)));

  function handleConfirmar() {
    if (!dataPagamento) {
      toast.show('Informe a data do pagamento', 'danger');
      return;
    }
    pagarConta.mutate(
      {
        id: conta.id,
        dataPagamento,
        valorPago: Number.parseFloat(valorPago) || 0,
        formaPagamento,
      },
      {
        onSuccess: () => {
          toast.show('Pagamento registrado — saída lançada no Caixa', 'success');
          onClose();
        },
        onError: (error) => toast.show(error.message, 'danger'),
      },
    );
  }

  return (
    <Modal
      open
      title="Registrar Pagamento"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={pagarConta.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="success"
            onClick={handleConfirmar}
            disabled={pagarConta.isPending}
          >
            {pagarConta.isPending ? 'Confirmando...' : '✓ Confirmar Pagamento'}
          </Button>
        </>
      }
    >
      <p style={{ marginBottom: 'var(--sp-md)', color: 'var(--color-text-muted)' }}>
        <strong style={{ color: 'var(--color-text)' }}>{conta.descricao}</strong>
        {conta.numeroNF ? ` — NF ${conta.numeroNF}` : ''}
      </p>

      <div className="form-group">
        <label className="form-label">Forma de Pagamento</label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}
        >
          {FORMAS_PAGAMENTO.map(({ forma, icone }) => {
            const ativo = formaPagamento === forma;
            return (
              <button
                key={forma}
                type="button"
                onClick={() => setFormaPagamento(forma)}
                style={{
                  padding: '8px 4px',
                  border: `1px solid ${
                    ativo ? 'var(--color-primary)' : 'var(--color-border)'
                  }`,
                  borderRadius: 6,
                  background: ativo
                    ? 'var(--color-primary)'
                    : 'var(--color-surface)',
                  color: ativo ? '#fff' : 'var(--color-text-muted)',
                  fontWeight: ativo ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {icone} {forma}
              </button>
            );
          })}
        </div>
      </div>

      <div className="form-row">
        <FormField label="Data do Pagamento" htmlFor="cp-data-pag">
          <DatePicker
            id="cp-data-pag"
            value={dataPagamento}
            onChange={(val) => setDataPagamento(val)}
          />
        </FormField>
        <FormField label="Valor Pago" htmlFor="cp-valor-pago">
          <Input
            id="cp-valor-pago"
            type="number"
            step="0.01"
            min="0"
            value={valorPago}
            onChange={(event) => setValorPago(event.target.value)}
          />
        </FormField>
      </div>

      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        Uma saída de <strong>{formatBRL(num(conta.valor))}</strong> será criada
        automaticamente no Caixa.
      </p>
    </Modal>
  );
}

interface DetailModalProps {
  conta: ContaPagar;
  fornecedor: Fornecedor | undefined;
  contrato: Contract | undefined;
  onClose: () => void;
  onPagar: () => void;
  onEstornar: () => void;
}

/** Modal de detalhe de uma conta a pagar. */
function DetailModal({
  conta,
  fornecedor,
  contrato,
  onClose,
  onPagar,
  onEstornar,
}: DetailModalProps) {
  const dias = diasAte(conta.dataVencimento);
  const vencida = conta.status === 'pendente' && dias !== null && dias < 0;
  const categoriaLabel = CATEGORIAS.find((c) => c.value === conta.category)
    ?.label;

  return (
    <Modal
      open
      title={conta.descricao || '—'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          {conta.status === 'pendente' ? (
            <Button variant="success" onClick={onPagar}>
              Marcar como pago
            </Button>
          ) : (
            <Button variant="secondary" onClick={onEstornar}>
              Estornar
            </Button>
          )}
        </>
      }
    >
      <div style={{ marginBottom: 'var(--sp-md)' }}>
        <Badge
          style={{
            background:
              conta.status === 'pago'
                ? 'rgba(56,161,105,.15)'
                : vencida
                  ? 'rgba(229,62,62,.15)'
                  : 'rgba(214,158,46,.12)',
            color:
              conta.status === 'pago'
                ? 'var(--color-success)'
                : vencida
                  ? 'var(--color-danger)'
                  : 'var(--color-warning)',
          }}
        >
          {conta.status === 'pago' ? 'Pago' : vencida ? 'Vencida' : 'Pendente'}
        </Badge>
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--color-danger)',
            marginLeft: 12,
          }}
        >
          {formatBRL(num(conta.valor))}
        </span>
      </div>

      <DetailRow label="Fornecedor" value={fornecedor?.nome} />
      <DetailRow label="Nº NF" value={conta.numeroNF} />
      <DetailRow label="Data de Emissão" value={formatDate(conta.dataEmissao)} />
      <DetailRow
        label="Vencimento"
        value={
          conta.dataVencimento ? (
            <>
              {formatDate(conta.dataVencimento)}{' '}
              {dias !== null && (
                <span
                  style={{ color: 'var(--color-text-muted)', fontSize: 13 }}
                >
                  (
                  {dias < 0
                    ? `${Math.abs(dias)} dias vencida`
                    : dias === 0
                      ? 'hoje'
                      : `em ${dias} dias`}
                  )
                </span>
              )}
            </>
          ) : null
        }
      />
      <DetailRow label="Categoria" value={categoriaLabel} />
      {contrato && (
        <DetailRow
          label="Contrato"
          value={
            <Link
              to={`/contratos/${contrato.id}`}
              style={{ color: 'var(--color-primary)' }}
            >
              {String(contrato.name ?? 'Contrato')}
            </Link>
          }
        />
      )}
      {conta.status === 'pago' && (
        <>
          <DetailRow
            label="Data do Pagto."
            value={formatDate(conta.dataPagamento)}
          />
          <DetailRow
            label="Valor Pago"
            value={
              conta.valorPago != null ? formatBRL(num(conta.valorPago)) : null
            }
          />
          <DetailRow label="Forma de Pagto." value={conta.formaPagamento} />
        </>
      )}
      <DetailRow label="Observações" value={conta.observacoes} />

      <div
        style={{
          fontSize: 12,
          color: 'var(--color-text-muted)',
          marginTop: 'var(--sp-md)',
          fontFamily: 'monospace',
        }}
      >
        ID: {conta.id}
      </div>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  if (!value) return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '7px 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
