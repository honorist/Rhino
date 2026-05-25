import { useState } from 'react';
import Button from '../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import Spinner from '../../components/ui/Spinner';
import FormField from '../../components/ui/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/native-select';
import { DatePicker } from '../../components/ui/date-picker';
import { toast } from 'sonner';
import { formatBRL } from '../../lib/format';
import { formatDateBR, todayISO } from '../../lib/formatDate';
import { useContracts } from '../contracts/queries';
import { useRecursos } from '../resources';
import type { Folga, Passagem, Recurso } from '../../types/domain';
import { calcProximaFolga } from './proximaFolga';
import { useAddFolga, useComprarPassagem, useDeleteFolga } from './queries';

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

// ── Nova folga ────────────────────────────────────────────────────────────

function NovaFolgaModal({
  recurso,
  onClose,
}: {
  recurso: Recurso;
  onClose: () => void;
}) {
  const addFolga = useAddFolga();
  const prox = calcProximaFolga(recurso);
  const cicloFolga = recurso.alocacaoAtual?.cicloFolga ?? 7;

  const inicioPadrao = prox?.dataProxima ?? '';
  const fimPadrao = inicioPadrao
    ? (() => {
        const d = new Date(`${inicioPadrao}T12:00:00`);
        d.setDate(d.getDate() + cicloFolga - 1);
        return d.toISOString().slice(0, 10);
      })()
    : '';

  const [dataInicio, setDataInicio] = useState(inicioPadrao);
  const [dataFim, setDataFim] = useState(fimPadrao);
  const [observacoes, setObservacoes] = useState('');

  function submit() {
    if (!dataInicio) {
      toast.error('Data de início obrigatória');
      return;
    }
    addFolga.mutate(
      { recursoId: recurso.id, input: { dataInicio, dataFim, observacoes } },
      {
        onSuccess: () => {
          toast.success('Folga registrada');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{`Registrar Folga — ${recurso.nome}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Row>
            <div style={{ flex: 1, minWidth: 150 }}>
              <FormField label="Início da folga *" htmlFor="nf-ini">
                <DatePicker
                  id="nf-ini"
                  value={dataInicio}
                  onChange={(val) => setDataInicio(val)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <FormField label="Fim da folga *" htmlFor="nf-fim">
                <DatePicker
                  id="nf-fim"
                  value={dataFim}
                  onChange={(val) => setDataFim(val)}
                />
              </FormField>
            </div>
          </Row>
          <FormField label="Observações" htmlFor="nf-obs">
            <Textarea
              id="nf-obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={addFolga.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={addFolga.isPending}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Comprar passagem ──────────────────────────────────────────────────────

function ComprarPassagemModal({
  recurso,
  folgaId,
  tipo,
  onClose,
}: {
  recurso: Recurso;
  folgaId: string;
  tipo: 'ida' | 'volta';
  onClose: () => void;
}) {
  const comprar = useComprarPassagem();
  const contractsQuery = useContracts();
  const contratos = (contractsQuery.data ?? []).filter(
    (c) => c.status === 'ativo',
  );

  const [companhia, setCompanhia] = useState('');
  const [numeroVoo, setNumeroVoo] = useState('');
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [dataVoo, setDataVoo] = useState('');
  const [horario, setHorario] = useState('');
  const [valor, setValor] = useState('');
  const [dataCompra, setDataCompra] = useState(todayISO());
  const [financiadoPor, setFinanciadoPor] = useState<'caixa' | 'contrato'>(
    'caixa',
  );
  const [contractIdPagador, setContractIdPagador] = useState('');
  const [tipoLancamento, setTipoLancamento] = useState<
    'caixa_direto' | 'conta_pagar'
  >('caixa_direto');

  function submit() {
    const v = Number(valor) || 0;
    if (v <= 0) {
      toast.error('Informe o valor da passagem');
      return;
    }
    comprar.mutate(
      {
        recursoId: recurso.id,
        folgaId,
        input: {
          tipo,
          companhia,
          numeroVoo,
          origem,
          destino,
          dataVoo,
          horario,
          valor: v,
          dataCompra,
          financiadoPor,
          contractIdPagador:
            financiadoPor === 'contrato' ? contractIdPagador || null : null,
          tipoLancamento,
        },
      },
      {
        onSuccess: () => {
          toast.success('Passagem registrada e lançada no financeiro');
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{`Passagem de ${tipo === 'ida' ? 'Ida' : 'Volta'} — ${recurso.nome}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Row>
            <div style={{ flex: 1, minWidth: 150 }}>
              <FormField label="Companhia Aérea" htmlFor="ps-comp">
                <Input
                  id="ps-comp"
                  value={companhia}
                  onChange={(e) => setCompanhia(e.target.value)}
                  placeholder="Ex: LATAM, GOL, Azul"
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Número do Voo" htmlFor="ps-voo">
                <Input
                  id="ps-voo"
                  value={numeroVoo}
                  onChange={(e) => setNumeroVoo(e.target.value)}
                />
              </FormField>
            </div>
          </Row>
          <Row>
            <div style={{ flex: 1, minWidth: 120 }}>
              <FormField label="Origem" htmlFor="ps-org">
                <Input
                  id="ps-org"
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <FormField label="Destino" htmlFor="ps-dst">
                <Input
                  id="ps-dst"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                />
              </FormField>
            </div>
          </Row>
          <Row>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Data do Voo" htmlFor="ps-data">
                <DatePicker
                  id="ps-data"
                  value={dataVoo}
                  onChange={(val) => setDataVoo(val)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <FormField label="Horário" htmlFor="ps-hora">
                <Input
                  id="ps-hora"
                  type="time"
                  value={horario}
                  onChange={(e) => setHorario(e.target.value)}
                />
              </FormField>
            </div>
          </Row>
          <Row>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Valor da passagem (R$) *" htmlFor="ps-valor">
                <Input
                  id="ps-valor"
                  type="number"
                  step="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Data da compra *" htmlFor="ps-dc">
                <DatePicker
                  id="ps-dc"
                  value={dataCompra}
                  onChange={(val) => setDataCompra(val)}
                />
              </FormField>
            </div>
          </Row>
          <FormField label="Quem paga? *" htmlFor="ps-fin">
            <Select
              id="ps-fin"
              value={financiadoPor}
              onChange={(e) =>
                setFinanciadoPor(e.target.value as 'caixa' | 'contrato')
              }
            >
              <option value="caixa">Caixa da empresa</option>
              <option value="contrato">Contrato específico</option>
            </Select>
          </FormField>
          {financiadoPor === 'contrato' && (
            <FormField label="Contrato pagador" htmlFor="ps-cp">
              <Select
                id="ps-cp"
                value={contractIdPagador}
                onChange={(e) => setContractIdPagador(e.target.value)}
              >
                <option value="">Selecione...</option>
                {contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {String(c.name ?? '')}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Como lançar no financeiro?" htmlFor="ps-tl">
            <Select
              id="ps-tl"
              value={tipoLancamento}
              onChange={(e) =>
                setTipoLancamento(e.target.value as 'caixa_direto' | 'conta_pagar')
              }
            >
              <option value="caixa_direto">Saída direta no Caixa</option>
              <option value="conta_pagar">Conta a Pagar (pendente)</option>
            </Select>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={comprar.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={comprar.isPending}>
            Confirmar Compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Card de folga ─────────────────────────────────────────────────────────

function PassagemLinha({
  rotulo,
  passagem,
  onComprar,
}: {
  rotulo: string;
  passagem?: Passagem;
  onComprar: () => void;
}) {
  if (!passagem?.comprada) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ width: 50, color: 'var(--color-text-muted)', fontSize: 14 }}>
          {rotulo}:
        </span>
        <Button size="sm" variant="secondary" onClick={onComprar}>
          Comprar {rotulo.toLowerCase()}
        </Button>
      </div>
    );
  }
  const voo = [
    passagem.companhia,
    passagem.numeroVoo && `Voo ${passagem.numeroVoo}`,
    passagem.origem && passagem.destino
      ? `${passagem.origem} → ${passagem.destino}`
      : '',
    passagem.dataVoo && formatDateBR(passagem.dataVoo),
    passagem.horario,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ width: 50, color: 'var(--color-text-muted)', fontSize: 14 }}>
        {rotulo}:
      </span>
      <div>
        <span style={{ color: '#059669', fontSize: 14 }}>
          ✓ {formatBRL(passagem.valor ?? 0)} ·{' '}
          {passagem.financiadoPor === 'contrato'
            ? 'Contrato'
            : 'Caixa da empresa'}
        </span>
        {voo && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {voo}
          </div>
        )}
      </div>
    </div>
  );
}

interface FolgasModalProps {
  recursoId: string;
  onClose: () => void;
}

type SubModal =
  | { tipo: 'nova' }
  | { tipo: 'passagem'; folgaId: string; passagemTipo: 'ida' | 'volta' }
  | null;

/** Modal de folgas de um colaborador. */
export default function FolgasModal({ recursoId, onClose }: FolgasModalProps) {
  const recursosQuery = useRecursos();
  const deleteFolga = useDeleteFolga();
  const [sub, setSub] = useState<SubModal>(null);

  const recurso = (recursosQuery.data ?? []).find((r) => r.id === recursoId);
  const folgas = [...(recurso?.folgas ?? [])].sort(
    (a, b) =>
      new Date(b.dataInicio).getTime() - new Date(a.dataInicio).getTime(),
  );
  const prox = recurso ? calcProximaFolga(recurso) : null;

  function handleExcluir(folga: Folga) {
    if (!window.confirm('Excluir este registro de folga?')) return;
    deleteFolga.mutate(
      { recursoId, folgaId: folga.id },
      {
        onSuccess: () => toast.success('Folga excluída'),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{`Folgas — ${recurso?.nome ?? ''}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!recurso ? (
            <Spinner label="Carregando..." />
          ) : (
            <>
              {prox ? (
                <div
                  style={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    padding: 'var(--sp-md)',
                    marginBottom: 'var(--sp-lg)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {prox.diasRestantes < 0
                        ? `Vencida há ${Math.abs(prox.diasRestantes)} dias`
                        : prox.diasRestantes === 0
                          ? 'Folga devida hoje'
                          : `${prox.diasRestantes} dias para a próxima folga`}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      Próxima folga: {formatDateBR(prox.dataProxima)}
                    </div>
                  </div>
                  <Button onClick={() => setSub({ tipo: 'nova' })}>
                    + Registrar Folga
                  </Button>
                </div>
              ) : (
                <p className="text-muted" style={{ marginBottom: 'var(--sp-lg)' }}>
                  Nenhuma alocação configurada. Edite o cadastro e defina a obra.
                </p>
              )}

              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 'var(--sp-md)' }}>
                Histórico de Folgas
              </h3>
              {folgas.length === 0 ? (
                <p
                  className="text-muted text-center"
                  style={{ padding: 'var(--sp-xl)' }}
                >
                  Nenhuma folga registrada
                </p>
              ) : (
                folgas.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      padding: 'var(--sp-md)',
                      marginBottom: 'var(--sp-sm)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div>
                        <strong>
                          {formatDateBR(f.dataInicio)} →{' '}
                          {f.dataFim ? formatDateBR(f.dataFim) : '?'}
                        </strong>
                        {f.observacoes && (
                          <div
                            style={{ fontSize: 14, color: 'var(--color-text-muted)' }}
                          >
                            {f.observacoes}
                          </div>
                        )}
                      </div>
                      <a
                        className="action-link danger"
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleExcluir(f)}
                      >
                        Excluir
                      </a>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        marginTop: 'var(--sp-sm)',
                      }}
                    >
                      <PassagemLinha
                        rotulo="Ida"
                        passagem={f.passagemIda}
                        onComprar={() =>
                          setSub({
                            tipo: 'passagem',
                            folgaId: f.id,
                            passagemTipo: 'ida',
                          })
                        }
                      />
                      <PassagemLinha
                        rotulo="Volta"
                        passagem={f.passagemVolta}
                        onComprar={() =>
                          setSub({
                            tipo: 'passagem',
                            folgaId: f.id,
                            passagemTipo: 'volta',
                          })
                        }
                      />
                    </div>
                  </div>
                ))
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

      {sub?.tipo === 'nova' && recurso && (
        <NovaFolgaModal recurso={recurso} onClose={() => setSub(null)} />
      )}
      {sub?.tipo === 'passagem' && recurso && (
        <ComprarPassagemModal
          recurso={recurso}
          folgaId={sub.folgaId}
          tipo={sub.passagemTipo}
          onClose={() => setSub(null)}
        />
      )}
    </Dialog>
  );
}
