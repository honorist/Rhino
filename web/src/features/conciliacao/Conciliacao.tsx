import { useRef, useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { toast } from 'sonner';
import { formatBRL } from '../../lib/format';
import { useContasPagar, useCreateCaixa } from '../resources';
import { usePagarConta } from '../contas-pagar/queries';
import { parseExtrato } from './parser';
import { findMatches } from './matching';
import type { BankTransaction, Decision } from './types';

function formatDateBR(iso: string): string {
  return iso ? iso.split('-').reverse().join('/') : '';
}

/** Conta confirmadas/pendentes/ignoradas a partir das decisões. */
function contarDecisoes(decisions: Record<string, Decision>) {
  let confirmadas = 0;
  let ignoradas = 0;
  let pendentes = 0;
  for (const d of Object.values(decisions)) {
    if (d.action === 'confirm') confirmadas++;
    else if (d.action === 'skip') ignoradas++;
    else pendentes++;
  }
  return { confirmadas, ignoradas, pendentes };
}

/** Tela de Conciliação Bancária — migração de js/views/Conciliacao.js. */
export default function Conciliacao() {
  const contasQuery = useContasPagar();
  const createCaixa = useCreateCaixa();
  const pagarConta = usePagarConta();

  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [processando, setProcessando] = useState(false);

  const contas = contasQuery.data ?? [];

  function carregarArquivo(file: File) {
    void file.text().then((text) => {
      let parsed: BankTransaction[];
      try {
        parsed = parseExtrato(file.name, text);
      } catch (error) {
        toast.error(
          `Erro ao processar arquivo: ${(error as Error).message}`
);
        return;
      }
      if (parsed.length === 0) {
        toast.error('Nenhuma transação encontrada no arquivo.');
        return;
      }
      const novasDecisoes: Record<string, Decision> = {};
      for (const tx of parsed) {
        novasDecisoes[tx.id] = {
          action: 'pending',
          contaPagarId: null,
          matches: findMatches(tx, contas),
        };
      }
      setTransactions(parsed);
      setDecisions(novasDecisoes);
      toast.success(
        `${parsed.length} transação(ões) encontrada(s).`
);
    });
  }

  function setAction(
    txId: string,
    action: Decision['action'],
    contaPagarId: string | null,
  ) {
    setDecisions((prev) => ({
      ...prev,
      [txId]: { ...prev[txId], action, contaPagarId },
    }));
  }

  async function lancarConfirmados() {
    const confirmados = transactions.filter(
      (tx) => decisions[tx.id]?.action === 'confirm',
    );
    if (confirmados.length === 0) return;

    setProcessando(true);
    let ok = 0;
    let erro = 0;
    for (const tx of confirmados) {
      try {
        await createCaixa.mutateAsync({
          type: tx.type,
          description: tx.description || 'Conciliação',
          value: tx.value,
          date: tx.date,
          category: 'conciliacao',
          notes: 'Conciliação bancária',
        });
        ok++;
      } catch {
        erro++;
        continue;
      }
      const contaPagarId = decisions[tx.id]?.contaPagarId;
      if (contaPagarId) {
        try {
          await pagarConta.mutateAsync({
            id: contaPagarId,
            dataPagamento: tx.date,
            valorPago: tx.value,
            formaPagamento: 'Transferência',
          });
        } catch {
          // Não fatal: o lançamento de caixa já foi criado.
        }
      }
    }
    setProcessando(false);

    if (ok > 0) {
      toast.success(`${ok} lançamento(s) registrado(s) com sucesso.`);
    }
    if (erro > 0) {
      toast.error(`${erro} lançamento(s) falharam.`);
    }
    if (ok > 0) {
      const restantes = transactions.filter(
        (tx) => decisions[tx.id]?.action !== 'confirm',
      );
      const novasDecisoes: Record<string, Decision> = {};
      for (const tx of restantes) novasDecisoes[tx.id] = decisions[tx.id];
      setTransactions(restantes);
      setDecisions(novasDecisoes);
    }
  }

  if (contasQuery.isLoading) {
    return <Spinner label="Carregando conciliação..." />;
  }

  if (transactions.length === 0) {
    return <UploadScreen onFile={carregarArquivo} />;
  }

  const { confirmadas, ignoradas, pendentes } = contarDecisoes(decisions);

  return (
    <>
      <PageHeader
        title="Conciliação Bancária"
        subtitle={`${transactions.length} transaç${
          transactions.length === 1 ? 'ão' : 'ões'
        } · ${confirmadas} confirmada${confirmadas === 1 ? '' : 's'}`}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTransactions([]);
                setDecisions({});
              }}
            >
              ← Novo arquivo
            </Button>
            <Button
              onClick={lancarConfirmados}
              disabled={confirmadas === 0 || processando}
            >
              {processando
                ? 'Processando...'
                : `✓ Lançar ${confirmadas} confirmado${
                    confirmadas === 1 ? '' : 's'
                  }`}
            </Button>
          </>
        }
      />

      <div
        style={{
          display: 'flex',
          gap: 'var(--sp-md)',
          flexWrap: 'wrap',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <StatPill label="Total" count={transactions.length} cor="var(--color-text-muted)" />
        <StatPill label="Confirmadas" count={confirmadas} cor="var(--color-success)" />
        <StatPill label="Pendentes" count={pendentes} cor="var(--color-warning)" />
        <StatPill label="Ignoradas" count={ignoradas} cor="var(--color-text-muted)" />
      </div>

      <div>
        {transactions.map((tx) => (
          <TxRow
            key={tx.id}
            tx={tx}
            decision={
              decisions[tx.id] ?? {
                action: 'pending',
                contaPagarId: null,
                matches: [],
              }
            }
            onConfirm={(contaId) => setAction(tx.id, 'confirm', contaId)}
            onSkip={() => setAction(tx.id, 'skip', null)}
            onUndo={() => setAction(tx.id, 'pending', null)}
          />
        ))}
      </div>
    </>
  );
}

function StatPill({
  label,
  count,
  cor,
}: {
  label: string;
  count: number;
  cor: string;
}) {
  return (
    <Card
      style={{
        padding: 'var(--sp-sm) var(--sp-md)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 700, color: cor }}>{count}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        {label}
      </span>
    </Card>
  );
}

function UploadScreen({ onFile }: { onFile: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: 'var(--sp-lg)',
      }}
    >
      <Card style={{ maxWidth: 520, width: '100%', padding: 'var(--sp-xl)' }}>
        <div style={{ marginBottom: 'var(--sp-lg)' }}>
          <h1 className="page-title">Conciliação Bancária</h1>
          <p className="page-subtitle">
            Importe seu extrato bancário e reconcilie com contas a pagar
          </p>
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              fileRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files?.[0];
            if (file) onFile(file);
          }}
          style={{
            border: `2.5px dashed ${
              dragOver ? 'var(--color-primary)' : 'var(--color-border)'
            }`,
            borderRadius: 12,
            padding: 'var(--sp-xl) var(--sp-lg)',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'var(--color-surface)' : 'var(--color-bg)',
          }}
        >
          <div style={{ fontSize: 42, marginBottom: 'var(--sp-md)' }}>🏦</div>
          <p
            style={{
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 'var(--sp-sm)',
              color: 'var(--color-text-muted)',
            }}
          >
            Arraste seu extrato aqui
          </p>
          <p
            style={{
              fontSize: 13,
              color: 'var(--color-text-muted)',
              marginBottom: 'var(--sp-md)',
            }}
          >
            ou clique para selecionar
          </p>
          <p
            style={{
              fontSize: 12,
              color: 'var(--color-text-muted)',
              opacity: 0.7,
            }}
          >
            Aceita: .ofx · .csv · .txt
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".ofx,.csv,.txt,.OFX,.CSV,.TXT"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onFile(file);
            }}
          />
        </div>
      </Card>
    </div>
  );
}

interface TxRowProps {
  tx: BankTransaction;
  decision: Decision;
  onConfirm: (contaPagarId: string | null) => void;
  onSkip: () => void;
  onUndo: () => void;
}

function TxRow({ tx, decision, onConfirm, onSkip, onUndo }: TxRowProps) {
  const { action, matches } = decision;
  const borderColor =
    action === 'confirm'
      ? 'var(--color-success)'
      : action === 'skip'
        ? 'var(--color-text-muted)'
        : matches.length > 0
          ? 'var(--color-warning)'
          : 'var(--color-border)';
  const valueColor =
    tx.type === 'entrada' ? 'var(--color-success)' : 'var(--color-danger)';
  const valueSign = tx.type === 'entrada' ? '+' : '-';

  return (
    <div
      style={{
        borderLeft: `4px solid ${borderColor}`,
        background: 'var(--color-surface)',
        borderRadius: '0 8px 8px 0',
        padding: 'var(--sp-md)',
        marginBottom: 'var(--sp-md)',
        display: 'flex',
        gap: 'var(--sp-md)',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 180, maxWidth: 220 }}>
        <div
          style={{
            fontSize: 13,
            color: 'var(--color-text-muted)',
            marginBottom: 2,
          }}
        >
          {formatDateBR(tx.date)}
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: valueColor,
            marginBottom: 4,
          }}
        >
          {valueSign}
          {formatBRL(tx.value)}
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--color-text-muted)',
            wordBreak: 'break-word',
          }}
        >
          {tx.description}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {action === 'confirm' ? (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--color-success)',
            }}
          >
            ✓ {decision.contaPagarId ? 'Vinculada' : 'Confirmada (sem vínculo)'}
          </div>
        ) : action === 'skip' ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Ignorada
          </div>
        ) : matches.length === 0 ? (
          <div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                marginBottom: 6,
              }}
            >
              Nenhuma conta correspondente
            </div>
            <Button size="sm" variant="secondary" onClick={() => onConfirm(null)}>
              Lançar sem vincular
            </Button>
          </div>
        ) : (
          matches.map((match) => (
            <div
              key={match.conta.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 'var(--sp-sm) var(--sp-md)',
                marginBottom: 6,
                background: 'var(--color-bg)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                  {match.conta.descricao}
                </div>
                <div
                  style={{ fontSize: 12, color: 'var(--color-text-muted)' }}
                >
                  Vcto: {formatDateBR(match.conta.dataVencimento ?? '')} ·{' '}
                  {formatBRL(Number(match.conta.valor) || 0)} ·{' '}
                  <span
                    style={{ color: 'var(--color-primary)', fontWeight: 600 }}
                  >
                    {Math.min(100, match.score)}%
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <Button size="sm" onClick={() => onConfirm(match.conta.id)}>
                  ✓ Confirmar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onConfirm(null)}
                >
                  Sem vínculo
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ flexShrink: 0 }}>
        {action === 'pending' ? (
          <Button size="sm" variant="secondary" onClick={onSkip}>
            ⏭ Ignorar
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={onUndo}>
            ↩ Desfazer
          </Button>
        )}
      </div>
    </div>
  );
}
