import { useState, type ReactNode } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Spinner from '../../components/ui/spinner';
import Button from '../../components/ui/button';
import Card from '../../components/ui/card';
import DataTable, { type Column } from '../../components/ui/data-table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import { formatBRL } from '../../lib/format';
import { useAiUsage, useCobrancaHistorico, useCobrancaProjecao } from './queries';
import type { AiUsageStats, CobrancaDetalhe, CobrancaMes } from './types';

/** Taxa fixa mensal cobrada do app, em BRL. */
const TAXA_FIXA = 500;

/** Faixas de preço por contrato ativo. */
const FAIXAS: { valor: number; label: string }[] = [
  { valor: 100, label: '1-10' },
  { valor: 80, label: '11-15' },
  { valor: 60, label: '16+' },
];

const MESES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

function mesNome(mes: number): string {
  return MESES_ABREV[mes - 1] ?? String(mes);
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

/**
 * Cobrança do app â€” valor mensal a pagar, visível só para administradores.
 * Migração de js/views/CobrancaMensal.js.
 */
export default function CobrancaMensal() {
  const historicoQuery = useCobrancaHistorico();
  const projecaoQuery = useCobrancaProjecao();
  const aiUsageQuery = useAiUsage();

  const [detalhe, setDetalhe] = useState<CobrancaMes | null>(null);

  const meses = historicoQuery.data ?? [];
  const projecao = projecaoQuery.data ?? null;
  const aiUsage = aiUsageQuery.data ?? null;

  const ultimoFechado = meses[0] ?? null;
  const totalAnual = meses.reduce((soma, m) => soma + (m.total || 0), 0);

  function exportarCSV() {
    const linhas: (string | number)[][] = [
      [
        'Mes', 'Ano', 'Contratos ativos', 'Valor unitario',
        'Subtotal contratos', 'Taxa fixa', 'Total',
      ],
    ];
    meses.forEach((m) => {
      linhas.push([
        m.mes, m.ano, m.contratosAtivos, m.valorPorContrato,
        m.valorContratos, m.taxaFixa, m.total,
      ]);
    });
    const csv = linhas.map((l) => l.join(';')).join('\n');
    const blob = new Blob(['ï»¿' + csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cobranca_rhino_${new Date().toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<CobrancaMes>[] = [
    {
      header: 'Mês',
      cell: (m) => <strong>{`${mesNome(m.mes)}/${m.ano}`}</strong>,
    },
    {
      header: 'Contratos ativos',
      align: 'right',
      cell: (m) => m.contratosAtivos,
    },
    {
      header: 'Valor unitário',
      align: 'right',
      cell: (m) => formatBRL(m.valorPorContrato),
    },
    {
      header: 'Subtotal contratos',
      align: 'right',
      cell: (m) => formatBRL(m.valorContratos),
    },
    {
      header: 'Taxa fixa',
      align: 'right',
      cell: (m) => formatBRL(m.taxaFixa),
    },
    {
      header: 'Total',
      align: 'right',
      cell: (m) => (
        <span style={{ fontWeight: 800, color: '#065F46' }}>
          {formatBRL(m.total)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Cobrança do app"
        subtitle="Valor a pagar mensalmente â€” apenas administradores enxergam esta tela"
      />

      {historicoQuery.isLoading ? (
        <Spinner label="Carregando cobrança..." />
      ) : historicoQuery.isError ? (
        <Card style={{ padding: 24 }}>
          <p className="text-danger">
            Erro ao carregar a cobrança. Tente novamente.
          </p>
        </Card>
      ) : (
        <>
          {/* KPIs: projeção, Ãºltimo fechado, acumulado 12m */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr 1fr',
              gap: 'var(--sp-md)',
              marginBottom: 'var(--sp-lg)',
            }}
          >
            <Card
              style={{
                padding: 'var(--sp-md)',
                background:
                  'linear-gradient(135deg,rgba(99,102,241,.06),rgba(99,102,241,.02))',
                borderLeft: '4px solid #6366F1',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: '#4338CA',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                }}
              >
                Projeção ·{' '}
                {projecao
                  ? `${mesNome(projecao.mes)}/${projecao.ano}`
                  : 'â€”'}
              </div>
              {projecao ? (
                <>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 800,
                      color: '#1E1B4B',
                    }}
                  >
                    {formatBRL(projecao.total)}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--color-text-muted)',
                      marginTop: 4,
                    }}
                  >
                    {projecao.contratosAtivos} contrato
                    {plural(projecao.contratosAtivos, '', 's')} ativos · faixa{' '}
                    {projecao.faixa} · {formatBRL(projecao.valorPorContrato)}
                    /contrato + {formatBRL(projecao.taxaFixa)} fixa
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-muted)',
                      marginTop: 6,
                      fontStyle: 'italic',
                    }}
                  >
                    âš  Valor parcial â€” atualizado em tempo real até o fim do mês
                  </div>
                </>
              ) : (
                <div className="text-muted">Indisponível</div>
              )}
            </Card>

            <Card style={{ padding: 'var(--sp-md)' }}>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Ãšltimo mês fechado
              </div>
              {ultimoFechado ? (
                <>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>
                    {formatBRL(ultimoFechado.total)}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {mesNome(ultimoFechado.mes)}/{ultimoFechado.ano} ·{' '}
                    {ultimoFechado.contratosAtivos} contratos
                  </div>
                </>
              ) : (
                <div className="text-muted">Sem histórico ainda</div>
              )}
            </Card>

            <Card style={{ padding: 'var(--sp-md)' }}>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Acumulado 12 meses
              </div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>
                {formatBRL(totalAnual)}
              </div>
              <div
                style={{ fontSize: 13, color: 'var(--color-text-muted)' }}
              >
                soma dos Ãºltimos meses
              </div>
            </Card>
          </div>

          {aiUsage && <AiUsageCard stats={aiUsage} />}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: 'var(--sp-md)',
            }}
          >
            <Card>
              <h3 className="text-[15px] font-semibold tracking-tight px-5 pt-5 pb-4">Histórico mensal</h3>
              <Button
                size="sm"
                variant="secondary"
                onClick={exportarCSV}
                disabled={meses.length === 0}
              >
                Exportar CSV
              </Button>
              <DataTable
                columns={columns}
                rows={meses}
                rowKey={(m) => `${m.ano}-${m.mes}`}
                onRowClick={(m) => setDetalhe(m)}
                emptyMessage="Sem histórico ainda"
              />
            </Card>

            <Card style={{ padding: 'var(--sp-md)' }}>
              <h3 style={{ margin: '0 0 var(--sp-sm)', fontSize: 15 }}>
                ðŸ“Š Tabela de preços
              </h3>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                <PrecoLinha
                  label="Taxa fixa mensal"
                  valor={formatBRL(TAXA_FIXA)}
                />
                {FAIXAS.map((f) => (
                  <PrecoLinha
                    key={f.label}
                    label={`${f.label} contratos`}
                    valor={`${formatBRL(f.valor)}/contrato`}
                  />
                ))}
              </div>
              <div
                style={{
                  marginTop: 'var(--sp-md)',
                  padding: '8px 10px',
                  background: 'var(--color-surface-2)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                }}
              >
                <strong>Como contar:</strong> Conta cada contrato que ficou com
                status "ativo" por <strong>2 dias ou mais</strong> dentro do
                mês.
              </div>
            </Card>
          </div>
        </>
      )}

      {detalhe && (
        <DetalheModal mes={detalhe} onClose={() => setDetalhe(null)} />
      )}
    </>
  );
}

function PrecoLinha({ label, valor }: { label: string; valor: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <span>{label}</span>
      <strong>{valor}</strong>
    </div>
  );
}

function AiUsageCard({ stats }: { stats: AiUsageStats }) {
  const monthly = stats.monthly ?? {};
  const allTime = stats.allTime ?? {};
  const fmtUSD = (v?: number) => '$' + (Number(v) || 0).toFixed(4);
  const fmtTok = (v?: number) => (Number(v) || 0).toLocaleString('pt-BR');

  return (
    <Card
      style={{
        padding: 'var(--sp-md)',
        marginBottom: 'var(--sp-md)',
        borderLeft: '4px solid #7C3AED',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 'var(--sp-sm)',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: '#5B21B6' }}>
          IA â€” Uso Claude API
        </span>
        <span
          style={{
            fontSize: 12,
            color: 'var(--color-text-muted)',
            fontStyle: 'italic',
          }}
        >
          Haiku · validação de documentos
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4,1fr)',
          gap: 'var(--sp-sm)',
          fontSize: 13,
        }}
      >
        <AiTile titulo="Chamadas este mês">
          <div style={{ fontSize: 22, fontWeight: 800, color: '#5B21B6' }}>
            {fmtTok(monthly.calls)}
          </div>
        </AiTile>
        <AiTile titulo="Tokens este mês">
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {fmtTok((monthly.input_tokens || 0) + (monthly.output_tokens || 0))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {fmtTok(monthly.input_tokens)} in · {fmtTok(monthly.output_tokens)}{' '}
            out
          </div>
        </AiTile>
        <AiTile titulo="Custo este mês">
          <div style={{ fontSize: 22, fontWeight: 800, color: '#065F46' }}>
            {fmtUSD(monthly.cost_usd)}
          </div>
        </AiTile>
        <AiTile titulo="Custo total acumulado">
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {fmtUSD(allTime.cost_usd)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {fmtTok(allTime.calls)} chamadas totais
          </div>
        </AiTile>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: 'var(--color-text-muted)',
        }}
      >
        Preço Haiku: $0,80/M tokens de entrada · $4,00/M tokens de saída
      </div>
    </Card>
  );
}

function AiTile({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface-2)',
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          color: 'var(--color-text-muted)',
          fontSize: 11,
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        {titulo}
      </div>
      {children}
    </div>
  );
}

/** Colunas da tabela de contratos cobrados dentro do DetalheModal.
 *  Definidas fora do componente pois a tabela é read-only e não tem callbacks. */
const DETALHE_COLUMNS: Column<CobrancaDetalhe>[] = [
  {
    id: 'contrato',
    header: 'Contrato',
    cell: (d) => <strong>{d.name}</strong>,
  },
  {
    id: 'diasAtivos',
    header: 'Dias ativos no mês',
    align: 'right',
    cell: (d) => d.diasAtivos,
  },
  {
    id: 'statusAtual',
    header: 'Status atual',
    cell: (d) => (
      <span style={{ color: 'var(--color-text-muted)' }}>
        {d.statusAtual || '—'}
      </span>
    ),
  },
];

function DetalheModal({
  mes,
  onClose,
}: {
  mes: CobrancaMes;
  onClose: () => void;
}) {
  const det = mes.detalhes ?? [];
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{`Detalhe · ${mesNome(mes.mes)}/${mes.ano}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div
        style={{
          fontSize: 13,
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--sp-md)',
        }}
      >
        {mes.contratosAtivos} contratos cobrados · Total:{' '}
        <strong>{formatBRL(mes.total)}</strong>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4,1fr)',
          gap: 8,
          marginBottom: 'var(--sp-md)',
          fontSize: 13,
        }}
      >
        <div>
          <strong>Faixa:</strong>
          <br />
          {mes.faixa}
        </div>
        <div>
          <strong>Unitário:</strong>
          <br />
          {formatBRL(mes.valorPorContrato)}
        </div>
        <div>
          <strong>Subtotal:</strong>
          <br />
          {formatBRL(mes.valorContratos)}
        </div>
        <div>
          <strong>Taxa fixa:</strong>
          <br />
          {formatBRL(mes.taxaFixa)}
        </div>
      </div>

      <h3 style={{ margin: '0 0 var(--sp-sm)', fontSize: 14 }}>
        Contratos cobrados ({det.length})
      </h3>
      <DataTable
        columns={DETALHE_COLUMNS}
        rows={det}
        rowKey={(d) => d.name}
        emptyMessage="Nenhum contrato com 2+ dias ativos neste mês."
      />
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
