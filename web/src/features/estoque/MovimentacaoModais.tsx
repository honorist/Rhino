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
import { Input, Select } from '../../components/ui/controls';
import { DatePicker } from '../../components/ui/date-picker';
import { Combobox } from '../../components/ui/combobox';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import { todayISO } from '../../lib/formatDate';
import { useContracts } from '../contracts/queries';
import { useFornecedores } from '../resources';
import type { Almoxarifado, EstoqueItem } from './types';
import { almoxCentral, almoxsObras, saldoEm } from './saldo';
import { useCriarMovimentacao, type MovimentacaoInput } from './queries';

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

/** Caixa de destaque com o nome do item. */
function ItemBox({
  item,
  cor,
  children,
}: {
  item: EstoqueItem;
  cor: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: `${cor}14`,
        borderLeft: `3px solid ${cor}`,
        borderRadius: 6,
        padding: '10px 14px',
        marginBottom: 'var(--sp-md)',
      }}
    >
      <strong>{item.descricao}</strong>
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        {children}
      </div>
    </div>
  );
}

interface MovModalProps {
  item: EstoqueItem;
  almoxs: Almoxarifado[];
  onClose: () => void;
}

// ── 🟢 Comprei / Recebi ───────────────────────────────────────────────────

export function ComprarModal({ item, almoxs, onClose }: MovModalProps) {
  const toast = useToast();
  const criar = useCriarMovimentacao();
  const fornecedoresQuery = useFornecedores();
  const central = almoxCentral(almoxs);

  const [quantidade, setQuantidade] = useState('');
  const [custoUnit, setCustoUnit] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [nfNumero, setNfNumero] = useState('');
  const [data, setData] = useState(todayISO());

  const total = (Number(quantidade) || 0) * (Number(custoUnit) || 0);

  function submit() {
    const qtd = Number(quantidade) || 0;
    if (qtd <= 0) {
      toast.show('Quantidade obrigatória', 'danger');
      return;
    }
    const documento =
      [fornecedor, nfNumero ? `NF ${nfNumero}` : '']
        .filter(Boolean)
        .join(' - ') || 'Compra/Recebimento';
    const input: MovimentacaoInput = {
      tipo: 'entrada',
      itemId: item.id,
      almoxarifadoDestinoId: 'auto-central',
      quantidade: qtd,
      custoUnit: Number(custoUnit) || 0,
      data,
      documento,
      notas: null,
    };
    criar.mutate(input, {
      onSuccess: () => {
        toast.show(`Entrada registrada no Central`, 'success');
        onClose();
      },
      onError: (e) => toast.show(e.message, 'danger'),
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>🟢 Comprei / Recebi</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <ItemBox item={item} cor="#10b981">
            Saldo Central atual:{' '}
            {(central ? saldoEm(item, central.id) : 0).toFixed(2)} {item.unidade}
          </ItemBox>
          <Row>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Quantidade *" htmlFor="cp-qtd">
                <Input
                  id="cp-qtd"
                  type="number"
                  step="0.001"
                  min={0}
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Custo unitário (R$)" htmlFor="cp-custo">
                <Input
                  id="cp-custo"
                  type="number"
                  step="0.01"
                  min={0}
                  value={custoUnit}
                  onChange={(e) => setCustoUnit(e.target.value)}
                  placeholder="0,00"
                />
              </FormField>
            </div>
          </Row>
          <FormField label="Custo total">
            <div
              style={{
                padding: '8px 12px',
                background: 'var(--color-surface-2)',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              {formatBRL(total)}
            </div>
          </FormField>
          <Row>
            <div style={{ flex: 1, minWidth: 150 }}>
              <FormField label="Fornecedor" htmlFor="cp-forn">
                <Input
                  id="cp-forn"
                  list="estoque-fornecedores"
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                  placeholder="Nome ou selecione..."
                />
                <datalist id="estoque-fornecedores">
                  {(fornecedoresQuery.data ?? []).map((f) => (
                    <option key={f.id} value={String(f.nome ?? '')} />
                  ))}
                </datalist>
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Nº Nota Fiscal" htmlFor="cp-nf">
                <Input
                  id="cp-nf"
                  value={nfNumero}
                  onChange={(e) => setNfNumero(e.target.value)}
                />
              </FormField>
            </div>
          </Row>
          <FormField label="Data" htmlFor="cp-data">
            <DatePicker
              id="cp-data"
              value={data}
              onChange={(val) => setData(val)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={criar.isPending}>
            Confirmar entrada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 🔵 Enviar para obra ───────────────────────────────────────────────────

export function EnviarObraModal({ item, almoxs, onClose }: MovModalProps) {
  const toast = useToast();
  const criar = useCriarMovimentacao();
  const contractsQuery = useContracts();
  const central = almoxCentral(almoxs);
  const saldoCentral = central ? saldoEm(item, central.id) : 0;
  const contratos = (contractsQuery.data ?? []).filter(
    (c) => c.status === 'ativo' || c.status === 'pausado',
  );

  const [quantidade, setQuantidade] = useState('');
  const [contractId, setContractId] = useState(contratos[0]?.id ?? '');
  const [data, setData] = useState(todayISO());
  const [quemRetirou, setQuemRetirou] = useState('');

  function submit() {
    const qtd = Number(quantidade) || 0;
    if (qtd <= 0) {
      toast.show('Quantidade obrigatória', 'danger');
      return;
    }
    if (qtd > saldoCentral) {
      toast.show(`Saldo insuficiente (máx ${saldoCentral.toFixed(2)})`, 'danger');
      return;
    }
    if (!contractId) {
      toast.show('Escolha a obra', 'danger');
      return;
    }
    criar.mutate(
      {
        tipo: 'transferencia',
        itemId: item.id,
        almoxarifadoOrigemId: central?.id,
        almoxarifadoDestinoId: `auto-obra:${contractId}`,
        quantidade: qtd,
        data,
        documento: 'Envio pra obra',
        notas: quemRetirou ? `Retirou: ${quemRetirou}` : null,
      },
      {
        onSuccess: () => {
          toast.show('Material enviado para a obra', 'success');
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
          <DialogTitle>🔵 Enviar para obra</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <ItemBox item={item} cor="#3b82f6">
            Disponível no Central:{' '}
            <strong>
              {saldoCentral.toFixed(2)} {item.unidade}
            </strong>
          </ItemBox>
          <FormField label="Quantidade a enviar *" htmlFor="en-qtd">
            <Input
              id="en-qtd"
              type="number"
              step="0.001"
              min={0}
              max={saldoCentral}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </FormField>
          <FormField label="Para qual obra? *" htmlFor="en-obra">
            <Combobox
              id="en-obra"
              options={contratos.map((c) => ({ value: c.id, label: String(c.name ?? '') }))}
              value={contractId}
              onChange={setContractId}
              placeholder="— Selecione a obra —"
              searchPlaceholder="Pesquisar obra..."
              emptyText="Nenhuma obra encontrada."
            />
          </FormField>
          <Row>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Data" htmlFor="en-data">
                <DatePicker
                  id="en-data"
                  value={data}
                  onChange={(val) => setData(val)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <FormField label="Quem retirou (opcional)" htmlFor="en-quem">
                <Input
                  id="en-quem"
                  value={quemRetirou}
                  onChange={(e) => setQuemRetirou(e.target.value)}
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
            Confirmar envio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 🔴 Usei na obra ───────────────────────────────────────────────────────

interface ObraSaldo {
  almoxId: string;
  contractId: string;
  name: string;
  saldo: number;
}

export function UseiObraModal({ item, almoxs, onClose }: MovModalProps) {
  const toast = useToast();
  const criar = useCriarMovimentacao();

  const obras: ObraSaldo[] = almoxsObras(almoxs)
    .map((a) => ({
      almoxId: a.id,
      contractId: a.contractId ?? '',
      name: a.contractName || a.nome,
      saldo: saldoEm(item, a.id),
    }))
    .filter((o) => o.saldo > 0);

  const [obraIdx, setObraIdx] = useState(0);
  const [quantidade, setQuantidade] = useState('');
  const [atividade, setAtividade] = useState('');
  const [data, setData] = useState(todayISO());

  const obra = obras[obraIdx];
  const custoLancado =
    (Number(quantidade) || 0) * (Number(item.custoMedio) || 0);

  function submit() {
    const qtd = Number(quantidade) || 0;
    if (qtd <= 0) {
      toast.show('Quantidade obrigatória', 'danger');
      return;
    }
    if (!obra) {
      toast.show('Escolha a obra', 'danger');
      return;
    }
    if (qtd > obra.saldo) {
      toast.show(
        `Saldo insuficiente nessa obra (máx ${obra.saldo.toFixed(2)})`,
        'danger',
      );
      return;
    }
    criar.mutate(
      {
        tipo: 'saida',
        itemId: item.id,
        almoxarifadoOrigemId: obra.almoxId,
        quantidade: qtd,
        data,
        contractId: obra.contractId,
        documento: 'Consumo em obra',
        notas: atividade || null,
      },
      {
        onSuccess: () => {
          toast.show('Consumo registrado na obra', 'success');
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
          <DialogTitle>🔴 Usei na obra</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <ItemBox item={item} cor="#dc2626">
            Custo médio: {formatBRL(Number(item.custoMedio) || 0)}/un
          </ItemBox>
          <FormField label="De qual obra? *" htmlFor="us-obra">
            <Select
              id="us-obra"
              value={obraIdx}
              onChange={(e) => setObraIdx(Number(e.target.value))}
            >
              {obras.map((o, i) => (
                <option key={o.almoxId} value={i}>
                  🏗️ {o.name} — disponível {o.saldo.toFixed(2)} {item.unidade}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Quantidade usada *"
            htmlFor="us-qtd"
            helper={`Custo a lançar na obra: ${formatBRL(custoLancado)}`}
          >
            <Input
              id="us-qtd"
              type="number"
              step="0.001"
              min={0}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </FormField>
          <Row>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FormField label="Atividade / serviço" htmlFor="us-ativ">
                <Input
                  id="us-ativ"
                  value={atividade}
                  onChange={(e) => setAtividade(e.target.value)}
                  placeholder="Ex: Montagem painel elétrico"
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Data" htmlFor="us-data">
                <DatePicker
                  id="us-data"
                  value={data}
                  onChange={(val) => setData(val)}
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
            Confirmar consumo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 🟡 Voltou da obra ─────────────────────────────────────────────────────

export function VoltouObraModal({ item, almoxs, onClose }: MovModalProps) {
  const toast = useToast();
  const criar = useCriarMovimentacao();
  const central = almoxCentral(almoxs);

  const obras = almoxsObras(almoxs)
    .map((a) => ({
      almoxId: a.id,
      name: a.contractName || a.nome,
      saldo: saldoEm(item, a.id),
    }))
    .filter((o) => o.saldo > 0);

  const [obraIdx, setObraIdx] = useState(0);
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(todayISO());
  const [motivo, setMotivo] = useState('');
  const obra = obras[obraIdx];

  function submit() {
    const qtd = Number(quantidade) || 0;
    if (qtd <= 0) {
      toast.show('Quantidade obrigatória', 'danger');
      return;
    }
    if (!obra) {
      toast.show('Escolha a obra', 'danger');
      return;
    }
    if (qtd > obra.saldo) {
      toast.show(`Saldo insuficiente (máx ${obra.saldo.toFixed(2)})`, 'danger');
      return;
    }
    criar.mutate(
      {
        tipo: 'transferencia',
        itemId: item.id,
        almoxarifadoOrigemId: obra.almoxId,
        almoxarifadoDestinoId: central?.id,
        quantidade: qtd,
        data,
        documento: 'Retorno da obra',
        notas: motivo || null,
      },
      {
        onSuccess: () => {
          toast.show('Retorno registrado no Central', 'success');
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
          <DialogTitle>🟡 Voltou da obra</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <ItemBox item={item} cor="#f59e0b">
            Esta ação devolve mercadoria da obra para o Central.
          </ItemBox>
          <FormField label="Voltou de qual obra? *" htmlFor="vt-obra">
            <Select
              id="vt-obra"
              value={obraIdx}
              onChange={(e) => setObraIdx(Number(e.target.value))}
            >
              {obras.map((o, i) => (
                <option key={o.almoxId} value={i}>
                  🏗️ {o.name} — disponível {o.saldo.toFixed(2)} {item.unidade}
                </option>
              ))}
            </Select>
          </FormField>
          <Row>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Quantidade *" htmlFor="vt-qtd">
                <Input
                  id="vt-qtd"
                  type="number"
                  step="0.001"
                  min={0}
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Data" htmlFor="vt-data">
                <DatePicker
                  id="vt-data"
                  value={data}
                  onChange={(val) => setData(val)}
                />
              </FormField>
            </div>
          </Row>
          <FormField label="Motivo (opcional)" htmlFor="vt-motivo">
            <Input
              id="vt-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Sobra de obra concluída"
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={criar.isPending}>
            Confirmar retorno
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 🟠 Ajuste de saldo ────────────────────────────────────────────────────

export function AjusteModal({ item, almoxs, onClose }: MovModalProps) {
  const toast = useToast();
  const criar = useCriarMovimentacao();

  const [almoxId, setAlmoxId] = useState(almoxs[0]?.id ?? '');
  const [sinal, setSinal] = useState<'+' | '-'>('+');
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [data, setData] = useState(todayISO());

  function submit() {
    const qtd = Number(quantidade) || 0;
    if (qtd <= 0) {
      toast.show('Quantidade obrigatória', 'danger');
      return;
    }
    if (!motivo.trim()) {
      toast.show('Motivo obrigatório', 'danger');
      return;
    }
    criar.mutate(
      {
        tipo: 'ajuste',
        itemId: item.id,
        almoxarifadoDestinoId: almoxId,
        quantidade: qtd,
        sinal,
        data,
        documento: 'Ajuste manual',
        notas: motivo.trim(),
      },
      {
        onSuccess: () => {
          toast.show('Ajuste aplicado', 'success');
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
          <DialogTitle>🟠 Corrigir saldo (ajuste)</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div
            style={{
              background: 'rgba(245,158,11,.08)',
              borderLeft: '3px solid #f59e0b',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 'var(--sp-md)',
              fontSize: 13,
            }}
          >
            <strong>⚠️ Use só para correções</strong> — contagem física, perda,
            quebra. Movimentações normais use os botões verde/azul/vermelho.
          </div>
          <FormField label="Item">
            <Input value={item.descricao} disabled />
          </FormField>
          <FormField label="Em qual almoxarifado? *" htmlFor="aj-almox">
            <Select
              id="aj-almox"
              value={almoxId}
              onChange={(e) => setAlmoxId(e.target.value)}
            >
              {almoxs.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.contractId ? '🏗️' : '🏠'} {a.contractName || a.nome} (saldo:{' '}
                  {saldoEm(item, a.id).toFixed(2)})
                </option>
              ))}
            </Select>
          </FormField>
          <Row>
            <div style={{ flex: 1, minWidth: 180 }}>
              <FormField label="Sinal" htmlFor="aj-sinal">
                <Select
                  id="aj-sinal"
                  value={sinal}
                  onChange={(e) => setSinal(e.target.value as '+' | '-')}
                >
                  <option value="+">+ (encontrou / contagem maior)</option>
                  <option value="-">− (perda / quebra / contagem menor)</option>
                </Select>
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Quantidade *" htmlFor="aj-qtd">
                <Input
                  id="aj-qtd"
                  type="number"
                  step="0.001"
                  min={0}
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
              </FormField>
            </div>
          </Row>
          <FormField label="Motivo *" htmlFor="aj-motivo">
            <Input
              id="aj-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Inventário 04/2026 — perda por quebra"
            />
          </FormField>
          <FormField label="Data" htmlFor="aj-data">
            <DatePicker
              id="aj-data"
              value={data}
              onChange={(val) => setData(val)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={criar.isPending}>
            Aplicar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
