import Button from '../../../components/ui/button';
import Card from '../../../components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatBRL } from '../../../lib/format';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  localUid,
  type EditorTabProps,
  type LinhaHH,
  type LinhaMaterial,
} from '../types';

const TIPO_LABEL: Record<string, string> = {
  hh: 'Mão de Obra (HH)',
  material: 'Material',
  ambos: 'HH + Material',
};

const totalHH = (l: LinhaHH): number =>
  (Number(l.qtd) || 0) * (Number(l.horas) || 0) * (Number(l.valorHora) || 0);
const totalMat = (l: LinhaMaterial): number =>
  (Number(l.qtd) || 0) * (Number(l.valorUnit) || 0);

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Aba Investimento — tabelas de HH e/ou Material conforme o tipo da proposta. */
export default function InvestimentoTab({ proposta, onChange }: EditorTabProps) {
  const tipo = proposta.tipo ?? 'ambos';
  const hh = proposta.investimentoHh;
  const mat = proposta.investimentoMat;

  const subtotalHH = hh.reduce((s, l) => s + totalHH(l), 0);
  const subtotalMat = mat.reduce((s, l) => s + totalMat(l), 0);
  const total =
    tipo === 'hh'
      ? subtotalHH
      : tipo === 'material'
        ? subtotalMat
        : subtotalHH + subtotalMat;

  const recalc = (listaHH: LinhaHH[], listaMat: LinhaMaterial[]): number => {
    const t =
      tipo === 'hh'
        ? listaHH.reduce((s, l) => s + totalHH(l), 0)
        : tipo === 'material'
          ? listaMat.reduce((s, l) => s + totalMat(l), 0)
          : listaHH.reduce((s, l) => s + totalHH(l), 0) +
            listaMat.reduce((s, l) => s + totalMat(l), 0);
    return round2(t);
  };

  const commitHH = (novos: LinhaHH[]) =>
    onChange({ investimentoHh: novos, valorTotal: recalc(novos, mat) });
  const commitMat = (novos: LinhaMaterial[]) =>
    onChange({ investimentoMat: novos, valorTotal: recalc(hh, novos) });

  function addHH() {
    commitHH([
      ...hh,
      { id: localUid('inv'), cargo: '', qtd: 1, horas: 0, valorHora: 0 },
    ]);
  }
  function addMat() {
    commitMat([
      ...mat,
      { id: localUid('inv'), item: '', qtd: 1, unid: 'un', valorUnit: 0 },
    ]);
  }
  const editHH = (idx: number, patch: Partial<LinhaHH>) =>
    commitHH(hh.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const editMat = (idx: number, patch: Partial<LinhaMaterial>) =>
    commitMat(mat.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const delHH = (idx: number) => commitHH(hh.filter((_, i) => i !== idx));
  const delMat = (idx: number) => commitMat(mat.filter((_, i) => i !== idx));

  const showHH = tipo === 'hh' || tipo === 'ambos';
  const showMat = tipo === 'material' || tipo === 'ambos';

  return (
    <Card style={{ padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#1F497D' }}>Investimento</h3>
          <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Tipo selecionado: <strong>{TIPO_LABEL[tipo] ?? tipo}</strong> ·
            altere em "Dados Gerais" → Tipo se necessário.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>VALOR TOTAL</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1F497D' }}>
            {formatBRL(total)}
          </div>
        </div>
      </div>

      {showHH && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h4 style={{ margin: 0, color: '#1F497D' }}>Mão de Obra (HH)</h4>
            <Button variant="secondary" onClick={addHH}>
              + Adicionar linha
            </Button>
          </div>
          <p className="text-muted" style={{ margin: '0 0 12px', fontSize: 12 }}>
            <strong>HE 50% / 100%</strong> são calculadas sobre o valor-hora e
            exibidas para referência — <strong>não somam no total</strong>. Hora
            extra será cobrada via aditivo de contrato.
          </p>
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cargo / Função</TableHead>
                  <TableHead style={{ width: 80 }}>Qtd</TableHead>
                  <TableHead style={{ width: 90 }}>Horas</TableHead>
                  <TableHead style={{ width: 120 }}>R$ / Hora</TableHead>
                  <TableHead style={{ width: 120 }}>HE 50%</TableHead>
                  <TableHead style={{ width: 120 }}>HE 100%</TableHead>
                  <TableHead style={{ width: 140 }}>Total (normal)</TableHead>
                  <TableHead style={{ width: 40 }} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {hh.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      style={{ textAlign: 'center', padding: 16, color: '#94a3b8' }}
                    >
                      Nenhuma linha. Clique em "+ Adicionar linha".
                    </TableCell>
                  </TableRow>
                ) : (
                  hh.map((l, idx) => {
                    const vh = Number(l.valorHora) || 0;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <Input
                            value={l.cargo}
                            onChange={(e) => editHH(idx, { cargo: e.target.value })}
                            placeholder="Ex: Soldador, Caldeireiro, Ajudante"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={l.qtd}
                            onChange={(e) =>
                              editHH(idx, { qtd: Number(e.target.value) || 0 })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.5"
                            value={l.horas}
                            onChange={(e) =>
                              editHH(idx, { horas: Number(e.target.value) || 0 })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={l.valorHora}
                            onChange={(e) =>
                              editHH(idx, {
                                valorHora: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell
                          style={{
                            textAlign: 'right',
                            color: '#f59e0b',
                            background: '#fffbeb',
                          }}
                        >
                          {formatBRL(vh * 1.5)}
                        </TableCell>
                        <TableCell
                          style={{
                            textAlign: 'right',
                            color: '#dc2626',
                            background: '#fef2f2',
                          }}
                        >
                          {formatBRL(vh * 2)}
                        </TableCell>
                        <TableCell style={{ fontWeight: 600, textAlign: 'right' }}>
                          {formatBRL(totalHH(l))}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => delHH(idx)}
                            style={delBtnStyle}
                          >
                            ×
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {hh.length > 0 && (
                <TableFooter>
                  <TableRow style={{ background: '#f1f5f9' }}>
                    <TableCell colSpan={6} style={{ textAlign: 'right', fontWeight: 600 }}>
                      Subtotal HH (horas normais):
                    </TableCell>
                    <TableCell
                      style={{
                        fontWeight: 700,
                        color: '#1F497D',
                        textAlign: 'right',
                      }}
                    >
                      {formatBRL(subtotalHH)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </div>
      )}

      {tipo === 'ambos' && <div style={{ height: 24 }} />}

      {showMat && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <h4 style={{ margin: 0, color: '#1F497D' }}>Materiais</h4>
            <Button variant="secondary" onClick={addMat}>
              + Adicionar linha
            </Button>
          </div>
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item / Descrição</TableHead>
                  <TableHead style={{ width: 100 }}>Qtd</TableHead>
                  <TableHead style={{ width: 80 }}>Unid.</TableHead>
                  <TableHead style={{ width: 140 }}>R$ Unit</TableHead>
                  <TableHead style={{ width: 160 }}>Total</TableHead>
                  <TableHead style={{ width: 50 }} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mat.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      style={{ textAlign: 'center', padding: 16, color: '#94a3b8' }}
                    >
                      Nenhuma linha. Clique em "+ Adicionar linha".
                    </TableCell>
                  </TableRow>
                ) : (
                  mat.map((l, idx) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Input
                          value={l.item}
                          onChange={(e) => editMat(idx, { item: e.target.value })}
                          placeholder='Ex: Tubo AC SCH40 4"'
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={l.qtd}
                          onChange={(e) =>
                            editMat(idx, { qtd: Number(e.target.value) || 0 })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.unid}
                          onChange={(e) => editMat(idx, { unid: e.target.value })}
                          placeholder="un, kg, m"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.valorUnit}
                          onChange={(e) =>
                            editMat(idx, {
                              valorUnit: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </TableCell>
                      <TableCell style={{ fontWeight: 600, textAlign: 'right' }}>
                        {formatBRL(totalMat(l))}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => delMat(idx)}
                          style={delBtnStyle}
                        >
                          ×
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {mat.length > 0 && (
                <TableFooter>
                  <TableRow style={{ background: '#f1f5f9' }}>
                    <TableCell colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>
                      Subtotal Materiais:
                    </TableCell>
                    <TableCell
                      style={{
                        fontWeight: 700,
                        color: '#1F497D',
                        textAlign: 'right',
                      }}
                    >
                      {formatBRL(subtotalMat)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </div>
      )}

      <div className="space-y-1.5" style={{ marginTop: 24 }}>
        <label className="block text-sm font-medium leading-none text-foreground mb-1.5">Condições de Pagamento</label>
        <Textarea
          rows={4}
          value={proposta.condicoesPagamento ?? ''}
          onChange={(e) => onChange({ condicoesPagamento: e.target.value })}
        />
        <div className="form-helper">
          Padrão: 20% mobilização / 65% medições / 15% final. Edite conforme
          negociado.
        </div>
      </div>
    </Card>
  );
}

const delBtnStyle = {
  background: 'none',
  border: 'none',
  color: '#dc2626',
  fontSize: 18,
} as const;
