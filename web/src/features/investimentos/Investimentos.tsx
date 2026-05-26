import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import Card from '../../components/ui/card';
import DataTable, { type Column } from '../../components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import FormField from '../../components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/native-select';
import { Combobox } from '../../components/ui/combobox';
import { DatePicker } from '../../components/ui/date-picker';
import Spinner from '../../components/ui/spinner';
import { toast } from 'sonner';
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
  icon: 'ðŸ”¹',
  cor: '#718096',
};

const FILTROS: { value: 'todos' | AporteOrigem; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'socio', label: 'ðŸ‘¥ SÃ³cios' },
  { value: 'caixa_empresa', label: 'ðŸ’° Caixa Empresa' },
];

const num = (v: unknown): number => Number(v) || 0;

function origemOf(ap: Investimento): AporteOrigem {
  return ap.origem ?? 'socio';
}

function destinoOf(ap: Investimento): AporteDestino {
  return ap.destino ?? (ap.contractId ? 'contrato' : 'base');
}

function formatDate(d?: string): string {
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : 'â€”';
}

function contractName(contract: Contract | undefined): string {
  return contract ? String(contract.name ?? 'Contrato') : '';
}

/** Tela de Aportes dos SÃ³cios â€” migraÃ§Ã£o de js/views/Investimentos.js. */
export default function Investimentos() {
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

  const handleDelete = useCallback(
    (ap: Investimento) => {
      const msg =
        origemOf(ap) === 'caixa_empresa'
          ? 'Excluir este aporte? A saÃ­da no caixa tambÃ©m serÃ¡ removida.'
          : 'Excluir este aporte?';
      if (!window.confirm(msg)) return;
      removeInvestimento.mutate(ap.id, {
        onSuccess: () => toast.success('Aporte removido'),
        onError: (error) => toast.error(error.message),
      });
    },
    [removeInvestimento],
  );

  const detalhe = detalheId
    ? aportes.find((a) => a.id === detalheId) ?? null
    : null;

  const columns = useMemo<Column<Investimento>[]>(
    () => [
      {
        header: 'Data',
        sortable: true,
        sortAccessor: (ap) => ap.date,
        cell: (ap) => formatDate(ap.date),
      },
      {
        header: 'Origem',
        cell: (ap) => <OrigemBadge origem={origemOf(ap)} />,
      },
      {
        header: 'SÃ³cio / DescriÃ§Ã£o',
        cell: (ap) => {
          const socio = socioById(ap.socioId);
          return socio ? (
            <>
              <strong>{socio.name}</strong>
              {ap.description && (
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {ap.description}
                </div>
              )}
            </>
          ) : (
            <strong>{ap.description || 'Aporte via caixa'}</strong>
          );
        },
      },
      {
        header: 'Tipo de Custo',
        cell: (ap) => <TipoBadge tipo={tipoOf(ap.baseType)} />,
      },
      {
        header: 'Destino',
        cell: (ap) => (
          <DestinoBadge
            destino={destinoOf(ap)}
            contrato={contratoById(ap.contractId)}
            contractId={ap.contractId}
          />
        ),
      },
      {
        header: 'Valor',
        align: 'right',
        sortable: true,
        sortAccessor: (ap) => num(ap.value),
        cell: (ap) => (
          <span style={{ fontWeight: 700 }}>{formatBRL(num(ap.value))}</span>
        ),
      },
      {
        header: 'AÃ§Ãµes',
        cell: (ap) => (
          <div onClick={(e) => e.stopPropagation()}>
            <a
              className="action-link danger"
              style={{ cursor: 'pointer' }}
              onClick={() => handleDelete(ap)}
            >
              Excluir
            </a>
          </div>
        ),
      },
    ],
    [tiposByKey, contratos, socios, handleDelete],
  );

  return (
    <>
      <PageHeader
        title="Aportes dos SÃ³cios"
        subtitle="Aportes de capital por sÃ³cio ou via caixa da empresa"
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
              label="ðŸ‘¥ Aportes dos SÃ³cios"
              borda="var(--color-info)"
              cor="var(--color-info)"
            />
            <KpiCard
              valor={formatBRL(totalCaixa)}
              label="ðŸ’° Via Caixa da Empresa"
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
              <h3 className="text-[15px] font-semibold tracking-tight">HistÃ³rico de Aportes</h3>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {aportesFiltrados.length} aporte
                {aportesFiltrados.length !== 1 ? 's' : ''}
              </span>
            </div>
            <DataTable
              columns={columns}
              rows={aportesFiltrados}
              rowKey={(ap) => ap.id}
              onRowClick={(ap) => setDetalheId(ap.id)}
              emptyMessage="Nenhum aporte registrado"
            />
            {aportesFiltrados.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: 'var(--sp-md)',
                  background: 'var(--color-bg)',
                  fontWeight: 700,
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <span>Total filtrado</span>
                <span>{formatBRL(totalFiltrado)}</span>
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
      ðŸ’° Caixa
    </Badge>
  ) : (
    <Badge style={{ background: 'rgba(49,130,206,.15)', color: '#3182CE' }}>
      ðŸ‘¥ SÃ³cio
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
        âš™ï¸ BASE
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
          ðŸ“‹ {contractName(contrato)}
        </Badge>
      </Link>
    );
  }
  return (
    <Badge style={{ background: 'rgba(113,128,150,.15)', color: '#718096' }}>
      ðŸ“‹ {contractId ? 'Contrato removido' : 'Contrato'}
    </Badge>
  );
}

interface ResumoPorSocioProps {
  socios: Socio[];
  aportesDosSocios: Investimento[];
  totalSocios: number;
}

/** Tabela "Aportes por SÃ³cio" â€” compara aporte realizado x esperado. */
function ResumoPorSocio({
  socios,
  aportesDosSocios,
  totalSocios,
}: ResumoPorSocioProps) {
  const columns = useMemo<Column<Socio>[]>(
    () => [
      {
        header: 'SÃ³cio',
        cell: (socio) => <strong>{socio.name}</strong>,
      },
      {
        header: 'ParticipaÃ§Ã£o',
        cell: (socio) => `${num(socio.participacao).toFixed(2)}%`,
      },
      {
        header: 'Aporte Realizado',
        align: 'right',
        cell: (socio) => {
          const aportado = aportesDosSocios
            .filter((a) => a.socioId === socio.id)
            .reduce((s, a) => s + num(a.value), 0);
          return <span style={{ fontWeight: 600 }}>{formatBRL(aportado)}</span>;
        },
      },
      {
        header: 'ContribuiÃ§Ã£o Esperada',
        align: 'right',
        cell: (socio) => {
          const esperado =
            totalSocios > 0
              ? (totalSocios * num(socio.participacao)) / 100
              : 0;
          return (
            <span style={{ color: 'var(--color-text-muted)' }}>
              {formatBRL(esperado)}
            </span>
          );
        },
      },
      {
        header: 'DiferenÃ§a',
        align: 'right',
        cell: (socio) => {
          const aportado = aportesDosSocios
            .filter((a) => a.socioId === socio.id)
            .reduce((s, a) => s + num(a.value), 0);
          const esperado =
            totalSocios > 0
              ? (totalSocios * num(socio.participacao)) / 100
              : 0;
          const diff = aportado - esperado;
          return (
            <span
              style={{
                fontWeight: 700,
                color: diff >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
              }}
            >
              {diff >= 0 ? '+' : ''}
              {formatBRL(diff)}
            </span>
          );
        },
      },
    ],
    [aportesDosSocios, totalSocios],
  );

  return (
    <Card style={{ marginBottom: 48 }}>
      <div className="flex justify-between items-center mb-4 px-5 pt-5">
        <h3 className="text-[15px] font-semibold tracking-tight">Aportes por SÃ³cio</h3>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Comparando com participaÃ§Ã£o societÃ¡ria
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={socios}
        rowKey={(socio) => socio.id}
        emptyMessage="Nenhum sÃ³cio encontrado"
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: 'var(--sp-md)',
          background: 'var(--color-bg)',
          fontWeight: 700,
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <span>TOTAL — 100,00%</span>
        <span>{formatBRL(totalSocios)}</span>
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
      toast.error('Informe um valor vÃ¡lido');
      return;
    }
    if (origem === 'socio' && !socioId) {
      toast.error('Selecione o sÃ³cio');
      return;
    }
    if (destino === 'contrato' && !contractId) {
      toast.error('Selecione o contrato de destino');
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
        if (origem === 'caixa_empresa') msgs.push('saÃ­da lanÃ§ada no caixa');
        if (destino === 'base') msgs.push('item criado na BASE');
        const extra = msgs.length > 0 ? ` (${msgs.join(' e ')})` : '';
        toast.success(`Aporte registrado${extra}`);
        onClose();
      },
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Novo Aporte</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
                  titulo="ðŸ‘¥ SÃ³cio"
                  descricao="Aporte de um sÃ³cio"
                  activeBorder="var(--color-info)"
                  activeBg="rgba(49,130,206,.05)"
                />
                <RadioCard
                  name="origem"
                  checked={origem === 'caixa_empresa'}
                  onChange={() => setOrigem('caixa_empresa')}
                  titulo="ðŸ’° Caixa da Empresa"
                  descricao="AquisiÃ§Ã£o via caixa (gera saÃ­da)"
                  activeBorder="var(--color-warning)"
                  activeBg="rgba(214,158,46,.05)"
                />
              </div>
            </div>

            {origem === 'socio' && (
              <FormField label="SÃ³cio *" htmlFor="aporte-socio">
                <Combobox
                  id="aporte-socio"
                  options={socios.map((s) => ({ value: s.id, label: s.name }))}
                  value={socioId}
                  onChange={setSocioId}
                  placeholder="Selecionar..."
                  searchPlaceholder="Pesquisar sÃ³cio..."
                  emptyText="Nenhum sÃ³cio encontrado."
                />
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
                  titulo="ðŸ“‹ Contrato"
                  descricao="Aporte para um contrato especÃ­fico"
                  activeBorder="var(--color-primary)"
                  activeBg="rgba(46,125,82,.05)"
                />
                <RadioCard
                  name="destino"
                  checked={destino === 'base'}
                  onChange={() => setDestino('base')}
                  titulo="âš™ï¸ BASE"
                  descricao="Custo administrativo geral"
                  activeBorder="var(--color-info)"
                  activeBg="rgba(49,130,206,.05)"
                />
              </div>
            </div>

            {destino === 'contrato' && (
              <FormField label="Contrato *" htmlFor="aporte-contrato">
                <Combobox
                  id="aporte-contrato"
                  options={contratos.map((c) => ({
                    value: c.id,
                    label: `${String(c.name ?? 'Contrato')} â€” ${String(c.client ?? '')}`,
                  }))}
                  value={contractId}
                  onChange={setContractId}
                  placeholder="Selecionar contrato..."
                  searchPlaceholder="Pesquisar contrato..."
                  emptyText="Nenhum contrato encontrado."
                />
              </FormField>
            )}

            <FormField
              label="Tipo de Custo *"
              htmlFor="aporte-tipo"
              helper="Classifica a natureza do custo (ex.: Material, VeÃ­culo, Software)."
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
              <FormField label="DescriÃ§Ã£o" htmlFor="aporte-desc">
                <Textarea
                  id="aporte-desc"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ex.: Compra de notebook, maquinÃ¡rio, capital de giro..."
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
                âš ï¸ Este aporte gerarÃ¡ uma{' '}
                <strong>saÃ­da contÃ¡bil automÃ¡tica</strong> no caixa da empresa.
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
                â„¹ï¸ Um item serÃ¡ criado na <strong>BASE</strong> para este aporte,
                pronto para ser alocado em contratos.
              </div>
            )}
          </form>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="form-aporte" disabled={saving}>
            {saving ? 'Salvando...' : 'Registrar Aporte'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

/** CartÃ£o de seleÃ§Ã£o tipo radio â€” usado para origem e destino do aporte. */
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
      ? 'ðŸ‘¤ SÃ³cio'
      : aporte.origem === 'caixa_empresa'
        ? 'ðŸ’¼ Caixa da empresa'
        : aporte.origem || 'â€”';
  const destinoLabel =
    aporte.destino === 'base'
      ? 'âš™ï¸ BASE'
      : aporte.destino === 'contrato'
        ? 'ðŸ“‹ Contrato'
        : aporte.destino || 'â€”';

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{aporte.description || 'Aporte'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
              label="SÃ³cio"
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
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="danger" onClick={onDelete}>
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
