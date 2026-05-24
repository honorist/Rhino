import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Select, Textarea } from '../../components/ui/controls';
import { useToast } from '../../components/ui/toast/ToastContext';
import { useContracts } from '../contracts/queries';
import { useCreateVeiculo, useUpdateVeiculo } from '../resources';
import type { Veiculo, VeiculoStatus } from '../../types/domain';
import AddressAutocomplete from './AddressAutocomplete';
import { formatarPlaca, normalizarPlaca, placaValida } from './placa';

const TIPOS = ['carro', 'caminhao', 'van', 'moto', 'equipamento', 'outro'];

/** Linha de campos lado a lado (porte de `.form-row`). */
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

interface VeiculoModalProps {
  veiculo: Veiculo | null;
  onClose: () => void;
}

/** Modal de criação/edição de veículo. */
export default function VeiculoModal({ veiculo, onClose }: VeiculoModalProps) {
  const toast = useToast();
  const criar = useCreateVeiculo();
  const editar = useUpdateVeiculo();
  const contractsQuery = useContracts();
  const isEdit = Boolean(veiculo);

  const [placa, setPlaca] = useState(formatarPlaca(veiculo?.placa ?? ''));
  const [tipo, setTipo] = useState(veiculo?.tipo ?? 'carro');
  const [marca, setMarca] = useState(veiculo?.marca ?? '');
  const [modelo, setModelo] = useState(veiculo?.modelo ?? '');
  const [ano, setAno] = useState(String(veiculo?.ano ?? ''));
  const [kmAtual, setKmAtual] = useState(String(veiculo?.kmAtual ?? 0));
  const [status, setStatus] = useState<VeiculoStatus>(
    veiculo?.status ?? 'ativo',
  );
  const [contractId, setContractId] = useState(veiculo?.contractId ?? '');
  const [endereco, setEndereco] = useState(veiculo?.endereco ?? '');
  const [lat, setLat] = useState(
    veiculo?.lat != null ? String(veiculo.lat) : '',
  );
  const [lng, setLng] = useState(
    veiculo?.lng != null ? String(veiculo.lng) : '',
  );
  const [observacoes, setObservacoes] = useState(veiculo?.observacoes ?? '');

  const contratos = contractsQuery.data ?? [];
  const pending = criar.isPending || editar.isPending;

  function submit() {
    const placaLimpa = normalizarPlaca(placa);
    if (!placaLimpa) {
      toast.show('Placa obrigatória', 'danger');
      return;
    }
    if (!placaValida(placaLimpa)) {
      toast.show(
        'Placa inválida — use ABC-1234 (antigo) ou ABC1D23 (Mercosul)',
        'danger',
      );
      return;
    }
    const input = {
      placa: placaLimpa,
      tipo,
      marca: marca.trim(),
      modelo: modelo.trim(),
      ano: ano ? Number(ano) : undefined,
      kmAtual: Number(kmAtual) || 0,
      status,
      contractId: contractId || null,
      endereco: endereco.trim(),
      lat: lat || null,
      lng: lng || null,
      observacoes: observacoes.trim(),
    };
    const handlers = {
      onSuccess: () => {
        toast.show(isEdit ? 'Veículo atualizado' : 'Veículo criado', 'success');
        onClose();
      },
      onError: (e: Error) => toast.show(e.message, 'danger'),
    };
    if (veiculo) editar.mutate({ id: veiculo.id, input }, handlers);
    else criar.mutate(input, handlers);
  }

  return (
    <Modal
      open
      title={isEdit ? 'Editar Veículo' : 'Novo Veículo'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar'}
          </Button>
        </>
      }
    >
      <Row>
        <div style={{ flex: 2, minWidth: 200 }}>
          <FormField label="Placa *" htmlFor="ve-placa">
            <Input
              id="ve-placa"
              value={placa}
              onChange={(e) => setPlaca(formatarPlaca(e.target.value))}
              maxLength={8}
              placeholder="ABC-1234 ou ABC1D23"
              style={{
                textTransform: 'uppercase',
                fontFamily: 'monospace',
                letterSpacing: 1,
              }}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <FormField label="Tipo" htmlFor="ve-tipo">
            <Select
              id="ve-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Row>
      <Row>
        <div style={{ flex: 1, minWidth: 120 }}>
          <FormField label="Marca" htmlFor="ve-marca">
            <Input
              id="ve-marca"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <FormField label="Modelo" htmlFor="ve-modelo">
            <Input
              id="ve-modelo"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 90 }}>
          <FormField label="Ano" htmlFor="ve-ano">
            <Input
              id="ve-ano"
              type="number"
              value={ano}
              onChange={(e) => setAno(e.target.value)}
            />
          </FormField>
        </div>
      </Row>
      <Row>
        <div style={{ flex: 1, minWidth: 120 }}>
          <FormField label="KM atual" htmlFor="ve-km">
            <Input
              id="ve-km"
              type="number"
              min={0}
              value={kmAtual}
              onChange={(e) => setKmAtual(e.target.value)}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="Status" htmlFor="ve-status">
            <Select
              id="ve-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as VeiculoStatus)}
            >
              <option value="ativo">Ativo</option>
              <option value="manutencao">Em manutenção</option>
              <option value="inativo">Inativo</option>
            </Select>
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <FormField label="Alocado em" htmlFor="ve-contrato">
            <Select
              id="ve-contrato"
              value={contractId ?? ''}
              onChange={(e) => setContractId(e.target.value)}
            >
              <option value="">— Pool (sem alocação) —</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.name ?? '')}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Row>
      <FormField label="Localização atual (endereço)">
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
      <FormField label="Observações" htmlFor="ve-obs">
        <Textarea
          id="ve-obs"
          rows={2}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </FormField>
    </Modal>
  );
}
