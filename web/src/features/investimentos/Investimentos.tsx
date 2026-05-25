import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import { Badge } from '../../components/ui/badge';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Select, Textarea } from '../../components/ui/controls';
import { DatePicker } from '../../components/ui/date-picker';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import type {
  AporteDestino,
  AporteOrigem,
  Investimento,
  Socio,
  TipoBase,
} from '../../types/domain';
import type { Contract } from '../contracts/types';
import { useContracts } from '../contracts/queries';
import {
  useBase,
  useCaixa,
  useCreateInvestimento,
  useInvestimentos,
  useRemoveInvestimento,
  useSocios,
  useTiposBase,
} from '../resources';

type AporteInput = Partial<Omit<Investimento, 'id'>>;

const TIPO_FALLBACK: TipoBase = {
  id: 'outros',
  key: 'outros',
  label: 'Outros',
  icon: '🔹',
  cor: '#718096',
};

const FILTROS: { value: 'todos' | AporteOrigem; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'socio', label: '👥 Sócios' },
  { value: 'caixa_empresa', label: '💰 Caixa Empresa' },
];

const num = (v: unknown): number => Number(v) || 0;

function origemOf(ap: Investimento): AporteOrigem {
  return ap.origem ?? 'socio';
}

function destinoOf(ap: Investimento): AporteDestino {
  return ap.destino ?? (ap.contractId ? 'contrato' : 'base');
}

function formatDate(d?: string): string {
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '—';
}

function contractName(contract: Contract | undefined): string {
  return contract ? String(contract.name ?? 'Contrato') : '';
}

/** Tela de Aportes dos Sócios — migração de js/views/Investimentos.js. */
export default function Investimentos() {
  const toast = useToast();
  const investimentosQuery = useInvestimentos();
  const sociosQuery = useSocios();
  const contractsQuery = useContracts();
  const tiposQuery = useTiposBase();
  const removeInvestimento = useRemoveInvestimento();

  const [filtroOrigem, setFiltroOrigem] = useState<'todos' | AporteOrigem>(
    'todos',
  );
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);

  const aportes = investimentosQuery.data ?? [];
  const socios = sociosQuery.data ?? [];
  const contratos = contractsQuery.data ?? [];
  const tipos = tiposQuery.data ?? [];

  const tiposByKey: Record<string, TipoBase> = Object.fromEntries(
    tipos.map((tipo) => [tipo.key, tipo]),
  );
  const tipoOf = (key?: string): TipoBase =>
    (key && tiposByKey[key]) || TIPO_FALLBACK;
  const contratoById = (id?: string | null): Contract | undefined =>
    id ? contratos.find((c) => c.id === id) : undefined;
  const socioById = (id?: string | null): Socio | undefined =>
    id ? socios.find((s) => s.id === id) : undefined;

  const aportesDosSocios = aportes.filter((a) => origemOf(a) === 'socio');
  const aportesDoCaixa = aportes.filter((a) => origemOf(a) === 'caixa_empresa');
  const totalSocios = aportesDosSocios.reduce((s, a) => s + num(a.value), 0);
  const totalCaixa = aportesDoCaixa.reduce((s, a) => s + num(a.value), 0);
  const totalGeral = totalSocios + totalCaixa;

  const aportesFiltrados = (
    filtroOrigem === 'todos'
      ? aportes
      : aportes.filter((a) => origemOf(a) === filtroOrigem)
  )
    .slice()
    .sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  const totalFiltrado = aportesFiltrados.reduce((s, a) => s + num(a.value), 0);

  function handleDelete(ap: Investimento) {
    const msg =
      origemOf(ap) === 'caixa_empresa'
        ? 'Excluir este aporte? A saída no caixa também será removida.'
        : 'Excluir este aporte?';
    if (!window.confirm(msg)) return;
    removeInvestimento.mutate(ap.id, {
      onSuccess: () => toast.show('Aporte removido', 'success'),
      onError: (error) => toast.show(error.message, 'danger'),
    });
  }

  const detalhe = detalheId
    ? aportes.find((a) => a.id === detalheId) ?? null
    : null;

  return (
    <>
      <PageHeader
        title="Aportes dos Sócios"
        subtitle="Aportes de capital por sócio ou via caixa da empresa"
        actions={
          <Button size="lg" onClick={() => setNovoAberto(true)}>
            + Novo Aporte
          </Button>
        }
      />

      {investimentosQuery.isLoading ? (
        <Spinner label="Carregando aportes..." />
      ) : investimentosQuery.isError ? (
        <Card style={{ padding: 24 }}>
          <p className="text-danger">
            Erro ao carregar investimentos. Tente novamente.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid-3 mb-2xl">
            <KpiCard
              valor={formatBRL(totalGeral)}
              label="Capital Total Aportado"
              borda="var(--color-primary)"
            />
            <KpiCard
              valor={formatBRL(totalSocios)}
              label="👥 Aportes dos Sócios"
              borda="var(--color-info)"
              cor="var(--color-info)"
            />
            <KpiCard
              valor={formatBRL(totalCaixa)}
              label="💰 Via Caixa da Empresa"
              borda="var(--color-warning)"
              cor="var(--color-warning)"
            />
          </div>

          {socios.length > 0 && aportesDosSocios.length > 0 && (
            <ResumoPorSocio
              socios={socios}
              aportesDosSocios={aportesDosSocios}
              totalSocios={totalSocios}
            />
          )}

          <div
            style={{
              display: 'flex',
              gap: 'var(--sp-sm)',
              marginBottom: 'var(--sp-lg)',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                marginRight: 4,
              }}
            >
              Filtrar:
            </span>
            {FILTROS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filtroOrigem === f.value ? 'primary' : 'secondary'}
                onClick={() => setFiltroOrigem(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <Card>
            <div className="flex justify-between items-center mb-4 px-5 pt-5">
              <h3 className="text-[15px] font-semibold tracking-tight">Histórico de Aportes</h3>
              <span
                style={{ fontSize: 13, color: 'var(--color-text-muted)' }}
              >
                {aportesFiltrados.length} aporte
                {aportesFiltrados.length !== 1 ? 's' : ''}
              </span>
            </div>
            {aportesFiltrados.length === 0 ? (
              <p className="text-muted" style={{ padding: 'var(--sp-lg)' }}>
                Nenhum aporte registrado
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Origem</th>
                      <th>Sócio / Descrição</th>
                      <th>Tipo de Custo</th>
                      <th>Destino</th>
                      <th style={{ textAlign: 'right' }}>Valor</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aportesFiltrados.map((ap) => {
                      const socio = socioById(ap.socioId);
                      const contrato = contratoById(ap.contractId);
                      return (
                        <tr
                          key={ap.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setDetalheId(ap.id)}
                        >
                          <td>{formatDate(ap.date)}</td>
                          <td>
                            <OrigemBadge origem={origemOf(ap)} />
                          </td>
                          <td>
                            {socio ? (
                              <>
                                <strong>{socio.name}</strong>
                                {ap.description && (
                                  <div
                                    style={{
                                      fontSize: 13,
                                      color: 'var(--color-text-muted)',
                                    }}
                                  >
                                    {ap.description}
                                  </div>
                                )}
                              </>
                            ) : (
                              <strong>
                                {ap.description || 'Aporte via caixa'}
                              </strong>
                            )}
                          </td>
                          <td>
                            <TipoBadge tipo={tipoOf(ap.baseType)} />
                          </td>
                          <td>
                            <DestinoBadge
                              destino={destinoOf(ap)}
                              contrato={contrato}
                              contractId={ap.contractId}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            {formatBRL(num(ap.value))}
                          </td>
                          <td>
                            <a
                              className="action-link danger"
                              style={{ cursor: 'pointer' }}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDelete(ap);
                              }}
                            >
                              Excluir
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr
                      style={{
                        background: 'var(--color-bg)',
                        fontWeight: 700,
                      }}
                    >
                      <td colSpan={5} style={{ padding: 'var(--sp-md)' }}>
                        Total filtrado
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: 'var(--sp-md)',
                        }}
                      >
                        {formatBRL(totalFiltrado)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {novoAberto && (
        <NovoAporteModal
          socios={socios}
          contratos={contratos}
          tipos={tipos}
          onClose={() => setNovoAberto(false)}
        />
      )}

      {detalhe && (
        <DetalheModal
          aporte={detalhe}
          socios={socios}
          contratos={contratos}
          onClose={() => setDetalheId(null)}
          onDelete={() => {
            setDetalheId(null);
            handleDelete(detalhe);
          }}
        />
      )}
    </>
  );
}

function KpiCard({
  valor,
  label,
  borda,
  cor,
}: {
  valor: string;
  label: string;
  borda: string;
  cor?: string;
}) {
  return (
    <Card className="stat-card" style={{ borderLeft: `4px solid ${borda}` }}>
      <div className="stat-value" style={{ color: cor }}>
        {valor}
      </div>
      <div className="stat-label">{label}</div>
    </Card>
  );
}

function OrigemBadge({ origem }: { origem: AporteOrigem }) {
  return origem === 'caixa_empresa' ? (
    <Badge style={{ background: 'rgba(214,158,46,.15)', color: '#D69E2E' }}>
      💰 Caixa
    </Badge>
  ) : (
    <Badge style={{ background: 'rgba(49,130,206,.15)', color: '#3182CE' }}>
      👥 Sócio
    </Badge>
  );
}

function TipoBadge({ tipo }: { tipo: TipoBase }) {
  const cor = tipo.cor ?? '#718096';
  return (
    <Badge style={{ background: `${cor}22`, color: cor }}>
      {tipo.icon} {tipo.label}
    </Badge>
  );
}

function DestinoBadge({
  destino,
  contrato,
  contractId,
}: {
  destino: AporteDestino;
  contrato: Contract | undefined;
  contractId?: string | null;
}) {
  if (destino === 'base') {
    return (
      <Badge style={{ background: 'rgba(49,130,206,.15)', color: '#3182CE' }}>
        ⚙️ BASE
      </Badge>
    );
  }
  if (contrato) {
    return (
      <Link
        to={`/contratos/${contrato.id}`}
        style={{ textDecoration: 'none' }}
        onClick={(event) => event.stopPropagation()}
      >
        <Badge
          style={{
            background: 'rgba(46,125,82,.15)',
            color: '#2E7D52',
            cursor: 'pointer',
          }}
        >
          📋 {contractName(contrato)}
        </Badge>
      </Link>
    );
  }
  return (
    <Badge style={{ background: 'rgba(113,128,150,.15)', color: '#718096' }}>
      📋 {contractId ? 'Contrato removido' : 'Contrato'}
    </Badge>
  );
}

interface ResumoPorSocioProps {
  socios: Socio[];
  aportesDosSocios: Investimento[];
  totalSocios: number;
}

/** Tabela "Aportes por Sócio" — compara aporte realizado x esperado. */
function ResumoPorSocio({
  socios,
  aportesDosSocios,
  totalSocios,
}: ResumoPorSocioProps) {
  return (
    <Card style={{ marginBottom: 48 }}>
      <div className="flex justify-between items-center mb-4 px-5 pt-5">
        <h3 className="text-[15px] font-semibold tracking-tight">Aportes por Sócio</h3>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Comparando com participação societária
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sócio</th>
              <th>Participação</th>
              <th style={{ textAlign: 'right' }}>Aporte Realizado</th>
              <th style={{ textAlign: 'right' }}>Contribuição Esperada</th>
              <th style={{ textAlign: 'right' }}>Diferença</th>
            </tr>
          </thead>
          <tbody>
            {socios.map((socio) => {
              const aportado = aportesDosSocios
                .filter((a) => a.socioId === socio.id)
                .reduce((s, a) => s + num(a.value), 0);
              const esperado =
                totalSocios > 0
                  ? (totalSocios * num(socio.participacao)) / 100
                  : 0;
              const diff = aportado - esperado;
              return (
                <tr key={socio.id}>
                  <td>
                    <strong>{socio.name}</strong>
                  </td>
                  <td>{num(socio.participacao).toFixed(2)}%</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatBRL(aportado)}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {formatBRL(esperado)}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      color:
                        diff >= 0
                          ? 'var(--color-success)'
                          : 'var(--color-danger)',
                    }}
                  >
                    {diff >= 0 ? '+' : ''}
                    {formatBRL(diff)}
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: 'var(--color-bg)', fontWeight: 700 }}>
              <td>TOTAL</td>
              <td>100,00%</td>
              <td style={{ textAlign: 'right' }}>{formatBRL(totalSocios)}</td>
              <td style={{ textAlign: 'right' }}>{formatBRL(totalSocios)}</td>
              <td style={{ textAlign: 'right' }}>—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface NovoAporteModalProps {
  socios: Socio[];
  contratos: Contract[];
  tipos: TipoBase[];
  onClose: () => void;
}

/** Modal de registro de um novo aporte. */
function NovoAporteModal({
  socios,
  contratos,
  tipos,
  onClose,
}: NovoAporteModalProps) {
  const toast = useToast();
  const createInvestimento = useCreateInvestimento();

  const [origem, setOrigem] = useState<AporteOrigem>('socio');
  const [destino, setDestino] = useState<AporteDestino>('contrato');
  const [socioId, setSocioId] = useState('');
  const [contractId, setContractId] = useState('');
  const [baseType, setBaseType] = useState(
    tipos.some((t) => t.key === 'outros') ? 'outros' : tipos[0]?.key ?? '',
  );
  const [value, setValue] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');

  const saving = createInvestimento.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const valor = Number.parseFloat(value) || 0;
    if (valor <= 0) {
      toast.show('Informe um valor válido', 'danger');
      return;
    }
    if (origem === 'socio' && !socioId) {
      toast.show('Selecione o sócio', 'danger');
      return;
    }
    if (destino === 'contrato' && !contractId) {
      toast.show('Selecione o contrato de destino', 'danger');
      return;
    }

    const input: AporteInput = {
      origem,
      destino,
      baseType,
      value: valor,
      date,
      description: description.trim() || undefined,
      socioId: origem === 'socio' ? socioId : null,
      contractId: destino === 'contrato' ? contractId : null,
    };

    createInvestimento.mutate(input, {
      onSuccess: () => {
        const msgs: string[] = [];
        if (origem === 'caixa_empresa') msgs.push('saída lançada no caixa');
        if (destino === 'base') msgs.push('item criado na BASE');
        const extra = msgs.length > 0 ? ` (${msgs.join(' e ')})` : '';
        toast.show(`Aporte registrado${extra}`, 'success');
        onClose();
      },
      onError: (error) => toast.show(error.message, 'danger'),
    });
  }

  return (
    <Modal
      open
      title="Novo Aporte"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-aporte" disabled={saving}>
            {saving ? 'Salvando...' : 'Registrar Aporte'}
          </Button>
        </>
      }
    >
      <form id="form-aporte" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">1. Origem do Aporte *</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--sp-md)',
            }}
          >
            <RadioCard
              name="origem"
              checked={origem === 'socio'}
              onChange={() => setOrigem('socio')}
              titulo="👥 Sócio"
              descricao="Aporte de um sócio"
              activeBorder="var(--color-info)"
              activeBg="rgba(49,130,206,.05)"
            />
            <RadioCard
              name="origem"
              checked={origem === 'caixa_empresa'}
              onChange={() => setOrigem('caixa_empresa')}
              titulo="💰 Caixa da Empresa"
              descricao="Aquisição via caixa (gera saída)"
              activeBorder="var(--color-warning)"
              activeBg="rgba(214,158,46,.05)"
            />
          </div>
        </div>

        {origem === 'socio' && (
          <FormField label="Sócio *" htmlFor="aporte-socio">
            <Select
              id="aporte-socio"
              value={socioId}
              onChange={(event) => setSocioId(event.target.value)}
            >
              <option value="">Selecionar...</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <div
          className="form-group"
          style={{
            marginTop: 'var(--sp-lg)',
            paddingTop: 'var(--sp-lg)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <label className="form-label">2. Destino do Aporte *</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--sp-md)',
            }}
          >
            <RadioCard
              name="destino"
              checked={destino === 'contrato'}
              onChange={() => setDestino('contrato')}
              titulo="📋 Contrato"
              descricao="Aporte para um contrato específico"
              activeBorder="var(--color-primary)"
              activeBg="rgba(46,125,82,.05)"
            />
            <RadioCard
              name="destino"
              checked={destino === 'base'}
              onChange={() => setDestino('base')}
              titulo="⚙️ BASE"
              descricao="Custo administrativo geral"
              activeBorder="var(--color-info)"
              activeBg="rgba(49,130,206,.05)"
            />
          </div>
        </div>

        {destino === 'contrato' && (
          <FormField label="Contrato *" htmlFor="aporte-contrato">
            <Select
              id="aporte-contrato"
              value={contractId}
              onChange={(event) => setContractId(event.target.value)}
            >
              <option value="">Selecionar contrato...</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.name ?? 'Contrato')} —{' '}
                  {String(c.client ?? '')}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <FormField
          label="Tipo de Custo *"
          htmlFor="aporte-tipo"
          helper="Classifica a natureza do custo (ex.: Material, Veículo, Software)."
        >
          <Select
            id="aporte-tipo"
            value={baseType}
            onChange={(event) => setBaseType(event.target.value)}
          >
            {tipos.map((t) => (
              <option key={t.key} value={t.key}>
                {t.icon} {t.label}
              </option>
            ))}
          </Select>
        </FormField>

        <div
          style={{
            marginTop: 'var(--sp-lg)',
            paddingTop: 'var(--sp-lg)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div className="form-row">
            <FormField label="Valor (BRL) *" htmlFor="aporte-value">
              <Input
                id="aporte-value"
                type="number"
                step="0.01"
                min="0"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                required
              />
            </FormField>
            <FormField label="Data *" htmlFor="aporte-date">
              <DatePicker
                id="aporte-date"
                value={date}
                onChange={(val) => setDate(val)}
              />
            </FormField>
          </div>
          <FormField label="Descrição" htmlFor="aporte-desc">
            <Textarea
              id="aporte-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ex.: Compra de notebook, maquinário, capital de giro..."
            />
          </FormField>
        </div>

        {origem === 'caixa_empresa' && (
          <div
            style={{
              padding: 'var(--sp-md)',
              background: 'rgba(214,158,46,.1)',
              borderLeft: '4px solid var(--color-warning)',
              borderRadius: 6,
              fontSize: 13,
              marginTop: 'var(--sp-md)',
            }}
          >
            ⚠️ Este aporte gerará uma{' '}
            <strong>saída contábil automática</strong> no caixa da empresa.
          </div>
        )}
        {destino === 'base' && (
          <div
            style={{
              padding: 'var(--sp-md)',
              background: 'rgba(49,130,206,.1)',
              borderLeft: '4px solid var(--color-info)',
              borderRadius: 6,
              fontSize: 13,
              marginTop: 'var(--sp-md)',
            }}
          >
            ℹ️ Um item será criado na <strong>BASE</strong> para este aporte,
            pronto para ser alocado em contratos.
          </div>
        )}
      </form>
    </Modal>
  );
}

interface RadioCardProps {
  name: string;
  checked: boolean;
  onChange: () => void;
  titulo: string;
  descricao: string;
  activeBorder: string;
  activeBg: string;
}

/** Cartão de seleção tipo radio — usado para origem e destino do aporte. */
function RadioCard({
  name,
  checked,
  onChange,
  titulo,
  descricao,
  activeBorder,
  activeBg,
}: RadioCardProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-sm)',
        padding: 'var(--sp-md)',
        border: `2px solid ${checked ? activeBorder : 'var(--color-border)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        background: checked ? activeBg : undefined,
      }}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        style={{ margin: 0 }}
      />
      <div>
        <div style={{ fontWeight: 600 }}>{titulo}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {descricao}
        </div>
      </div>
    </label>
  );
}

interface DetalheModalProps {
  aporte: Investimento;
  socios: Socio[];
  contratos: Contract[];
  onClose: () => void;
  onDelete: () => void;
}

/** Modal de detalhe de um aporte. */
function DetalheModal({
  aporte,
  socios,
  contratos,
  onClose,
  onDelete,
}: DetalheModalProps) {
  const baseQuery = useBase();
  const caixaQuery = useCaixa();

  const socio = aporte.socioId
    ? socios.find((s) => s.id === aporte.socioId)
    : undefined;
  const contrato = aporte.contractId
    ? contratos.find((c) => c.id === aporte.contractId)
    : undefined;
  const baseItem = aporte.baseItemId
    ? (baseQuery.data ?? []).find((b) => b.id === aporte.baseItemId)
    : undefined;
  const caixaEntry = aporte.caixaEntryId
    ? (caixaQuery.data ?? []).find((e) => e.id === aporte.caixaEntryId)
    : undefined;

  const origemLabel =
    aporte.origem === 'socio'
      ? '👤 Sócio'
      : aporte.origem === 'caixa_empresa'
        ? '💼 Caixa da empresa'
        : aporte.origem || '—';
  const destinoLabel =
    aporte.destino === 'base'
      ? '⚙️ BASE'
      : aporte.destino === 'contrato'
        ? '📋 Contrato'
        : aporte.destino || '—';

  return (
    <Modal
      open
      title={aporte.description || 'Aporte'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="danger" onClick={onDelete}>
            Excluir
          </Button>
        </>
      }
    >
      <div style={{ marginBottom: 'var(--sp-md)' }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--color-info)',
          }}
        >
          {formatBRL(num(aporte.value))}
        </span>
      </div>

      <DetalheRow label="Data" value={formatDate(aporte.date)} />
      <DetalheRow label="Origem" value={origemLabel} />
      {socio && (
        <DetalheRow
          label="Sócio"
          value={
            <>
              <strong>{socio.name}</strong>
              {socio.participacao != null && (
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {' '}
                  ({socio.participacao}%)
                </span>
              )}
            </>
          }
        />
      )}
      <DetalheRow label="Destino" value={destinoLabel} />
      {contrato && (
        <DetalheRow
          label="Contrato"
          value={
            <Link
              to={`/contratos/${contrato.id}`}
              style={{ color: 'var(--color-primary)' }}
            >
              {contractName(contrato)}
            </Link>
          }
        />
      )}
      {baseItem && (
        <DetalheRow
          label="Item BASE"
          value={
            <>
              {baseItem.description}{' '}
              <span
                style={{ color: 'var(--color-text-muted)', fontSize: 13 }}
              >
                ({baseItem.type})
              </span>
            </>
          }
        />
      )}
      {aporte.baseType && !baseItem && (
        <DetalheRow label="Tipo BASE" value={aporte.baseType} />
      )}
      {caixaEntry && (
        <DetalheRow
          label="Entrada no caixa"
          value={`${String(caixaEntry.description ?? '')} em ${formatDate(
            typeof caixaEntry.date === 'string' ? caixaEntry.date : undefined,
          )}`}
        />
      )}

      <div
        style={{
          fontSize: 12,
          color: 'var(--color-text-muted)',
          marginTop: 'var(--sp-md)',
          fontFamily: 'monospace',
        }}
      >
        ID: {aporte.id}
      </div>
    </Modal>
  );
}

function DetalheRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
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
