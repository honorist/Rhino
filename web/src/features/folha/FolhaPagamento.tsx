import { useState, type ReactNode } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import FormField from '../../components/ui/FormField';
import { Input, Select } from '../../components/ui/controls';
import { DatePicker } from '../../components/ui/date-picker';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import type { Contract } from '../contracts/types';
import { useContracts } from '../contracts/queries';
import {
  PRESETS,
  findPreset,
  presetDescricao,
  presetSuggestion,
  type FolhaPreset,
} from './presets';
import {
  useAddFolhaItem,
  useEstornarParcela,
  useFolha,
  useGerarFolha,
  useLimparFolha,
  usePagarParcela,
  useRemoveFolhaItem,
  useUpdateFolhaItem,
} from './queries';
import type { FolhaItem, FolhaParcela, FolhaRow } from './types';

const num = (v: unknown): number => Number(v) || 0;
const round2 = (v: number): number => Math.round(v * 100) / 100;

function currentCompetencia(): string {
  return new Date().toISOString().slice(0, 7);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nomeLocal(row: FolhaRow, contracts: Contract[]): string {
  if (!row.contractId) return 'Sede (BASE)';
  const c = contracts.find((x) => x.id === row.contractId);
  if (!c) return 'Contrato';
  return String(c.name ?? c.contractNumber ?? 'Contrato');
}

function somaItens(itens: FolhaItem[], tipo: FolhaItem['tipo']): number {
  return itens
    .filter((it) => it.tipo === tipo)
    .reduce((s, it) => s + num(it.valor), 0);
}

function StatusBadge({ pago }: { pago: boolean }) {
  return pago ? (
    <Badge style={{ background: '#D1FAE5', color: '#065F46' }}>
      Pago
    </Badge>
  ) : (
    <Badge style={{ background: '#FEF3C7', color: '#92400E' }}>
      Pendente
    </Badge>
  );
}

/** Tela de Folha de Pagamento — migração de js/views/FolhaPagamento.js. */
export default function FolhaPagamento() {
  const toast = useToast();
  const [competencia, setCompetencia] = useState(currentCompetencia);

  const folhaQuery = useFolha(competencia);
  const contractsQuery = useContracts();
  const gerarFolha = useGerarFolha();
  const limparFolha = useLimparFolha();
  const estornarParcela = useEstornarParcela();

  const [pagar, setPagar] = useState<{
    row: FolhaRow;
    parcela: FolhaParcela;
  } | null>(null);
  const [acertosId, setAcertosId] = useState<string | null>(null);

  const folha = folhaQuery.data ?? [];
  const contracts = contractsQuery.data ?? [];

  let totVale = 0;
  let totValePago = 0;
  let totSaldo = 0;
  let totSaldoPago = 0;
  let totProv = 0;
  let totDesc = 0;
  folha.forEach((f) => {
    totVale += num(f.valorVale);
    totSaldo += num(f.valorSaldo);
    if (f.valePago) totValePago += num(f.valorVale);
    if (f.saldoPago) totSaldoPago += num(f.valorSaldo);
    totProv += somaItens(f.itens ?? [], 'provento');
    totDesc += somaItens(f.itens ?? [], 'desconto');
  });
  const totalGeral = totVale + totSaldo;
  const totalPago = totValePago + totSaldoPago;

  const subtitle =
    `${folha.length} colaborador${folha.length !== 1 ? 'es' : ''} · ` +
    `Total ${formatBRL(totalGeral)} · Pago ${formatBRL(totalPago)} · ` +
    `Pendente ${formatBRL(totalGeral - totalPago)}` +
    (totProv || totDesc
      ? ` · Proventos ${formatBRL(totProv)} · Descontos ${formatBRL(totDesc)}`
      : '');

  function handleGerar() {
    gerarFolha.mutate(competencia, {
      onSuccess: (r) =>
        toast.show(
          `Folha de ${competencia} gerada — ${r.criadas} novo(s) registro(s)`,
          'success',
        ),
      onError: (error) =>
        toast.show(`Erro ao gerar folha: ${error.message}`, 'danger'),
    });
  }

  function handleLimpar() {
    if (
      !window.confirm(
        `Limpar a folha de ${competencia}?\n\nOs registros ainda NÃO pagos ` +
          `(e suas contas a pagar) serão removidos. Os já pagos são mantidos.`,
      )
    ) {
      return;
    }
    limparFolha.mutate(competencia, {
      onSuccess: (r) =>
        toast.show(
          `${r.removidas} registro(s) removido(s)` +
            (r.mantidas ? ` · ${r.mantidas} mantido(s) (já pago)` : ''),
          'success',
        ),
      onError: (error) =>
        toast.show(`Erro ao limpar: ${error.message}`, 'danger'),
    });
  }

  function handleEstornar(row: FolhaRow, parcela: FolhaParcela) {
    if (
      !window.confirm(
        'Estornar este pagamento? O lançamento no Caixa será removido.',
      )
    ) {
      return;
    }
    estornarParcela.mutate(
      { id: row.id, parcela },
      {
        onSuccess: () => toast.show('Pagamento estornado', 'success'),
        onError: (error) =>
          toast.show(`Erro ao estornar: ${error.message}`, 'danger'),
      },
    );
  }

  const acertosRow = acertosId
    ? folha.find((f) => f.id === acertosId) ?? null
    : null;

  return (
    <>
      <PageHeader
        title="Folha de Pagamento"
        subtitle={subtitle}
        actions={
          <>
            <Input
              type="month"
              value={competencia}
              onChange={(event) =>
                setCompetencia(event.target.value || competencia)
              }
              style={{ width: 170 }}
              aria-label="Competência"
            />
            {folha.length > 0 && (
              <Button
                variant="secondary"
                onClick={handleLimpar}
                disabled={limparFolha.isPending}
              >
                Limpar folha
              </Button>
            )}
            <Button
              size="lg"
              onClick={handleGerar}
              disabled={gerarFolha.isPending}
            >
              {gerarFolha.isPending ? 'Gerando...' : 'Gerar folha do mês'}
            </Button>
          </>
        }
      />

      {folhaQuery.isLoading ? (
        <Spinner label="Carregando folha..." />
      ) : folhaQuery.isError ? (
        <Card style={{ padding: 24 }}>
          <p className="text-danger">
            Erro ao carregar a folha. Tente novamente.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Local de custo</th>
                  <th>Salário</th>
                  <th>Vale (40%)</th>
                  <th>Proventos</th>
                  <th>Descontos</th>
                  <th>A pagar (5º dia útil)</th>
                  <th>Líquido</th>
                  <th>Lançamentos</th>
                </tr>
              </thead>
              <tbody>
                {folha.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="text-center text-muted"
                      style={{ padding: 'var(--sp-xl)' }}
                    >
                      Folha de {competencia} ainda não gerada — clique em "Gerar
                      folha do mês".
                    </td>
                  </tr>
                ) : (
                  folha.map((f) => (
                    <FolhaTableRow
                      key={f.id}
                      row={f}
                      local={nomeLocal(f, contracts)}
                      onPagar={(parcela) => setPagar({ row: f, parcela })}
                      onEstornar={(parcela) => handleEstornar(f, parcela)}
                      onLancamentos={() => setAcertosId(f.id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pagar && (
        <PagarModal
          row={pagar.row}
          parcela={pagar.parcela}
          onClose={() => setPagar(null)}
        />
      )}

      {acertosRow && (
        <AcertosModal
          competencia={competencia}
          folhaId={acertosRow.id}
          onClose={() => setAcertosId(null)}
        />
      )}
    </>
  );
}

interface FolhaTableRowProps {
  row: FolhaRow;
  local: string;
  onPagar: (parcela: FolhaParcela) => void;
  onEstornar: (parcela: FolhaParcela) => void;
  onLancamentos: () => void;
}

function FolhaTableRow({
  row,
  local,
  onPagar,
  onEstornar,
  onLancamentos,
}: FolhaTableRowProps) {
  const elegivel = row.elegivelVale && num(row.valorVale) > 0;
  const prov = somaItens(row.itens ?? [], 'provento');
  const desc = somaItens(row.itens ?? [], 'desconto');
  const liquido = num(row.valorVale) + num(row.valorSaldo);
  const itensCount = (row.itens ?? []).length;

  function acao(parcela: FolhaParcela, pago: boolean) {
    return pago ? (
      <a
        className="action-link danger"
        style={{ cursor: 'pointer' }}
        onClick={() => onEstornar(parcela)}
      >
        Estornar
      </a>
    ) : (
      <a
        className="action-link"
        style={{ cursor: 'pointer' }}
        onClick={() => onPagar(parcela)}
      >
        Pagar
      </a>
    );
  }

  return (
    <tr>
      <td>
        <strong>{row.recursoNome || '—'}</strong>
      </td>
      <td>{local}</td>
      <td>{formatBRL(num(row.salarioBase))}</td>
      <td>
        {elegivel ? (
          <span
            style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}
          >
            {formatBRL(num(row.valorVale))}
            <StatusBadge pago={row.valePago} />
            {acao('vale', row.valePago)}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td>
        {prov > 0 ? (
          <span style={{ color: '#065F46' }}>+{formatBRL(prov)}</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td>
        {desc > 0 ? (
          <span style={{ color: '#991B1B' }}>−{formatBRL(desc)}</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          {formatBRL(num(row.valorSaldo))}
          <StatusBadge pago={row.saldoPago} />
          {acao('saldo', row.saldoPago)}
        </span>
      </td>
      <td>
        <strong style={liquido < 0 ? { color: '#991B1B' } : undefined}>
          {formatBRL(liquido)}
        </strong>
      </td>
      <td>
        <a
          className="action-link"
          style={{ cursor: 'pointer' }}
          onClick={onLancamentos}
        >
          Lançamentos{itensCount ? ` (${itensCount})` : ''}
        </a>
      </td>
    </tr>
  );
}

interface PagarModalProps {
  row: FolhaRow;
  parcela: FolhaParcela;
  onClose: () => void;
}

/** Modal de confirmação de pagamento de uma parcela. */
function PagarModal({ row, parcela, onClose }: PagarModalProps) {
  const toast = useToast();
  const pagarParcela = usePagarParcela();

  const label = parcela === 'vale' ? 'Vale' : 'Saldo';
  const valor = parcela === 'vale' ? num(row.valorVale) : num(row.valorSaldo);

  const [dataPagamento, setDataPagamento] = useState(today);
  const [formaPagamento, setFormaPagamento] = useState('');

  function handleConfirmar() {
    pagarParcela.mutate(
      {
        id: row.id,
        parcela,
        dataPagamento: dataPagamento || today(),
        formaPagamento: formaPagamento || null,
      },
      {
        onSuccess: () => {
          toast.show(`${label} pago`, 'success');
          onClose();
        },
        onError: (error) =>
          toast.show(`Erro ao pagar: ${error.message}`, 'danger'),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{`Pagar ${label} — ${row.recursoNome}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p style={{ marginBottom: 'var(--sp-md)' }}>
            Valor: <strong>{formatBRL(valor)}</strong>
          </p>
          <FormField label="Data do pagamento" htmlFor="fp-data">
            <DatePicker
              id="fp-data"
              value={dataPagamento}
              onChange={(val) => setDataPagamento(val)}
            />
          </FormField>
          <FormField label="Forma de pagamento" htmlFor="fp-forma">
            <Select
              id="fp-forma"
              value={formaPagamento}
              onChange={(event) => setFormaPagamento(event.target.value)}
            >
              <option value="">— não informar —</option>
              <option value="PIX">PIX</option>
              <option value="Transferência">Transferência</option>
              <option value="Dinheiro">Dinheiro</option>
            </Select>
          </FormField>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={pagarParcela.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={pagarParcela.isPending}>
            {pagarParcela.isPending ? 'Pagando...' : 'Confirmar pagamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AcertosModalProps {
  competencia: string;
  folhaId: string;
  onClose: () => void;
}

/**
 * Modal de lançamentos (proventos e descontos) de um colaborador. Lê a linha
 * viva da query da folha, então reflete add/editar/remover sem props extras.
 */
function AcertosModal({ competencia, folhaId, onClose }: AcertosModalProps) {
  const toast = useToast();
  const folhaQuery = useFolha(competencia);
  const addItem = useAddFolhaItem();
  const removeItem = useRemoveFolhaItem();
  const updateItem = useUpdateFolhaItem();

  const [editId, setEditId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState('');
  const [presetKey, setPresetKey] = useState('');
  const [descricao, setDescricao] = useState('');
  const [qtd, setQtd] = useState('');
  const [valor, setValor] = useState('');

  const row = (folhaQuery.data ?? []).find((f) => f.id === folhaId) ?? null;
  if (!row) {
    return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Lançamentos</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <p className="text-muted">Registro não encontrado.</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const itens = row.itens ?? [];
  const proventos = itens.filter((it) => it.tipo === 'provento');
  const descontos = itens.filter((it) => it.tipo === 'desconto');
  const bloqueado = row.saldoPago;
  const salario = num(row.salarioBase);
  const temVale = row.elegivelVale && num(row.valorVale) > 0;
  const preset = presetKey ? findPreset(presetKey) : undefined;

  function resetForm() {
    setPresetKey('');
    setDescricao('');
    setQtd('');
    setValor('');
  }

  function handlePresetChange(key: string) {
    setPresetKey(key);
    setDescricao('');
    setQtd('');
    const p = findPreset(key);
    if (!p) {
      setValor('');
      return;
    }
    if (p.calc === 'sindical' || p.calc === 'inss') {
      const sugestao = presetSuggestion(p, salario, 0);
      setValor(sugestao != null ? sugestao.toFixed(2) : '');
    } else {
      setValor('');
    }
  }

  function handleQtdChange(value: string) {
    setQtd(value);
    if (!preset) return;
    if (
      preset.calc === 'hora' ||
      preset.calc === 'falta' ||
      preset.calc === 'atraso'
    ) {
      const sugestao = presetSuggestion(
        preset,
        salario,
        Number.parseFloat(value) || 0,
      );
      setValor(sugestao != null ? sugestao.toFixed(2) : '');
    }
  }

  function handleAdd() {
    if (!preset) {
      toast.show('Escolha um item da lista', 'danger');
      return;
    }
    const valorNum = round2(Number.parseFloat(valor) || 0);
    if (valorNum <= 0) {
      toast.show('Informe um valor maior que zero', 'danger');
      return;
    }
    const desc = presetDescricao(preset, Number.parseFloat(qtd) || 0, descricao);
    if (preset.calc === 'outro' && !desc) {
      toast.show('Informe a descrição do lançamento', 'danger');
      return;
    }
    addItem.mutate(
      { folhaId, tipo: preset.tipo, descricao: desc, valor: valorNum },
      {
        onSuccess: () => {
          toast.show(
            preset.tipo === 'provento' ? 'Provento lançado' : 'Desconto lançado',
            'success',
          );
          resetForm();
        },
        onError: (error) =>
          toast.show(`Erro ao lançar: ${error.message}`, 'danger'),
      },
    );
  }

  function handleRemove(itemId: string) {
    if (!window.confirm('Remover este lançamento?')) return;
    removeItem.mutate(
      { folhaId, itemId },
      {
        onSuccess: () => toast.show('Lançamento removido', 'success'),
        onError: (error) =>
          toast.show(`Erro ao remover: ${error.message}`, 'danger'),
      },
    );
  }

  function startEdit(item: FolhaItem) {
    setEditId(item.id);
    setEditValor(String(num(item.valor)));
  }

  function handleEditSave(itemId: string) {
    const valorNum = round2(Number.parseFloat(editValor) || 0);
    if (valorNum <= 0) {
      toast.show('Informe um valor maior que zero', 'danger');
      return;
    }
    updateItem.mutate(
      { folhaId, itemId, valor: valorNum },
      {
        onSuccess: () => {
          toast.show('Lançamento atualizado', 'success');
          setEditId(null);
        },
        onError: (error) =>
          toast.show(`Erro ao atualizar: ${error.message}`, 'danger'),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{`Lançamentos — ${row.recursoNome}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {bloqueado && (
            <p className="text-danger" style={{ marginBottom: 'var(--sp-md)' }}>
              Saldo já pago — estorne o saldo para editar os lançamentos.
            </p>
          )}

          <Secao titulo="Proventos" cor="#065F46">
            <AutoLine titulo="Salário base" valor={salario} sinal="+" cor="#065F46" />
            {proventos.map((it) => (
              <ItemLine
                key={it.id}
                item={it}
                sinal="+"
                cor="#065F46"
                editavel={!bloqueado}
                emEdicao={editId === it.id}
                editValor={editValor}
                onEditValorChange={setEditValor}
                onStartEdit={() => startEdit(it)}
                onCancelEdit={() => setEditId(null)}
                onSaveEdit={() => handleEditSave(it.id)}
                onRemove={() => handleRemove(it.id)}
              />
            ))}
          </Secao>

          <Secao titulo="Descontos" cor="#991B1B">
            {temVale && (
              <AutoLine
                titulo="Vale — adiantamento 40%"
                valor={num(row.valorVale)}
                sinal="−"
                cor="#991B1B"
                extra={<StatusBadge pago={row.valePago} />}
              />
            )}
            {descontos.length === 0 && !temVale ? (
              <p className="text-muted" style={{ padding: '6px 0' }}>
                Nenhum lançamento.
              </p>
            ) : (
              descontos.map((it) => (
                <ItemLine
                  key={it.id}
                  item={it}
                  sinal="−"
                  cor="#991B1B"
                  editavel={!bloqueado}
                  emEdicao={editId === it.id}
                  editValor={editValor}
                  onEditValorChange={setEditValor}
                  onStartEdit={() => startEdit(it)}
                  onCancelEdit={() => setEditId(null)}
                  onSaveEdit={() => handleEditSave(it.id)}
                  onRemove={() => handleRemove(it.id)}
                />
              ))
            )}
          </Secao>

          <div
            style={{
              marginTop: 'var(--sp-md)',
              paddingTop: 'var(--sp-md)',
              borderTop: '2px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span className="text-muted">Saldo a pagar (com lançamentos)</span>
            <strong
              style={num(row.valorSaldo) < 0 ? { color: '#991B1B' } : undefined}
            >
              {formatBRL(num(row.valorSaldo))}
            </strong>
          </div>

          {!bloqueado && (
            <div style={{ marginTop: 'var(--sp-lg)' }}>
              <h3 style={{ margin: '0 0 var(--sp-sm)', fontSize: 13 }}>
                Novo lançamento
              </h3>
              <FormField label="Item" htmlFor="ac-preset">
                <Select
                  id="ac-preset"
                  value={presetKey}
                  onChange={(event) => handlePresetChange(event.target.value)}
                >
                  <option value="">— escolha um item —</option>
                  <optgroup label="Proventos">
                    {PRESETS.filter((p) => p.tipo === 'provento').map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                        {p.calc === 'outro' ? '…' : ''}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Descontos">
                    {PRESETS.filter((p) => p.tipo === 'desconto').map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                        {p.calc === 'outro' ? '…' : ''}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </FormField>

              {preset?.calc === 'outro' && (
                <FormField label="Descrição" htmlFor="ac-desc">
                  <Input
                    id="ac-desc"
                    type="text"
                    maxLength={120}
                    value={descricao}
                    onChange={(event) => setDescricao(event.target.value)}
                    placeholder="Descreva o lançamento"
                  />
                </FormField>
              )}

              {preset &&
                (preset.calc === 'hora' ||
                  preset.calc === 'falta' ||
                  preset.calc === 'atraso') && (
                  <FormField label={qtdLabel(preset)} htmlFor="ac-qtd">
                    <Input
                      id="ac-qtd"
                      type="number"
                      step={preset.calc === 'hora' ? '0.5' : '1'}
                      min="0"
                      value={qtd}
                      onChange={(event) => handleQtdChange(event.target.value)}
                      placeholder="0"
                    />
                  </FormField>
                )}

              <FormField
                label="Valor (R$)"
                htmlFor="ac-valor"
                helper={preset ? hintFor(preset, salario) : undefined}
              >
                <Input
                  id="ac-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={valor}
                  onChange={(event) => setValor(event.target.value)}
                  placeholder="0,00"
                />
              </FormField>

              <Button
                onClick={handleAdd}
                disabled={addItem.isPending}
                style={{ width: '100%' }}
              >
                {addItem.isPending ? 'Lançando...' : 'Adicionar lançamento'}
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function qtdLabel(preset: FolhaPreset): string {
  if (preset.calc === 'hora') return 'Horas extras';
  if (preset.calc === 'falta') return 'Dias de falta';
  return 'Minutos de atraso';
}

function hintFor(preset: FolhaPreset, salario: number): string {
  switch (preset.calc) {
    case 'sindical':
      return '2% do salário, com teto de R$ 70,00.';
    case 'inss':
      return `INSS progressivo (tabela 2026) sobre ${formatBRL(
        salario,
      )}. Ajuste se necessário.`;
    case 'hora':
      return `(salário ÷ 220) × ${(preset.fator ?? 1)
        .toFixed(2)
        .replace('.', ',')} por hora.`;
    case 'falta':
      return 'Salário ÷ 30 por dia de falta.';
    case 'atraso':
      return 'Salário ÷ 220 ÷ 60 por minuto de atraso.';
    default:
      return '';
  }
}

function Secao({
  titulo,
  cor,
  children,
}: {
  titulo: string;
  cor: string;
  children: ReactNode;
}) {
  return (
    <>
      <h3 style={{ margin: 'var(--sp-md) 0 4px', fontSize: 13, color: cor }}>
        {titulo}
      </h3>
      {children}
    </>
  );
}

function AutoLine({
  titulo,
  valor,
  sinal,
  cor,
  extra,
}: {
  titulo: string;
  valor: number;
  sinal: string;
  cor: string;
  extra?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: '1px dashed var(--color-border)',
      }}
    >
      <span className="text-muted">
        {titulo}{' '}
        <em style={{ fontSize: 11 }}>· automático</em>
      </span>
      <span style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'center' }}>
        {extra}
        <strong style={{ color: cor }}>
          {sinal}
          {formatBRL(valor)}
        </strong>
      </span>
    </div>
  );
}

interface ItemLineProps {
  item: FolhaItem;
  sinal: string;
  cor: string;
  editavel: boolean;
  emEdicao: boolean;
  editValor: string;
  onEditValorChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRemove: () => void;
}

function ItemLine({
  item,
  sinal,
  cor,
  editavel,
  emEdicao,
  editValor,
  onEditValorChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: ItemLineProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <span>{item.descricao}</span>
      {emEdicao ? (
        <span style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={editValor}
            onChange={(event) => onEditValorChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSaveEdit();
              }
            }}
            style={{ width: 108, padding: '4px 8px' }}
            autoFocus
          />
          <a
            className="action-link"
            style={{ cursor: 'pointer' }}
            title="Salvar"
            onClick={onSaveEdit}
          >
            ✓
          </a>
          <a
            className="action-link danger"
            style={{ cursor: 'pointer' }}
            title="Cancelar"
            onClick={onCancelEdit}
          >
            ✕
          </a>
        </span>
      ) : (
        <span style={{ display: 'flex', gap: 'var(--sp-md)', alignItems: 'center' }}>
          <strong style={{ color: cor }}>
            {sinal}
            {formatBRL(num(item.valor))}
          </strong>
          {editavel && (
            <>
              <a
                className="action-link"
                style={{ cursor: 'pointer' }}
                title="Editar"
                onClick={onStartEdit}
              >
                ✎
              </a>
              <a
                className="action-link danger"
                style={{ cursor: 'pointer' }}
                title="Remover"
                onClick={onRemove}
              >
                ✕
              </a>
            </>
          )}
        </span>
      )}
    </div>
  );
}
