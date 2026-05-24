import { useEffect, useRef } from 'react';

type ChartInstance = { destroy: () => void };

export interface PontoHistorico {
  data: string;
  saldo: number;
  label?: string;
}
export interface PontoProjetado {
  data: string;
  saldo: number;
}

interface FluxoCaixaChartProps {
  /** Histórico real (vem de /api/dashboard.historicoCaixa). */
  historico: PontoHistorico[];
  /** Projeção futura (vem de /api/dashboard.saldoProjetado). */
  projecao: PontoProjetado[];
  /** Saldo atual (último ponto antes da projeção). */
  saldoAtual: number;
  height?: number;
}

/**
 * Gráfico de Fluxo de Caixa — passado real + projeção futura tracejada.
 * Porte fiel de renderChart() em js/views/Dashboard.js.
 * Chart.js carregado via dynamic import (code-split).
 */
export default function FluxoCaixaChart({
  historico,
  projecao,
  saldoAtual,
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

      // Helpers de label/format
      const fmtDataCurta = (s: string) =>
        new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        });
      // Honra a permissão `special:nao-ver-valores` — quando ativa, eixo e
      // tooltip do gráfico ficam mascarados.
      const { isMaskingMoney } = await import('../../lib/format');
      const fmtBRL = (v: number) =>
        isMaskingMoney()
          ? 'R$ ●●●●'
          : new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            }).format(v);
      const fmtBRLk = (v: number) =>
        isMaskingMoney()
          ? 'R$ ●●●●'
          : new Intl.NumberFormat('pt-BR', {
              notation: 'compact',
              style: 'currency',
              currency: 'BRL',
              maximumFractionDigits: 1,
            }).format(v);

      const labelsPassado = historico.map((d) => d.label || fmtDataCurta(d.data));
      const saldosPassado = historico.map((d) => d.saldo);
      const labelsFuturo = ['Hoje', ...projecao.map((d) => fmtDataCurta(d.data))];

      const totalPassado = labelsPassado.length;
      const labels = [...labelsPassado, ...labelsFuturo.slice(1)];

      // Padding: passado preenchido até totalPassado-1, depois null
      const dataPassado: (number | null)[] = [
        ...saldosPassado,
        ...new Array(Math.max(0, labelsFuturo.length - 1)).fill(null),
      ];
      // Projeção: null até totalPassado-1, depois saldoAtual + projecao
      const dataFuturo: (number | null)[] = [
        ...new Array(totalPassado - 1).fill(null),
        saldoAtual,
        ...projecao.slice(1).map((d) => d.saldo),
      ];

      chartRef.current?.destroy();
      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Saldo realizado',
              data: dataPassado,
              borderColor: '#F0B429',
              backgroundColor: 'rgba(240,180,41,.08)',
              borderWidth: 2,
              pointRadius: 2,
              pointHoverRadius: 5,
              pointBackgroundColor: '#F0B429',
              tension: 0.4,
              fill: true,
              spanGaps: false,
            },
            {
              label: 'Projeção (NFs)',
              data: dataFuturo,
              borderColor: '#60A5FA',
              backgroundColor: 'rgba(96,165,250,.04)',
              borderWidth: 2,
              borderDash: [6, 4],
              pointRadius: 3,
              pointHoverRadius: 6,
              pointBackgroundColor: '#60A5FA',
              pointStyle: 'rectRot',
              tension: 0.3,
              fill: true,
              spanGaps: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { usePointStyle: true, padding: 16 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const v = ctx.parsed.y;
                  if (v == null) return '';
                  return ` ${ctx.dataset.label}: ${fmtBRL(v)}`;
                },
              },
            },
          },
          scales: {
            y: {
              ticks: {
                callback: (v) => fmtBRLk(Number(v) || 0),
              },
            },
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 0,
                autoSkip: true,
                maxTicksLimit: 12,
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
  }, [historico, projecao, saldoAtual]);

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
