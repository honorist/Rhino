import Button from '../../../components/ui/button';
import Card from '../../../components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/native-select';
import { toast } from 'sonner';
import { formatBRL } from '../../../lib/format';
import type { Proposta } from '../../../types/domain';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAtualizarCusto,
  useCriarCusto,
  useDeletarCusto,
  type CustoInput,
} from '../queries';
import type { CustoCategoria, CustoItem, EditorTabProps } from '../types';

interface CategoriaMeta {
  value: CustoCategoria;
  label: string;
  cor: string;
}

const CATEGORIAS: CategoriaMeta[] = [
  { value: 'mao_obra', label: 'Mão de Obra', cor: '#3b82f6' },
  { value: 'material', label: 'Material', cor: '#10b981' },
  { value: 'equipamento', label: 'Equipamento', cor: '#f59e0b' },
  { value: 'frete', label: 'Frete', cor: '#8b5cf6' },
  { value: 'impostos', label: 'Impostos', cor: '#dc2626' },
  { value: 'bdi', label: 'BDI', cor: '#06b6d4' },
  { value: 'lucro', label: 'Lucro', cor: '#84cc16' },
  { value: 'outros', label: 'Outros', cor: '#64748b' },
];

const categoriaMeta = (cat: string): CategoriaMeta =>
  CATEGORIAS.find((c) => c.value === cat) ?? {
    value: 'outros',
    label: cat,
    cor: '#64748b',
  };

/** Extrai a lista de custos da proposta devolvida por um endpoint de custo. */
function extrairCustos(proposta: Proposta): CustoItem[] {
  return Array.isArray(proposta.custos)
    ? (proposta.custos as CustoItem[])
    : [];
}

/**
 * Aba Custo Interno (privada) — análise de margem. Os custos são persistidos
 * por endpoints próprios (`/custos`), não pelo autosave da proposta.
 */
export default function CustoInternoTab({
  proposta,
  onLocalUpdate,
}: EditorTabProps) {
  const criar = useCriarCusto();
  const atualizar = useAtualizarCusto();
  const deletar = useDeletarCusto();

  const custos = proposta.custos;
  const totalCusto = custos.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const valorTotal = Number(proposta.valorTotal) || 0;
  const margem = valorTotal - totalCusto;
  const margemPct = valorTotal > 0 ? (margem / valorTotal) * 100 : 0;

  const porCategoria = custos.reduce<Record<string, number>>((acc, c) => {
    acc[c.categoria] = (acc[c.categoria] ?? 0) + (Number(c.valor) || 0);
    return acc;
  }, {});

  const propostaId = proposta.id;
  const reportErro = (e: unknown) =>
    toast.error(
      `Erro: ${e instanceof Error ? e.message : 'falha na operação'}`
);

  function adicionar() {
    criar.mutate(
      { propostaId, input: { categoria: 'mao_obra', descricao: '', valor: 0 } },
      {
        onSuccess: (r) => onLocalUpdate({ custos: extrairCustos(r.proposta) }),
        onError: reportErro,
      },
    );
  }

  function persistir(custoId: string, input: CustoInput) {
    atualizar.mutate(
      { propostaId, custoId, input },
      {
        onSuccess: (r) => onLocalUpdate({ custos: extrairCustos(r.proposta) }),
        onError: reportErro,
      },
    );
  }

  /** Atualiza o estado local imediatamente (input responsivo). */
  function editarLocal(custoId: string, patch: Partial<CustoItem>) {
    onLocalUpdate({
      custos: custos.map((c) => (c.id === custoId ? { ...c, ...patch } : c)),
    });
  }

  function remover(custoId: string) {
    if (!window.confirm('Remover este item de custo?')) return;
    deletar.mutate(
      { propostaId, custoId },
      {
        onSuccess: (r) => onLocalUpdate({ custos: extrairCustos(r.proposta) }),
        onError: reportErro,
      },
    );
  }

  return (
    <Card style={{ padding: 24 }}>
      <div
        style={{
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 24 }}>🔒</span>
        <div style={{ flex: 1, fontSize: 13, color: '#78350f' }}>
          <strong>Dados confidenciais.</strong> Esta aba é PRIVADA — não aparece
          no DOCX/PDF/Preview enviado ao cliente nem no Portal do Cliente.
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Card style={{ padding: 16, background: '#f8fafc' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            VALOR DA PROPOSTA
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#1F497D',
              marginTop: 4,
            }}
          >
            {formatBRL(valorTotal)}
          </div>
        </Card>
        <Card style={{ padding: 16, background: '#f8fafc' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>CUSTO TOTAL</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#dc2626',
              marginTop: 4,
            }}
          >
            {formatBRL(totalCusto)}
          </div>
        </Card>
        <Card
          style={{
            padding: 16,
            background: margem >= 0 ? '#f0fdf4' : '#fef2f2',
          }}
        >
          <div style={{ fontSize: 12, color: '#64748b' }}>MARGEM</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: margem >= 0 ? '#10b981' : '#dc2626',
              marginTop: 4,
            }}
          >
            {formatBRL(margem)}
          </div>
          <div
            style={{ fontSize: 13, color: margem >= 0 ? '#059669' : '#b91c1c' }}
          >
            {margemPct.toFixed(2)}%
          </div>
        </Card>
      </div>

      {Object.keys(porCategoria).length > 0 && (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 16,
            marginBottom: 20,
            background: '#f8fafc',
          }}
        >
          <h4 style={{ margin: '0 0 12px', color: '#1F497D', fontSize: 14 }}>
            Composição por Categoria
          </h4>
          {Object.entries(porCategoria).map(([cat, val]) => {
            const meta = categoriaMeta(cat);
            const pct = totalCusto > 0 ? (val / totalCusto) * 100 : 0;
            return (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    marginBottom: 2,
                  }}
                >
                  <span>{meta.label}</span>
                  <span>
                    <strong>{formatBRL(val)}</strong> ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: '#e2e8f0',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: meta.cor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, color: '#1F497D' }}>Itens de Custo</h3>
        <Button variant="secondary" onClick={adicionar} disabled={criar.isPending}>
          + Adicionar Item
        </Button>
      </div>

      <div className="table-wrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead style={{ width: 160 }}>Valor (R$)</TableHead>
              <TableHead style={{ width: 120 }}>Percentual</TableHead>
              <TableHead style={{ width: 60 }}>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {custos.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}
                >
                  Nenhum item de custo. Adicione para calcular margem.
                </TableCell>
              </TableRow>
            ) : (
              custos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Select
                      value={c.categoria}
                      onChange={(e) => {
                        const categoria = e.target.value as CustoCategoria;
                        editarLocal(c.id, { categoria });
                        persistir(c.id, { categoria });
                      }}
                    >
                      {CATEGORIAS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={c.descricao}
                      onChange={(e) =>
                        editarLocal(c.id, { descricao: e.target.value })
                      }
                      onBlur={(e) =>
                        persistir(c.id, { descricao: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={c.valor}
                      onChange={(e) =>
                        editarLocal(c.id, {
                          valor: Number(e.target.value) || 0,
                        })
                      }
                      onBlur={(e) =>
                        persistir(c.id, { valor: Number(e.target.value) || 0 })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={c.percentual ?? ''}
                      placeholder="opcional"
                      onChange={(e) =>
                        editarLocal(c.id, {
                          percentual:
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      onBlur={(e) =>
                        persistir(c.id, {
                          percentual:
                            e.target.value === ''
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => remover(c.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: 18,
                      }}
                    >
                      ×
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
