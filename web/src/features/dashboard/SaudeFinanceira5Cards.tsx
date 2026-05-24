import { formatBRL } from '../../lib/format';

interface SaudeFinanceira5CardsProps {
  saldoAtual: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
  qtdContasPagar: number;
  margemMedia: number;
  taxaDespesa: number;
  projDays: number;
}

/**
 * 5 cards de Saúde Financeira logo abaixo do Gráfico de Fluxo de Caixa.
 * Porte de js/views/Dashboard.js (linhas 540-577) — versão sem o cabeçalho
 * do grid (que vai dentro do card do gráfico).
 */
export default function SaudeFinanceira5Cards({
  saldoAtual,
  entradasPrevistas,
  saidasPrevistas,
  qtdContasPagar,
  margemMedia,
  taxaDespesa,
  projDays,
}: SaudeFinanceira5CardsProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 'var(--sp-lg)',
        paddingTop: 'var(--sp-lg)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <MiniCard
        label="Saldo Atual"
        value={formatBRL(saldoAtual)}
        color={saldoAtual >= 0 ? '#16A34A' : '#DC2626'}
        sub="Caixa hoje"
      />
      <MiniCard
        label="Entradas Previstas"
        value={`+${formatBRL(entradasPrevistas)}`}
        color="#3182CE"
        sub={`Via NFs (próx. ${projDays} dias)`}
      />
      <MiniCard
        label="Saídas Previstas"
        value={`-${formatBRL(saidasPrevistas)}`}
        color={saidasPrevistas > 0 ? '#DC2626' : '#64748B'}
        sub={`${qtdContasPagar} conta(s) a pagar pendente(s)`}
      />
      <MiniCard
        label="Margem Média"
        value={`${margemMedia.toFixed(1)}%`}
        color={margemMedia > 30 ? '#16A34A' : margemMedia > 10 ? '#D97706' : '#DC2626'}
        sub="Lucro esperado médio"
      />
      <MiniCard
        label="Taxa de Despesa"
        value={`${taxaDespesa.toFixed(1)}%`}
        color={taxaDespesa > 80 ? '#DC2626' : taxaDespesa > 60 ? '#D97706' : '#16A34A'}
        sub="Saídas ÷ Faturamento"
      />
    </div>
  );
}

function MiniCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '.04em',
          color: '#64748B',
          marginBottom: 'var(--sp-sm)',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div
        className="text-muted"
        style={{ fontSize: 12, marginTop: 4 }}
      >
        {sub}
      </div>
    </div>
  );
}
