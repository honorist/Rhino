import type { ReactNode } from 'react';
import { Input, Select, Textarea } from '../../../components/ui/controls';
import { DatePicker } from '../../../components/ui/date-picker';
import Card from '../../../components/ui/Card';
import { useClientes } from '../../clientes/queries';
import type { Cliente } from '../../clientes/types';
import type { EditorTabProps } from '../types';

const SAUDACAO_PADRAO =
  'Em atendimento à solicitação de fornecimento, a Rhino Manutenções ' +
  'apresenta a seguinte proposta comercial para sua apreciação.';

/** Campo do grid de Dados Gerais (label + controle). */
function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`form-group prop-fg${full ? ' full' : ''}`}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

function clienteLabel(c: Cliente): string {
  const base = c.empresa || c.nome;
  return c.nome && c.empresa && c.nome !== c.empresa
    ? `${base} (${c.nome})`
    : base;
}

/** Aba Dados Gerais — cliente, identificação, abertura e encerramento. */
export default function DadosGeraisTab({ proposta, onChange }: EditorTabProps) {
  const clientesQuery = useClientes();
  const clientes = clientesQuery.data ?? [];

  function handleClienteSelect(id: string) {
    if (!id) {
      onChange({ clienteId: undefined });
      return;
    }
    const c = clientes.find((x) => x.id === id);
    if (!c) return;
    onChange({
      clienteId: id,
      clienteNome: c.nome || undefined,
      clienteEmpresa: c.empresa || c.nome || undefined,
      clienteContato: c.nome || undefined,
      clienteCargo: c.cargo || undefined,
      clienteEmail: c.email || undefined,
      clienteTelefone: c.telefone || undefined,
      clienteEndereco: c.endereco || undefined,
    });
  }

  return (
    <Card className="prop-dados-card">
      <h3 className="prop-section-title">Identificação do Cliente</h3>
      <div className="prop-grid prop-grid-2">
        <Field label="Cliente cadastrado" full>
          <Select
            value={proposta.clienteId ?? ''}
            onChange={(e) => handleClienteSelect(e.target.value)}
          >
            <option value="">
              — Sem cliente vinculado (preenchimento manual) —
            </option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {clienteLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Empresa (Razão social)">
          <Input
            value={proposta.clienteEmpresa ?? ''}
            onChange={(e) => onChange({ clienteEmpresa: e.target.value })}
          />
        </Field>
        <Field label="CNPJ">
          <Input
            value={proposta.clienteDocumento ?? ''}
            onChange={(e) => onChange({ clienteDocumento: e.target.value })}
          />
        </Field>
        <Field label="Att.: (Contato)">
          <Input
            value={proposta.clienteContato ?? ''}
            onChange={(e) => onChange({ clienteContato: e.target.value })}
            placeholder="Ex: Engº João da Silva"
          />
        </Field>
        <Field label="Cargo">
          <Input
            value={proposta.clienteCargo ?? ''}
            onChange={(e) => onChange({ clienteCargo: e.target.value })}
            placeholder="Ex: Coordenador de Manutenção"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={proposta.clienteEmail ?? ''}
            onChange={(e) => onChange({ clienteEmail: e.target.value })}
          />
        </Field>
        <Field label="Telefone">
          <Input
            value={proposta.clienteTelefone ?? ''}
            onChange={(e) => onChange({ clienteTelefone: e.target.value })}
          />
        </Field>
        <Field label="Endereço da obra" full>
          <Input
            value={proposta.clienteEndereco ?? ''}
            onChange={(e) => onChange({ clienteEndereco: e.target.value })}
          />
        </Field>
      </div>

      <h3 className="prop-section-title">Identificação da Proposta</h3>
      <div className="prop-grid prop-grid-2">
        <Field label="Título do serviço *" full>
          <Input
            value={proposta.titulo ?? ''}
            onChange={(e) => onChange({ titulo: e.target.value })}
            required
          />
        </Field>
        <Field label="Ref.: (Identificação da obra)" full>
          <Input
            value={proposta.referencia ?? ''}
            onChange={(e) => onChange({ referencia: e.target.value })}
            placeholder="Ex: Tanque T-401 — Linha L-202"
          />
        </Field>
        <Field label="Tipo">
          <Select
            value={proposta.tipo ?? 'ambos'}
            onChange={(e) =>
              onChange({ tipo: e.target.value as typeof proposta.tipo })
            }
          >
            <option value="hh">Mão de Obra (HH)</option>
            <option value="material">Material</option>
            <option value="ambos">HH + Material</option>
          </Select>
        </Field>
        <Field label="Data de emissão">
          <DatePicker
            value={proposta.dataEmissao ?? ''}
            onChange={(val) => onChange({ dataEmissao: val })}
          />
        </Field>
        <Field label="Validade (dias)">
          <Input
            type="number"
            min={1}
            max={365}
            value={proposta.validadeDias ?? 15}
            onChange={(e) =>
              onChange({ validadeDias: Number(e.target.value) || 15 })
            }
          />
        </Field>
        <Field label="Garantia (meses)">
          <Input
            type="number"
            min={0}
            max={60}
            value={proposta.garantiaMeses ?? ''}
            onChange={(e) =>
              onChange({
                garantiaMeses:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
            placeholder="vazio = sem"
          />
        </Field>
      </div>

      <h3 className="prop-section-title">Texto de Abertura</h3>
      <div className="form-group prop-fg" style={{ marginBottom: 10 }}>
        <label className="form-label">Objetivo</label>
        <Textarea
          rows={3}
          value={proposta.objetivo ?? ''}
          onChange={(e) => onChange({ objetivo: e.target.value })}
          placeholder="Descrição do que a proposta visa atender..."
        />
      </div>
      <div className="form-group prop-fg" style={{ marginBottom: 10 }}>
        <label className="form-label">Saudação (parágrafo de abertura)</label>
        <Textarea
          rows={2}
          value={proposta.saudacao ?? SAUDACAO_PADRAO}
          onChange={(e) => onChange({ saudacao: e.target.value })}
        />
      </div>

      <h3 className="prop-section-title">Encerramento</h3>
      <div className="prop-grid prop-grid-2">
        <Field label="Signatário">
          <Input
            value={proposta.signatario ?? 'Deyvison Veloso'}
            onChange={(e) => onChange({ signatario: e.target.value })}
          />
        </Field>
        <Field label="Cargo">
          <Input
            value={proposta.signatarioCargo ?? 'Diretor'}
            onChange={(e) => onChange({ signatarioCargo: e.target.value })}
          />
        </Field>
        <Field label="Observações finais (opcional)" full>
          <Textarea
            rows={2}
            value={proposta.observacoes ?? ''}
            onChange={(e) => onChange({ observacoes: e.target.value })}
          />
        </Field>
      </div>
    </Card>
  );
}
