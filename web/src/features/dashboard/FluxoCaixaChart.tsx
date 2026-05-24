import { useEffect, useRef } from 'react';

type ChartInstance = { destroy: () => void };

interface FluxoCaixaChartProps {
  /** Pontos passados (entrada/saída por mês). */
  meses: { label: string; entradas: number; saidas: number }[];
  /** Pontos projetados (linha tracejada). */
  projecao?: { label: string; saldo: number }[];
  /** Saldo inicial pra projeção começar. */
  saldoInicial: number;
  height?: number;
}

/**
 * Gráfico de Fluxo de Caixa — entradas vs saídas (passado) + projeção
 * (futuro tracejado). Porte de renderChart() em js/views/Dashboard.js.
 * Chart.js é carregado por import dinâmico (code-split — só baixa quando
 * o Dashboard monta).
 */
export default function FluxoCaixaChart({
  meses,
  projecao = [],
  saldoInicial,
  height = 300,
}: FluxoCaixaChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { Chart, registerables } = await import('chart.js');
      if (cancelled) return;
      Chart.register(...registerables);
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;

      // Saldo acumulado mês a mês (linha sólida — passado)
      let acumulado = 0;
      const saldoPassado = meses.map((m) => {
        acumulado += (m.entradas || 0) - (m.saidas || 0);
        return acumulado;
      });

      // Projeção (linha tracejada — futuro)
      const labels = [
        ...meses.map((m) => m.label),
        ...projecao.map((p) => p.label),
      ];
      const saldoProjeto: (number | null)[] = [
        ...meses.map(() => null),
        // Conecta com último valor passado se houver
        saldoPassado.length > 0 ? saldoPassado[saldoPassado.length - 1] : saldoInicial,
        ...projecao.slice(1).map((p) => p.saldo),
      ];

      // Padding pra alinhar arrays
      const saldoPassadoPadded: (number | null)[] = [
        ...saldoPassado,
        ...projecao.map(() => null),
      ];

      // Destrói gráfico anterior se houver (re-render)
      chartRef.current?.destroy();
      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Realizado',
              data: saldoPassadoPadded,
              borderColor: '#F0B429',
              backgroundColor: 'rgba(240,180,41,.1)',
              borderWidth: 2,
              tension: 0.3,
              fill: false,
              pointRadius: 3,
              pointHoverRadius: 5,
            },
            ...(projecao.length > 0
              ? [
                  {
                    label: 'Projetado (NFs)',
                    data: saldoProjeto,
                    borderColor: '#60A5FA',
                    backgroundColor: 'rgba(96,165,250,.1)',
                    borderWidth: 2,
                    borderDash: [6, 4],
                    tension: 0.3,
                    fill: false,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                  },
                ]
              : []),
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const v = ctx.parsed.y;
                  if (v == null) return '';
                  return `${ctx.dataset.label}: ${new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  }).format(v)}`;
                },
              },
            },
          },
          scales: {
            y: {
              ticks: {
                callback: (v) =>
                  new Intl.NumberFormat('pt-BR', {
                    notation: 'compact',
                    style: 'currency',
                    currency: 'BRL',
                  }).format(Number(v) || 0),
              },
            },
          },
        },
      }) as unknown as ChartInstance;
    })();

    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [meses, projecao, saldoInicial]);

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
