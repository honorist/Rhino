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
import { Combobox } from '../../components/ui/combobox';
import { toast } from 'sonner';
import { useContracts } from '../contracts/queries';
import { useCreateRecurso, useUpdateRecurso } from '../resources';
import AddressAutocomplete from '../frota/AddressAutocomplete';
import type { Recurso, RecursoStatus } from '../../types/domain';
import { normalizeCargo } from './proximaFolga';

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

function Secao({ titulo, cor }: { titulo: string; cor?: string }) {
  return (
    <h3
      style={{
        fontSize: 15,
        fontWeight: 700,
        color: cor ?? 'var(--color-text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        margin: 'var(--sp-lg) 0 var(--sp-md)',
        borderTop: '1px solid var(--color-border)',
        paddingTop: 'var(--sp-lg)',
      }}
    >
      {titulo}
    </h3>
  );
}

const MOTIVOS = [
  ['demissao_sem_justa_causa', 'Demissão sem justa causa'],
  ['demissao_justa_causa', 'Demissão com justa causa'],
  ['pedido_demissao', 'Pedido de demissão'],
  ['fim_contrato', 'Fim de contrato'],
  ['acordo', 'Acordo'],
  ['outro', 'Outro'],
] as const;

interface RecursoModalProps {
  recurso: Recurso | null;
  onClose: () => void;
}

/** Modal de cadastro/edição de colaborador. */
export default function RecursoModal({ recurso, onClose }: RecursoModalProps) {
  const criar = useCreateRecurso();
  const editar = useUpdateRecurso();
  const contractsQuery = useContracts();
  const isEdit = Boolean(recurso);

  const [nome, setNome] = useState(recurso?.nome ?? '');
  const [cpf, setCpf] = useState(recurso?.cpf ?? '');
  const [dataNascimento, setDataNascimento] = useState(
    recurso?.dataNascimento ?? '',
  );
  const [genero, setGenero] = useState(recurso?.genero ?? '');
  const [telefone, setTelefone] = useState(recurso?.telefone ?? '');
  const [email, setEmail] = useState(recurso?.email ?? '');
  const [endereco, setEndereco] = useState(recurso?.endereco ?? '');
  const [lat, setLat] = useState(recurso?.lat != null ? String(recurso.lat) : '');
  const [lng, setLng] = useState(recurso?.lng != null ? String(recurso.lng) : '');
  const [status, setStatus] = useState<RecursoStatus>(
    recurso?.status ?? 'candidato',
  );
  const [profissao, setProfissao] = useState(recurso?.profissao ?? '');
  const [rdoCategoria, setRdoCategoria] = useState(recurso?.rdoCategoria ?? '');
  const [dataAdmissao, setDataAdmissao] = useState(recurso?.dataAdmissao ?? '');
  const [salario, setSalario] = useState(String(recurso?.salario ?? ''));
  const [elegivelVale, setElegivelVale] = useState(
    Boolean(recurso?.elegivelVale),
  );
  const [cnh, setCnh] = useState(recurso?.cnh ?? '');
  const [pis, setPis] = useState(recurso?.pis ?? '');
  const [contractId, setContractId] = useState(
    recurso?.alocacaoAtual?.contractId ?? '',
  );
  const [dataInicio, setDataInicio] = useState(
    recurso?.alocacaoAtual?.dataInicio ?? '',
  );
  const [cicloTrabalho, setCicloTrabalho] = useState(
    String(recurso?.alocacaoAtual?.cicloTrabalho ?? 21),
  );
  const [cicloFolga, setCicloFolga] = useState(
    String(recurso?.alocacaoAtual?.cicloFolga ?? 7),
  );
  const [dataDesligamento, setDataDesligamento] = useState(
    recurso?.dataDesligamento ?? '',
  );
  const [motivoDesligamento, setMotivoDesligamento] = useState(
    recurso?.motivoDesligamento ?? '',
  );
  const [obsDesligamento, setObsDesligamento] = useState(
    recurso?.obsDesligamento ?? '',
  );
  const [notas, setNotas] = useState(recurso?.notas ?? '');

  const contratos = (contractsQuery.data ?? []).filter(
    (c) => c.status === 'ativo',
  );
  const pending = criar.isPending || editar.isPending;

  function submit() {
    if (!nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    const input: Partial<Recurso> = {
      nome: nome.trim(),
      cpf: cpf.trim(),
      dataNascimento,
      genero,
      telefone: telefone.trim(),
      email: email.trim(),
      endereco: endereco.trim(),
      lat: lat || null,
      lng: lng || null,
      status,
      profissao: normalizeCargo(profissao),
      rdoCategoria: rdoCategoria as Recurso['rdoCategoria'],
      dataAdmissao,
      salario: salario ? Number(salario) : undefined,
      elegivelVale,
      cnh,
      pis: pis.trim(),
      notas: notas.trim(),
      alocacaoAtual: contractId
        ? {
            contractId,
            dataInicio,
            cicloTrabalho: Number(cicloTrabalho) || 21,
            cicloFolga: Number(cicloFolga) || 7,
          }
        : null,
      dataDesligamento,
      motivoDesligamento,
      obsDesligamento,
      ...(recurso ? { folgas: recurso.folgas ?? [] } : {}),
    };
    const handlers = {
      onSuccess: () => {
        toast.success(isEdit ? 'Cadastro atualizado' : 'Cadastro criado');
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    };
    if (recurso) editar.mutate({ id: recurso.id, input }, handlers);
    else criar.mutate(input, handlers);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Cadastro' : 'Novo Cadastro'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <h3
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          marginBottom: 'var(--sp-md)',
        }}
      >
        Dados Pessoais
      </h3>
      <Row>
        <div style={{ flex: 2, minWidth: 200 }}>
          <FormField label="Nome completo *" htmlFor="rc-nome">
            <Input
              id="rc-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="CPF" htmlFor="rc-cpf">
            <Input
              id="rc-cpf"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
            />
          </FormField>
        </div>
      </Row>
      <Row>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="Data de Nascimento" htmlFor="rc-nasc">
            <DatePicker
              id="rc-nasc"
              value={dataNascimento}
              onChange={(val) => setDataNascimento(val)}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <FormField label="Gênero" htmlFor="rc-genero">
            <Select
              id="rc-genero"
              value={genero}
              onChange={(e) => setGenero(e.target.value)}
            >
              <option value="">—</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="outro">Outro</option>
            </Select>
          </FormField>
        </div>
      </Row>
      <Row>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="Telefone" htmlFor="rc-tel">
            <Input
              id="rc-tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <FormField label="Email" htmlFor="rc-email">
            <Input
              id="rc-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
        </div>
      </Row>
      <FormField label="Endereço (para calcular distâncias)">
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

      <Secao titulo="Dados Profissionais" />
      <Row>
        <div style={{ flex: 1, minWidth: 160 }}>
          <FormField label="Status *" htmlFor="rc-status">
            <Select
              id="rc-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as RecursoStatus)}
            >
              <option value="candidato">Candidato</option>
              <option value="funcionario">Funcionário Ativo</option>
              <option value="ex_funcionario">Ex-Funcionário</option>
            </Select>
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <FormField label="Profissão / Função" htmlFor="rc-prof">
            <Input
              id="rc-prof"
              value={profissao}
              onChange={(e) => setProfissao(e.target.value)}
              placeholder="Ex: Eletricista, Pedreiro"
            />
          </FormField>
        </div>
      </Row>
      <Row>
        <div style={{ flex: 1, minWidth: 180 }}>
          <FormField
            label="Categoria no RDO"
            htmlFor="rc-rdo"
            helper="Classifica o colaborador no RDO."
          >
            <Select
              id="rc-rdo"
              value={rdoCategoria}
              onChange={(e) =>
                setRdoCategoria(e.target.value as '' | 'moi' | 'mod')
              }
            >
              <option value="">— não definir —</option>
              <option value="moi">MOI — Mão de Obra Indireta</option>
              <option value="mod">MOD — Mão de Obra Direta</option>
            </Select>
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <FormField label="Data de Admissão" htmlFor="rc-adm">
            <DatePicker
              id="rc-adm"
              value={dataAdmissao}
              onChange={(val) => setDataAdmissao(val)}
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <FormField label="Salário (R$)" htmlFor="rc-sal">
            <Input
              id="rc-sal"
              type="number"
              step="0.01"
              value={salario}
              onChange={(e) => setSalario(e.target.value)}
            />
          </FormField>
        </div>
      </Row>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          marginBottom: 'var(--sp-md)',
        }}
      >
        <input
          type="checkbox"
          checked={elegivelVale}
          onChange={(e) => setElegivelVale(e.target.checked)}
        />
        Elegível a vale (adiantamento de 40% do salário)
      </label>
      <Row>
        <div style={{ flex: 1, minWidth: 120 }}>
          <FormField label="CNH" htmlFor="rc-cnh">
            <Select
              id="rc-cnh"
              value={cnh}
              onChange={(e) => setCnh(e.target.value)}
            >
              <option value="">Não possui</option>
              {['A', 'B', 'AB', 'C', 'D', 'E'].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="PIS/PASEP" htmlFor="rc-pis">
            <Input
              id="rc-pis"
              value={pis}
              onChange={(e) => setPis(e.target.value)}
            />
          </FormField>
        </div>
      </Row>

      {status === 'funcionario' && (
        <>
          <Secao titulo="Alocação de Campo" />
          <Row>
            <div style={{ flex: 1, minWidth: 180 }}>
              <FormField label="Obra atual" htmlFor="rc-obra">
                <Combobox
                  id="rc-obra"
                  options={contratos.map((c) => ({ value: c.id, label: String(c.name ?? '') }))}
                  value={contractId ?? ''}
                  onChange={setContractId}
                  placeholder="Sem alocação"
                  searchPlaceholder="Pesquisar obra..."
                  emptyText="Nenhuma obra encontrada."
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <FormField label="Início na obra" htmlFor="rc-ini">
                <DatePicker
                  id="rc-ini"
                  value={dataInicio}
                  onChange={(val) => setDataInicio(val)}
                />
              </FormField>
            </div>
          </Row>
          <Row>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Ciclo de trabalho (dias)" htmlFor="rc-ct">
                <Input
                  id="rc-ct"
                  type="number"
                  min={1}
                  value={cicloTrabalho}
                  onChange={(e) => setCicloTrabalho(e.target.value)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Dias de folga por ciclo" htmlFor="rc-cf">
                <Input
                  id="rc-cf"
                  type="number"
                  min={1}
                  value={cicloFolga}
                  onChange={(e) => setCicloFolga(e.target.value)}
                />
              </FormField>
            </div>
          </Row>
        </>
      )}

      {status === 'ex_funcionario' && (
        <>
          <Secao titulo="Desligamento" cor="#DC2626" />
          <Row>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Data de Desligamento" htmlFor="rc-dd">
                <DatePicker
                  id="rc-dd"
                  value={dataDesligamento}
                  onChange={(val) => setDataDesligamento(val)}
                />
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <FormField label="Motivo" htmlFor="rc-md">
                <Select
                  id="rc-md"
                  value={motivoDesligamento}
                  onChange={(e) => setMotivoDesligamento(e.target.value)}
                >
                  <option value="">—</option>
                  {MOTIVOS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </Row>
          <FormField label="Observações sobre o desligamento" htmlFor="rc-od">
            <Textarea
              id="rc-od"
              rows={2}
              value={obsDesligamento}
              onChange={(e) => setObsDesligamento(e.target.value)}
            />
          </FormField>
        </>
      )}

      <Secao titulo="Notas" />
      <FormField label="Notas / Observações" htmlFor="rc-notas">
        <Textarea
          id="rc-notas"
          rows={2}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
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
