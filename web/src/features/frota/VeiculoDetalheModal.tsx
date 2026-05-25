import { useState } from 'react';
import Button from '../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import FormField from '../../components/ui/FormField';
import Spinner from '../../components/ui/Spinner';
import { Input, Select, Textarea } from '../../components/ui/controls';
import { DatePicker } from '../../components/ui/date-picker';
import { Combobox } from '../../components/ui/combobox';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import { formatDateBR, todayISO } from '../../lib/formatDate';
import { useFornecedores, useVeiculos } from '../resources';
import type { Veiculo, VeiculoManutencao, VeiculoPlano } from '../../types/domain';
import {
  useCriarManutencaoVeiculo,
  useCriarPlano,
  useDeletarManutencaoVeiculo,
  useDeletarPlano,
  useEditarPlano,
} from './queries';

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

const num = (v: string): number | null => (v === '' ? null : Number(v));

// ── Modal de plano de manutenção ──────────────────────────────────────────

function PlanoModal({
  veiculoId,
  plano,
  onClose,
}: {
  veiculoId: string;
  plano: VeiculoPlano | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const criar = useCriarPlano();
  const editar = useEditarPlano();
  const isEdit = Boolean(plano);

  const [descricao, setDescricao] = useState(plano?.descricao ?? '');
  const [intervaloKm, setIntervaloKm] = useState(
    String(plano?.intervaloKm ?? ''),
  );
  const [intervaloMeses, setIntervaloMeses] = useState(
    String(plano?.intervaloMeses ?? ''),
  );
  const [ultimoKm, setUltimoKm] = useState(String(plano?.ultimoKm ?? ''));
  const [ultimaData, setUltimaData] = useState(plano?.ultimaData ?? '');

  const pending = criar.isPending || editar.isPending;

  function submit() {
    if (!descricao.trim()) {
      toast.show('Descrição obrigatória', 'danger');
      return;
    }
    if (!intervaloKm && !intervaloMeses) {
      toast.show('Informe pelo menos KM ou meses', 'danger');
      return;
    }
    const input = {
      descricao: descricao.trim(),
      intervaloKm: num(intervaloKm),
      intervaloMeses: num(intervaloMeses),
      ultimoKm: num(ultimoKm),
      ultimaData: ultimaData || null,
    };
    const handlers = {
      onSuccess: () => {
        toast.show(isEdit ? 'Plano atualizado' : 'Plano criado', 'success');
        onClose();
      },
      onError: (e: Error) => toast.show(e.message, 'danger'),
    };
    if (plano) editar.mutate({ veiculoId, planoId: plano.id, input }, handlers);
    else criar.mutate({ veiculoId, input }, handlers);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar plano' : 'Novo plano'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <FormField label="Descrição *" htmlFor="pl-desc">
            <Input
              id="pl-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Troca de óleo"
            />
          </FormField>
          <Row>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Intervalo KM" htmlFor="pl-km">
                <Input
                  id="pl-km"
                  type="number"
                  value={intervaloKm}
                  onChange={(e) => setIntervaloKm(e.target.value)}
                  placeholder="Ex: 10000"
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Intervalo (meses)" htmlFor="pl-meses">
                <Input
                  id="pl-meses"
                  type="number"
                  value={intervaloMeses}
                  onChange={(e) => setIntervaloMeses(e.target.value)}
                  placeholder="Ex: 6"
                />
              </FormField>
            </div>
          </Row>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Informe pelo menos um dos dois — o sistema alerta o que vencer primeiro.
          </p>
          <Row>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Último KM (última execução)" htmlFor="pl-ukm">
                <Input
                  id="pl-ukm"
                  type="number"
                  value={ultimoKm}
                  onChange={(e) => setUltimoKm(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Última data" htmlFor="pl-udata">
                <DatePicker
                  id="pl-udata"
                  value={ultimaData}
                  onChange={(val) => setUltimaData(val)}
                />
              </FormField>
            </div>
          </Row>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal de registro de manutenção ───────────────────────────────────────

function ManutModal({
  veiculo,
  onClose,
}: {
  veiculo: Veiculo;
  onClose: () => void;
}) {
  const toast = useToast();
  const criar = useCriarManutencaoVeiculo();
  const fornecedoresQuery = useFornecedores();

  const [data, setData] = useState(todayISO());
  const [tipo, setTipo] = useState('preventiva');
  const [planoId, setPlanoId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [km, setKm] = useState(String(veiculo.kmAtual ?? ''));
  const [custo, setCusto] = useState('0');
  const [fornecedorId, setFornecedorId] = useState('');

  const planos = veiculo.planos ?? [];
  const fornecedores = fornecedoresQuery.data ?? [];

  function submit() {
    if (!data) {
      toast.show('Informe a data', 'danger');
      return;
    }
    if (!descricao.trim()) {
      toast.show('Descreva os serviços executados', 'danger');
      return;
    }
    criar.mutate(
      {
        veiculoId: veiculo.id,
        input: {
          data,
          tipo,
          planoId: planoId || null,
          descricao: descricao.trim(),
          observacoes: observacoes.trim(),
          km: num(km),
          custo: Number(custo) || 0,
          fornecedorId: fornecedorId || null,
        },
      },
      {
        onSuccess: () => {
          toast.show('Manutenção registrada', 'success');
          onClose();
        },
        onError: (e) => toast.show(e.message, 'danger'),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>Registrar manutenção</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Row>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Data *" htmlFor="mn-data">
                <DatePicker
                  id="mn-data"
                  value={data}
                  onChange={(val) => setData(val)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Tipo" htmlFor="mn-tipo">
                <Select
                  id="mn-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                >
                  <option value="preventiva">Preventiva</option>
                  <option value="corretiva">Corretiva</option>
                  <option value="revisao">Revisão</option>
                </Select>
              </FormField>
            </div>
          </Row>
          <FormField label="Plano vinculado" htmlFor="mn-plano">
            <Select
              id="mn-plano"
              value={planoId}
              onChange={(e) => setPlanoId(e.target.value)}
            >
              <option value="">— Manutenção avulsa —</option>
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.descricao}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Serviços executados / O que foi feito *" htmlFor="mn-desc">
            <Textarea
              id="mn-desc"
              rows={5}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Liste o que foi realizado (troca de óleo, filtros, freios...)."
            />
          </FormField>
          <FormField label="Observações adicionais" htmlFor="mn-obs">
            <Textarea
              id="mn-obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas, garantia, próximos pontos de atenção..."
            />
          </FormField>
          <Row>
            <div style={{ flex: 1, minWidth: 110 }}>
              <FormField label="KM no momento" htmlFor="mn-km">
                <Input
                  id="mn-km"
                  type="number"
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <FormField label="Custo" htmlFor="mn-custo">
                <Input
                  id="mn-custo"
                  type="number"
                  step="0.01"
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Fornecedor" htmlFor="mn-forn">
                <Combobox
                  id="mn-forn"
                  options={fornecedores.map((f) => ({ value: f.id, label: String(f.nome ?? '') }))}
                  value={fornecedorId}
                  onChange={setFornecedorId}
                  placeholder="— Selecionar —"
                  searchPlaceholder="Pesquisar fornecedor..."
                  emptyText="Nenhum fornecedor encontrado."
                />
              </FormField>
            </div>
          </Row>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={criar.isPending}>
            {criar.isPending ? 'Salvando…' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal de detalhe do veículo ───────────────────────────────────────────

type Aba = 'plano' | 'historico';
type SubModal = { tipo: 'plano'; plano: VeiculoPlano | null } | { tipo: 'manut' } | null;

interface VeiculoDetalheModalProps {
  veiculoId: string;
  onClose: () => void;
}

/** Modal de detalhe do veículo — abas de plano de manutenção e histórico. */
export default function VeiculoDetalheModal({
  veiculoId,
  onClose,
}: VeiculoDetalheModalProps) {
  const toast = useToast();
  const veiculosQuery = useVeiculos();
  const deletarPlano = useDeletarPlano();
  const deletarManut = useDeletarManutencaoVeiculo();
  const [aba, setAba] = useState<Aba>('plano');
  const [subModal, setSubModal] = useState<SubModal>(null);

  const veiculo = (veiculosQuery.data ?? []).find((v) => v.id === veiculoId);

  function handleDeletarPlano(planoId: string) {
    if (!window.confirm('Excluir este plano?')) return;
    deletarPlano.mutate(
      { veiculoId, planoId },
      { onError: (e) => toast.show(e.message, 'danger') },
    );
  }
  function handleDeletarManut(manutId: string) {
    if (!window.confirm('Excluir esta manutenção?')) return;
    deletarManut.mutate(
      { veiculoId, manutId },
      { onError: (e) => toast.show(e.message, 'danger') },
    );
  }

  const titulo = veiculo
    ? `${veiculo.placa} · ${`${veiculo.marca ?? ''} ${veiculo.modelo ?? ''}`.trim()}`
    : 'Veículo';

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[920px]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!veiculo ? (
            <Spinner label="Carregando veículo..." />
          ) : (
            <>
              <p
                style={{
                  margin: '0 0 var(--sp-md)',
                  fontSize: 13,
                  color: 'var(--color-text-muted)',
                }}
              >
                {(veiculo.kmAtual ?? 0).toLocaleString('pt-BR')} km ·{' '}
                {veiculo.status}
              </p>

              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  borderBottom: '1px solid var(--color-border)',
                  marginBottom: 'var(--sp-md)',
                }}
              >
                {(
                  [
                    ['plano', 'Plano de Manutenção'],
                    ['historico', 'Histórico'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAba(key)}
                    style={{
                      padding: '8px 14px',
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontWeight: aba === key ? 600 : 400,
                      color: aba === key ? '#1F497D' : '#64748b',
                      borderBottom: `2px solid ${
                        aba === key ? '#1F497D' : 'transparent'
                      }`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {aba === 'plano' ? (
                <PlanoTab
                  veiculo={veiculo}
                  onAdd={() => setSubModal({ tipo: 'plano', plano: null })}
                  onEdit={(p) => setSubModal({ tipo: 'plano', plano: p })}
                  onDelete={handleDeletarPlano}
                />
              ) : (
                <HistoricoTab
                  veiculo={veiculo}
                  onAdd={() => setSubModal({ tipo: 'manut' })}
                  onDelete={handleDeletarManut}
                />
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>

      {subModal?.tipo === 'plano' && (
        <PlanoModal
          veiculoId={veiculoId}
          plano={subModal.plano}
          onClose={() => setSubModal(null)}
        />
      )}
      {subModal?.tipo === 'manut' && veiculo && (
        <ManutModal veiculo={veiculo} onClose={() => setSubModal(null)} />
      )}
    </Dialog>
  );
}

// ── Abas internas ─────────────────────────────────────────────────────────

function PlanoTab({
  veiculo,
  onAdd,
  onEdit,
  onDelete,
}: {
  veiculo: Veiculo;
  onAdd: () => void;
  onEdit: (p: VeiculoPlano) => void;
  onDelete: (id: string) => void;
}) {
  const planos = veiculo.planos ?? [];
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--sp-sm)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>Plano de Manutenção</h3>
        <Button size="sm" onClick={onAdd}>
          + Adicionar plano
        </Button>
      </div>
      {planos.length === 0 ? (
        <p className="text-muted" style={{ textAlign: 'center', padding: 24 }}>
          Nenhum plano cadastrado
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Intervalo KM</th>
                <th>Intervalo</th>
                <th>Último KM</th>
                <th>Última data</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {planos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.descricao}</strong>
                  </td>
                  <td>
                    {p.intervaloKm
                      ? `${p.intervaloKm.toLocaleString('pt-BR')} km`
                      : '—'}
                  </td>
                  <td>{p.intervaloMeses ? `${p.intervaloMeses} meses` : '—'}</td>
                  <td>
                    {p.ultimoKm
                      ? `${p.ultimoKm.toLocaleString('pt-BR')} km`
                      : '—'}
                  </td>
                  <td>{formatDateBR(p.ultimaData)}</td>
                  <td>
                    <a
                      className="action-link"
                      style={{ cursor: 'pointer' }}
                      onClick={() => onEdit(p)}
                    >
                      Editar
                    </a>{' '}
                    ·{' '}
                    <a
                      className="action-link danger"
                      style={{ cursor: 'pointer' }}
                      onClick={() => onDelete(p.id)}
                    >
                      ×
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function HistoricoTab({
  veiculo,
  onAdd,
  onDelete,
}: {
  veiculo: Veiculo;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const manuts = veiculo.manutencoes ?? [];
  const planos = veiculo.planos ?? [];
  const nomePlano = (id?: string | null): string =>
    planos.find((p) => p.id === id)?.descricao ?? '';

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--sp-sm)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>Histórico de Manutenções</h3>
        <Button size="sm" onClick={onAdd}>
          + Registrar manutenção
        </Button>
      </div>
      {manuts.length === 0 ? (
        <p className="text-muted" style={{ textAlign: 'center', padding: 24 }}>
          Nenhuma manutenção registrada
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>KM</th>
                <th>Custo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {manuts.map((m: VeiculoManutencao) => (
                <tr key={m.id}>
                  <td>{formatDateBR(m.data)}</td>
                  <td>{m.tipo || '—'}</td>
                  <td>{m.descricao || nomePlano(m.planoId)}</td>
                  <td>
                    {m.km ? `${m.km.toLocaleString('pt-BR')} km` : '—'}
                  </td>
                  <td>{m.custo ? formatBRL(m.custo) : '—'}</td>
                  <td>
                    <a
                      className="action-link danger"
                      style={{ cursor: 'pointer' }}
                      onClick={() => onDelete(m.id)}
                    >
                      ×
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
