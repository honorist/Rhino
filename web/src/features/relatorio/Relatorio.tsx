import { useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import { useCaixa, useContasPagar, useNotasFiscais } from '../resources';
import { useContracts, useSaidas } from '../contracts/queries';
import { calcRelatorio } from './calculations';
import { exportRelatorioPdf } from './exportRelatorioPdf';

function Kpi({
  label,
  valor,
  sub,
  cor,
}: {
  label: string;
  valor: string;
  sub?: string;
  cor?: string;
}) {
  return (
    <Card style={{ padding: 'var(--sp-lg)' }}>
      <div
        className="text-muted"
        style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          marginTop: 4,
          color: cor ?? 'var(--color-text)',
        }}
      >
        {valor}
      </div>
      {sub && (
        <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </Card>
  );
}

/** Relatório Gerencial — preview de indicadores + geração do PDF executivo. */
export default function Relatorio() {
  const toast = useToast();
  const [gerando, setGerando] = useState(false);
  const contractsQuery = useContracts();
  const saidasQuery = useSaidas();
  const caixaQuery = useCaixa();
  const nfsQuery = useNotasFiscais();
  const cpQuery = useContasPagar();

  const todasCarregadas =
    !contractsQuery.isLoading &&
    !saidasQuery.isLoading &&
    !caixaQuery.isLoading &&
    !nfsQuery.isLoading &&
    !cpQuery.isLoading;

  const dados = useMemo(() => {
    if (!todasCarregadas || !contractsQuery.data) return null;
    return calcRelatorio(contractsQuery.data, {
      caixa: caixaQuery.data ?? [],
      saidas: saidasQuery.data ?? [],
      notasFiscais: nfsQuery.data ?? [],
      contasPagar: cpQuery.data ?? [],
    });
  }, [
    todasCarregadas,
    contractsQuery.data,
    saidasQuery.data,
    caixaQuery.data,
    nfsQuery.data,
    cpQuery.data,
  ]);

  if (!dados) return <Spinner label="Carregando dados do relatório..." />;

  async function handleGerar() {
    if (!dados) return;
    setGerando(true);
    try {
      await exportRelatorioPdf(dados);
      toast.show('Relatório gerado', 'success');
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Falha ao gerar o PDF',
        'danger',
      );
    } finally {
      setGerando(false);
    }
  }

  const VERDE = 'var(--color-success)';
  const VERMELHO = '#E53E3E';

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">📑 Relatório Gerencial</h1>
          <p className="page-subtitle">
            Visão consolidada da operação — gera um PDF executivo de 9 páginas.
          </p>
        </div>
        <Button size="lg" onClick={handleGerar} disabled={gerando}>
          {gerando ? 'Gerando…' : '📄 Gerar PDF'}
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <Kpi
          label="Saldo em caixa"
          valor={formatBRL(dados.saldoCaixa)}
          cor={dados.saldoCaixa >= 0 ? VERDE : VERMELHO}
          sub={
            dados.varSaldoPct != null
              ? `${dados.varSaldoPct >= 0 ? '+' : ''}${dados.varSaldoPct.toFixed(1)}% vs mês ant.`
              : undefined
          }
        />
        <Kpi
          label="Contratos ativos"
          valor={String(dados.contratosAtivos)}
          sub={`Margem média ${dados.margemMedia.toFixed(1)}%`}
        />
        <Kpi
          label="Carteira contratada"
          valor={formatBRL(dados.totalContratado)}
        />
        <Kpi
          label="CR5 (concentração)"
          valor={`${dados.cr5.toFixed(1)}%`}
          cor={dados.cr5 > 70 ? VERMELHO : undefined}
          sub={dados.cr5 > 70 ? 'Concentração elevada' : undefined}
        />
        <Kpi
          label="A receber (NFs)"
          valor={formatBRL(dados.totalAReceber)}
          sub={`${dados.qtdNFsPend} NF(s) pendente(s)`}
        />
        <Kpi
          label="A pagar (contas)"
          valor={formatBRL(dados.totalAPagar)}
          sub={`${dados.qtdCpPend} conta(s) em aberto`}
          cor={VERMELHO}
        />
        <Kpi
          label="Faturamento (mês)"
          valor={formatBRL(dados.faturamentoMes)}
          cor={
            dados.varFatPct != null && dados.varFatPct >= 0 ? VERDE : undefined
          }
        />
        <Kpi
          label="Runway (caixa)"
          valor={`${dados.runwayMeses} meses`}
        />
      </div>

      <Card style={{ padding: 'var(--sp-lg)' }}>
        <h3 style={{ margin: '0 0 var(--sp-sm)', fontSize: 15 }}>
          O que entra no PDF
        </h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
          <li>Capa + Sumário</li>
          <li>Sumário executivo (narrativa + 8 KPIs)</li>
          <li>Portfólio de contratos (margem por contrato)</li>
          <li>Concentração de receita (CR5 + top 5)</li>
          <li>Fluxo de caixa (últimos 6 meses)</li>
          <li>Aging de contas a receber</li>
          <li>
            Riscos e alertas{dados.riscos.length > 0
              ? ` (${dados.riscos.length} identificado(s))`
              : ' (nenhum)'}
          </li>
          <li>Notas metodológicas</li>
        </ul>
      </Card>
    </>
  );
}
