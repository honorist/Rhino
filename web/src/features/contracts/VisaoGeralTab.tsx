import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { formatBRL } from '../../lib/format';
import { useBase, useContasPagar, useRecursos, useTiposBase } from '../resources';
import { useNotasFiscais } from '../resources';
import { useCaixa } from '../resources';
import { useSaidas } from './queries';
import type { ContratoTabProps } from './ContratoDetail';
import { computeVisaoGeral } from './visaoGeral';
import { exportContractPdf } from './exportContractPdf';
import DetalheComposicaoModal from './DetalheComposicaoModal';
import DataTable, { type Column } from '../../components/ui/DataTable';

type Registro = Record<string, unknown>;

const TIPO_LABEL_FIXO: Record<string, string> = {
  mao_de_obra: 'Mão de Obra',
  material: 'Material',
  hospedagem: 'Hospedagem',
  transporte: 'Transporte',
  base: 'Custo BASE',
  outros: 'Outros',
};
const TIPO_COR_FIXO: Record<string, string> = {
  mao_de_obra: '#A78BFA',
  material: '#FB923C',
  hospedagem: '#22D3EE',
  transporte: '#34D399',
  base: '#60A5FA',
  outros: '#9CA3AF',
};

/** Card de KPI com borda superior colorida. */
function Kpi({
  label,
  valor,
  sub,
  cor,
}: {
  label: string;
  valor: string;
  sub: string;
  cor: string;
}) {
  return (
    <div
      style={{
        padding: 'var(--sp-lg)',
        borderTop: `3px solid ${cor}`,
        borderRight: '1px solid var(--color-border)',
      }}
    >
      <div className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{valor}</div>
      <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

/** Aba Visão Geral do contrato — resumo financeiro e operacional. */
export default function VisaoGeralTab({ contract }: ContratoTabProps) {
  const [exportando, setExportando] = useState(false);
  const [detalheTipo, setDetalheTipo] = useState<string | null>(null);
  const saidasQuery = useSaidas();
  const nfsQuery = useNotasFiscais();
  const caixaQuery = useCaixa();
  const baseQuery = useBase();
  const tiposBaseQuery = useTiposBase();
  const recursosQuery = useRecursos();
  const contasQuery = useContasPagar();

  const data = useMemo(
    () =>
      computeVisaoGeral(contract, {
        saidas: saidasQuery.data ?? [],
        notasFiscais: nfsQuery.data ?? [],
        caixa: caixaQuery.data ?? [],
        base: baseQuery.data ?? [],
      }),
    [contract, saidasQuery.data, nfsQuery.data, caixaQuery.data, baseQuery.data],
  );

  const valor = Number(contract.value) || 0;
  const meta = contract.metadata as Registro | undefined;
  const retencao = Number(contract.retencaoPercent) || 0;

  const tipoLabel = (key: string): string => {
    if (TIPO_LABEL_FIXO[key]) return TIPO_LABEL_FIXO[key];
    const t = (tiposBaseQuery.data ?? []).find((x) => x.key === key);
    return t ? String(t.label ?? key) : key.replace(/_/g, ' ');
  };
  const tipoCor = (key: string): string => {
    if (TIPO_COR_FIXO[key]) return TIPO_COR_FIXO[key];
    const t = (tiposBaseQuery.data ?? []).find((x) => x.key === key);
    return t && t.cor ? String(t.cor) : '#9CA3AF';
  };

  // ── NFs e pendências do contrato (sidebar) ──
  const nfsContrato = (nfsQuery.data ?? [])
    .filter((nf) => nf.contractId === contract.id)
    .slice()
    .sort((a, b) =>
      String(b.dataLimite ?? '').localeCompare(String(a.dataLimite ?? '')),
    );
  const passagensPendentes = (contasQuery.data ?? []).filter(
    (c) =>
      c.contractId === contract.id &&
      c.category === 'passagem' &&
      c.status === 'pendente',
  );

  // ── Equipe alocada ──
  const recursosMap = useMemo(() => {
    const m = new Map<string, Registro>();
    for (const r of recursosQuery.data ?? []) m.set(r.id, r as Registro);
    return m;
  }, [recursosQuery.data]);
  const membros = (contract.organograma ?? []) as Registro[];

  const hoje = new Date().toISOString().slice(0, 10);
  function statusOps(r: Registro | undefined): string {
    if (!r) return '—';
    const folgas = Array.isArray(r.folgas) ? (r.folgas as Registro[]) : [];
    const emFolga = folgas.some(
      (f) =>
        String(f.dataInicio ?? '') <= hoje &&
        (!f.dataFim || String(f.dataFim) >= hoje),
    );
    return emFolga ? 'Em folga' : 'Em campo';
  }

  const columnsEquipe = useMemo<Column<Registro>[]>(
    () => [
      {
        header: 'Pessoa',
        cell: (m) => {
          const r = m.recursoId ? recursosMap.get(String(m.recursoId)) : undefined;
          return <strong>{String(r?.nome ?? m.nome ?? '—')}</strong>;
        },
      },
      {
        header: 'Função',
        cell: (m) => {
          const r = m.recursoId ? recursosMap.get(String(m.recursoId)) : undefined;
          return <>{String(r?.profissao ?? m.cargo ?? '—')}</>;
        },
      },
      {
        header: 'Cat.',
        cell: (m) => {
          const r = m.recursoId ? recursosMap.get(String(m.recursoId)) : undefined;
          return <>{String(r?.rdoCategoria ?? 'MOD').toUpperCase()}</>;
        },
      },
      {
        header: 'Status',
        cell: (m) => {
          const r = m.recursoId ? recursosMap.get(String(m.recursoId)) : undefined;
          return <>{statusOps(r)}</>;
        },
      },
    ],
    [recursosMap],
  );

  // ── RDO de hoje ──
  const rdos = (contract.rdos ?? []) as Registro[];
  const rdoHoje = rdos.find((r) => r.data === hoje);

  // ── Barra "uso do contrato" ──
  const v = valor > 0 ? valor : 1;
  const seg = (x: number) => Math.max(0, Math.min(100, (x / v) * 100));
  const pctRec = seg(data.totalRecebido);
  const pctNF = seg(data.totalNFAberta);
  const pctRasc = seg(data.totalRascunho);
  const pctDisp = Math.max(0, 100 - pctRec - pctNF - pctRasc);

  const composicao = Object.entries(data.realizadoPorTipo)
    .filter(([, val]) => val > 0)
    .sort((a, b) => b[1] - a[1]);

  async function handleExportPdf() {
    setExportando(true);
    try {
      await exportContractPdf(contract, data, { nfsContrato, tipoLabel });
      toast.success('PDF gerado com sucesso');
    } catch {
      toast.error('Falha ao gerar o PDF');
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 'var(--sp-md)',
        }}
      >
        <Button
          variant="secondary"
          onClick={handleExportPdf}
          disabled={exportando}
        >
          {exportando ? 'Gerando…' : '📄 Exportar PDF'}
        </Button>
      </div>
      {meta?.propostaId != null && (
        <div
          style={{
            marginBottom: 'var(--sp-md)',
            padding: '10px 16px',
            background: 'rgba(31,73,125,.08)',
            borderLeft: '3px solid #1F497D',
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          <strong style={{ color: '#1F497D' }}>📋 Origem: Proposta</strong> ·{' '}
          <Link
            to={`/proposta/${String(meta.propostaId)}`}
            style={{ color: '#1F497D', fontWeight: 600 }}
          >
            Ver proposta →
          </Link>
        </div>
      )}
      {retencao > 0 && (
        <div
          style={{
            marginBottom: 'var(--sp-md)',
            padding: '10px 16px',
            background: 'rgba(213,158,46,.1)',
            borderLeft: '3px solid #D69E2E',
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          <strong style={{ color: '#D69E2E' }}>
            ⚠ Retenção {retencao.toFixed(1)}%
          </strong>{' '}
          — valor retido estimado{' '}
          <strong>
            {formatBRL((data.totalEmitido * retencao) / 100)}
          </strong>{' '}
          sobre {formatBRL(data.totalEmitido)} emitido.
        </div>
      )}

      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--sp-lg)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <Kpi
            label="Valor do Contrato"
            valor={formatBRL(valor)}
            sub="valor vendido"
            cor="var(--color-primary)"
          />
          <Kpi
            label="Já faturado"
            valor={formatBRL(data.totalEmitido)}
            sub={`${data.pctEmitido.toFixed(1)}% executado · ${data.nfsEmitidasCount} NF(s)`}
            cor="var(--color-success)"
          />
          <Kpi
            label="Disponível para BM"
            valor={formatBRL(data.totalAMedir)}
            sub="trava ativa no contrato"
            cor="var(--color-warning)"
          />
          <Kpi
            label="Resultado parcial"
            valor={`${data.margemAtual >= 0 ? '+ ' : ''}${formatBRL(data.margemAtual)}`}
            sub={
              valor > 0
                ? `${data.pctMargem.toFixed(1)}% · meta ≥20%${
                    data.pctMargem < 20
                      ? ` · faltam ${formatBRL(data.margemFaltante)}`
                      : ' · ✓ acima da meta'
                  }`
                : 'sem valor de contrato'
            }
            cor={
              data.margemAtual >= 0
                ? 'var(--color-success)'
                : 'var(--color-danger)'
            }
          />
        </div>
      </Card>

      <Card style={{ padding: 'var(--sp-lg)', marginBottom: 'var(--sp-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Orçamento — uso do contrato
          </strong>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {data.pctMedido.toFixed(1)}% medido
          </span>
        </div>
        <div
          style={{
            height: 22,
            background: 'var(--color-surface-2)',
            borderRadius: 99,
            overflow: 'hidden',
            display: 'flex',
            marginTop: 'var(--sp-md)',
          }}
        >
          <div style={{ width: `${pctRec}%`, background: '#10B981' }} />
          <div style={{ width: `${pctNF}%`, background: '#F59E0B' }} />
          <div style={{ width: `${pctRasc}%`, background: '#FCA5A5' }} />
          <div style={{ width: `${pctDisp}%`, background: 'rgba(0,0,0,.06)' }} />
        </div>
        <div
          style={{
            display: 'flex',
            gap: 'var(--sp-lg)',
            marginTop: 'var(--sp-md)',
            fontSize: 13,
            flexWrap: 'wrap',
          }}
        >
          <span>🟩 Recebido {formatBRL(data.totalRecebido)}</span>
          <span>🟧 NF emitida {formatBRL(data.totalNFAberta)}</span>
          <span>🟥 Rascunho {formatBRL(data.totalRascunho)}</span>
          <span>⬜ Disponível {formatBRL(data.totalDisponivel)}</span>
        </div>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,2fr) minmax(260px,1fr)',
          gap: 'var(--sp-lg)',
          alignItems: 'start',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <Card style={{ padding: 'var(--sp-md)' }}>
          <h3 style={{ margin: '0 0 var(--sp-sm)', fontSize: 15 }}>
            Equipe alocada · {membros.length} pessoa
            {membros.length !== 1 ? 's' : ''}
          </h3>
          <DataTable
            columns={columnsEquipe}
            rows={membros}
            rowKey={(m) => String(m.recursoId ?? m.id ?? JSON.stringify(m))}
            emptyMessage="Nenhum membro alocado."
            pageSize={8}
          />
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <Card style={{ padding: 'var(--sp-md)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Saídas / BMs</h3>
            {nfsContrato.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 12 }}>
                Nenhum BM.
              </p>
            ) : (
              nfsContrato.slice(0, 5).map((nf, i) => (
                <div
                  key={String(nf.id ?? i)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderBottom: '1px solid var(--color-border)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    BM-{String(nf.numero ?? '—')}
                  </span>
                  <strong>{formatBRL(Number(nf.valor) || 0)}</strong>
                </div>
              ))
            )}
          </Card>

          <Card style={{ padding: 'var(--sp-md)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Pendências</h3>
            {passagensPendentes.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 12 }}>
                Nenhuma pendência.
              </p>
            ) : (
              passagensPendentes.slice(0, 5).map((p, i) => (
                <div key={String(p.id ?? i)} style={{ fontSize: 13, padding: '4px 0' }}>
                  • {String(p.descricao ?? 'Pendência')}
                </div>
              ))
            )}
          </Card>

          <Card style={{ padding: 'var(--sp-md)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>
              RDO de hoje{' '}
              <Badge
                style={{
                  background: rdoHoje ? '#D1FAE5' : '#FEF3C7',
                  color: rdoHoje ? '#065F46' : '#92400E',
                }}
              >
                {rdoHoje ? 'Lançado' : 'Pendente'}
              </Badge>
            </h3>
            {!rdoHoje && (
              <p className="text-muted" style={{ fontSize: 12 }}>
                Não lançado para {new Date().toLocaleDateString('pt-BR')}.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Card style={{ padding: 'var(--sp-lg)' }}>
        <h3 style={{ margin: '0 0 var(--sp-md)', fontSize: 15 }}>
          Composição do Gasto
        </h3>
        <div
          style={{
            display: 'flex',
            gap: 'var(--sp-lg)',
            flexWrap: 'wrap',
            marginBottom: 'var(--sp-md)',
            fontSize: 14,
          }}
        >
          <span>
            Contrato <strong>{formatBRL(valor)}</strong>
          </span>
          <span style={{ color: 'var(--color-text-muted)' }}>−</span>
          <span>
            Gastos{' '}
            <strong style={{ color: 'var(--color-danger)' }}>
              {formatBRL(data.totalRealizado)}
            </strong>
          </span>
          <span style={{ color: 'var(--color-text-muted)' }}>=</span>
          <span>
            Saldo{' '}
            <strong style={{ color: 'var(--color-success)' }}>
              {formatBRL(data.saldoRestante)}
            </strong>
          </span>
          <span className="text-muted">
            ({data.pctConsumido.toFixed(1)}% consumido)
          </span>
        </div>
        {composicao.map(([tipo, val]) => {
          const pct = data.totalRealizado > 0
            ? (val / data.totalRealizado) * 100
            : 0;
          return (
            <button
              key={tipo}
              type="button"
              onClick={() => setDetalheTipo(tipo)}
              title="Ver lançamentos desta categoria"
              style={{
                display: 'block',
                width: '100%',
                marginBottom: 8,
                padding: 0,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                font: 'inherit',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  marginBottom: 2,
                }}
              >
                <span>{tipoLabel(tipo)} ›</span>
                <strong>
                  {formatBRL(val)} ({pct.toFixed(1)}%)
                </strong>
              </div>
              <div
                style={{
                  height: 8,
                  background: 'var(--color-border)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: tipoCor(tipo),
                  }}
                />
              </div>
            </button>
          );
        })}
      </Card>

      {detalheTipo && (
        <DetalheComposicaoModal
          contractId={contract.id}
          tipo={detalheTipo}
          tipoLabel={tipoLabel(detalheTipo)}
          onClose={() => setDetalheTipo(null)}
        />
      )}
    </>
  );
}
