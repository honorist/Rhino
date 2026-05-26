import { useState } from 'react';
import Button from '../../components/ui/button';
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

import { DatePicker } from '../../components/ui/date-picker';
import { toast } from 'sonner';
import AddressAutocomplete from '../frota/AddressAutocomplete';
import { useClientes } from '../clientes/queries';
import type { Cliente } from '../clientes/types';
import { useCreateContract, useUpdateContract } from './queries';
import type { Contract, ContractStatus } from './types';

const STATUS_OPCOES: { value: ContractStatus; label: string }[] = [
  { value: 'prospeccao', label: 'Prospecção' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'cancelado', label: 'Cancelado' },
];

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

function clienteLabel(c: Cliente): string {
  return c.nome + (c.empresa ? ` · ${c.empresa}` : '');
}

interface ContratoModalProps {
  /** Contrato a editar, ou template (duplicação), ou null (novo). */
  contract: Contract | null;
  /** true = edição (PUT); false = criação (POST). */
  isEdit: boolean;
  onClose: () => void;
}

/** Modal de criação/edição de contrato. */
export default function ContratoModal({
  contract,
  isEdit,
  onClose,
}: ContratoModalProps) {
  const criar = useCreateContract();
  const editar = useUpdateContract();
  const clientesQuery = useClientes();
  const clientes = clientesQuery.data ?? [];

  const [contractNumber, setContractNumber] = useState(
    contract?.contractNumber ?? '',
  );
  const [status, setStatus] = useState<ContractStatus>(
    contract?.status ?? 'ativo',
  );
  const [name, setName] = useState(contract?.name ?? '');
  const [clienteId, setClienteId] = useState(contract?.clientId ?? '');
  const [clienteManual, setClienteManual] = useState(
    !contract?.clientId ? (contract?.client ?? '') : '',
  );
  const [usarManual, setUsarManual] = useState(
    Boolean(contract?.client) && !contract?.clientId,
  );
  const [clientDocument, setClientDocument] = useState(
    contract?.clientDocument ?? '',
  );
  const [clientEmail, setClientEmail] = useState(contract?.clientEmail ?? '');
  const [clientPhone, setClientPhone] = useState(contract?.clientPhone ?? '');
  const [endereco, setEndereco] = useState(contract?.endereco ?? '');
  const [lat, setLat] = useState(contract?.lat != null ? String(contract.lat) : '');
  const [lng, setLng] = useState(contract?.lng != null ? String(contract.lng) : '');
  const [value, setValue] = useState(String(contract?.value ?? ''));
  const [startDate, setStartDate] = useState(contract?.startDate ?? '');
  const [endDate, setEndDate] = useState(contract?.endDate ?? '');
  const [tendencyDate, setTendencyDate] = useState(contract?.tendencyDate ?? '');
  const [retencaoPercent, setRetencaoPercent] = useState(
    String(contract?.retencaoPercent ?? 0),
  );
  const [notes, setNotes] = useState(contract?.notes ?? '');

  // US-02: seed da numeração de RDO. Só editável se ainda não há RDOs.
  const meta = (contract?.metadata as Record<string, unknown> | undefined) ?? {};
  const [rdoSeed, setRdoSeed] = useState(String((meta.rdoSeed as number) ?? ''));
  const temRdos = Array.isArray(contract?.rdos) && contract!.rdos!.length > 0;

  const pending = criar.isPending || editar.isPending;

  function selecionarCliente(id: string) {
    if (id === '__outro__') {
      setUsarManual(true);
      return;
    }
    setUsarManual(false);
    setClienteId(id);
    const c = clientes.find((x) => x.id === id);
    if (c) {
      if (!clientEmail && c.email) setClientEmail(c.email);
      if (!clientPhone && c.telefone) setClientPhone(c.telefone);
      if (!endereco && c.endereco) setEndereco(c.endereco);
    }
  }

  function submit() {
    let client = '';
    let resolvedClientId: string | null = null;
    if (usarManual || clientes.length === 0) {
      client = clienteManual.trim();
    } else {
      const c = clientes.find((x) => x.id === clienteId);
      resolvedClientId = c?.id ?? null;
      client = c ? clienteLabel(c) : '';
    }
    if (!name.trim()) {
      toast.error('Nome do contrato é obrigatório');
      return;
    }
    if (!client) {
      toast.error('Selecione ou informe o cliente');
      return;
    }
    const input = {
      contractNumber: contractNumber.trim(),
      status,
      name: name.trim(),
      client,
      clientId: resolvedClientId,
      clientDocument: clientDocument.trim(),
      clientEmail: clientEmail.trim(),
      clientPhone: clientPhone.trim(),
      endereco: endereco.trim(),
      lat: lat || null,
      lng: lng || null,
      value: value ? Number(value) : 0,
      startDate,
      endDate,
      tendencyDate,
      retencaoPercent: Number(retencaoPercent) || 0,
      notes: notes.trim(),
      // US-02: mescla rdoSeed no metadata existente sem perder outros campos.
      metadata: {
        ...meta,
        ...(rdoSeed && Number(rdoSeed) > 0
          ? { rdoSeed: Number(rdoSeed) }
          : { rdoSeed: undefined }),
      },
    };
    const handlers = {
      onSuccess: () => {
        toast.success(
          isEdit ? 'Contrato atualizado' : 'Contrato criado'
);
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    };
    if (isEdit && contract) {
      editar.mutate({ id: contract.id, input }, handlers);
    } else {
      criar.mutate(input, handlers);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Contrato' : 'Novo Contrato'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <Row>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FormField label="Número do Contrato" htmlFor="ct-num">
                <Input
                  id="ct-num"
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FormField label="Status *" htmlFor="ct-status">
                <Select
                  id="ct-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ContractStatus)}
                >
                  {STATUS_OPCOES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </Row>
          <FormField label="Nome do Contrato *" htmlFor="ct-name">
            <Input
              id="ct-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <h3 className="text-[15px] font-semibold tracking-tight" style={{ marginTop: 'var(--sp-lg)' }}>
            Dados do Cliente
          </h3>
          <FormField label="Cliente *" htmlFor="ct-cliente">
            {clientes.length > 0 && !usarManual ? (
              <Select
                id="ct-cliente"
                value={clienteId ?? ''}
                onChange={(e) => selecionarCliente(e.target.value)}
              >
                <option value="">— Selecionar cliente —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clienteLabel(c)}
                  </option>
                ))}
                <option value="__outro__">✏️ Digitar manualmente...</option>
              </Select>
            ) : (
              <Input
                id="ct-cliente"
                value={clienteManual}
                onChange={(e) => setClienteManual(e.target.value)}
                placeholder="Nome do cliente ou empresa"
              />
            )}
          </FormField>
          <Row>
            <div style={{ flex: 1, minWidth: 150 }}>
              <FormField label="CPF/CNPJ" htmlFor="ct-doc">
                <Input
                  id="ct-doc"
                  value={clientDocument}
                  onChange={(e) => setClientDocument(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FormField label="Email" htmlFor="ct-email">
                <Input
                  id="ct-email"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                />
              </FormField>
            </div>
          </Row>
          <FormField label="Telefone" htmlFor="ct-tel">
            <Input
              id="ct-tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </FormField>
          <FormField label="Endereço / Local da Obra">
            <AddressAutocomplete
              value={endereco}
              onChange={setEndereco}
              onSelect={(sel) => {
                setEndereco(sel.endereco);
                setLat(sel.lat);
                setLng(sel.lng);
              }}
            />
          </FormField>

          <h3 className="text-[15px] font-semibold tracking-tight" style={{ marginTop: 'var(--sp-lg)' }}>
            Dados do Contrato
          </h3>
          <FormField label="Valor Total (BRL) *" htmlFor="ct-valor">
            <Input
              id="ct-valor"
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
            />
          </FormField>
          <Row>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Data Início" htmlFor="ct-ini">
                <DatePicker
                  id="ct-ini"
                  value={startDate}
                  onChange={(val) => setStartDate(val)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Data Fim" htmlFor="ct-fim">
                <DatePicker
                  id="ct-fim"
                  value={endDate}
                  onChange={(val) => setEndDate(val)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField
                label="Data de Tendência"
                htmlFor="ct-tend"
                helper="Previsão atualizada do fim da obra."
              >
                <DatePicker
                  id="ct-tend"
                  value={tendencyDate}
                  onChange={(val) => setTendencyDate(val)}
                />
              </FormField>
            </div>
          </Row>
          <FormField label="Retenção (%)" htmlFor="ct-ret">
            <Input
              id="ct-ret"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={retencaoPercent}
              onChange={(e) => setRetencaoPercent(e.target.value)}
            />
          </FormField>
          <FormField
            label="Nº inicial do RDO"
            htmlFor="ct-rdo-seed"
            helper={
              temRdos
                ? '🔒 Já há RDOs lançados neste contrato — a sequência foi fixada e não pode ser alterada.'
                : 'Use só na 1ª emissão de uma obra já em andamento. Deixe vazio para começar do 1. Ex.: 18 → próximo RDO será #18, e a sequência continua a partir dele.'
            }
          >
            <Input
              id="ct-rdo-seed"
              type="number"
              min={1}
              step={1}
              value={rdoSeed}
              onChange={(e) => setRdoSeed(e.target.value)}
              disabled={temRdos}
              placeholder="1"
            />
          </FormField>
          <FormField label="Notas / Observações" htmlFor="ct-notes">
            <Textarea
              id="ct-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Atualizar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
