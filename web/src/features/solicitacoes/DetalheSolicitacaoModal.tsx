import type { ReactNode } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { formatBRL } from '../../lib/format';
import { useContracts } from '../contracts/queries';
import type { SolicitacaoCompra } from '../../types/domain';
import { etapaCfg, fmtDataHora, parseItens } from './etapa';

/** Marco concluído da linha do tempo. */
function Marco({
  cor,
  icone,
  titulo,
  sub,
}: {
  cor: string;
  icone: string;
  titulo: string;
  sub: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: cor,
          marginTop: 4,
          flexShrink: 0,
          boxShadow: `0 0 0 3px ${cor}33`,
        }}
      />
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          {icone} {titulo}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

/** Marco pendente (aguardando). */
function Aguardando({ titulo }: { titulo: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        marginBottom: 14,
        opacity: 0.55,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#D1D5DB',
          marginTop: 4,
          flexShrink: 0,
          border: '2px dashed #6B7280',
        }}
      />
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>⏳ {titulo}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>—</div>
      </div>
    </div>
  );
}

/** Linha do tempo da solicitação. */
function Timeline({ s }: { s: SolicitacaoCompra }) {
  const marcos: ReactNode[] = [
    <Marco
      key="sol"
      cor="#3B82F6"
      icone="📝"
      titulo="Solicitada"
      sub={`${s.solicitanteNome || '—'} · ${fmtDataHora(s.createdAt)}`}
    />,
  ];

  if (s.status === 'cancelada') {
    marcos.push(
      <Marco
        key="canc"
        cor="#6B7280"
        icone="🚫"
        titulo="Cancelada"
        sub={
          <>
            {s.avaliadorNome || '—'} (Equipe de compras) ·{' '}
            {fmtDataHora(s.canceladoEm)}
            {s.motivoCancelamento && (
              <>
                <br />
                <em>Motivo: {s.motivoCancelamento}</em>
              </>
            )}
          </>
        }
      />,
    );
    return <>{marcos}</>;
  }

  if (s.avaliadoEm) {
    marcos.push(
      <Marco
        key="aval"
        cor="#F59E0B"
        icone="💰"
        titulo={`Avaliada (${formatBRL(Number(s.valorTotal) || 0)})`}
        sub={`${s.avaliadorNome || '—'} (Equipe de compras) · ${fmtDataHora(
          s.avaliadoEm,
        )}`}
      />,
    );
  } else {
    marcos.push(
      <Aguardando key="aval-w" titulo="Aguardando avaliação da equipe de compras" />,
    );
    return <>{marcos}</>;
  }

  if (s.status === 'rejeitada') {
    marcos.push(
      <Marco
        key="rej"
        cor="#EF4444"
        icone="❌"
        titulo="Rejeitada"
        sub={
          <>
            {s.aprovadorNome || '—'} (Gerente) · {fmtDataHora(s.aprovadoEm)}
            {s.motivoRejeicao && (
              <>
                <br />
                <em>Motivo: {s.motivoRejeicao}</em>
              </>
            )}
          </>
        }
      />,
    );
    return <>{marcos}</>;
  }

  if (s.aprovadoEm) {
    marcos.push(
      <Marco
        key="aprov"
        cor="#3B82F6"
        icone="✅"
        titulo="Aprovada"
        sub={`${s.aprovadorNome || '—'} (Gerente) · ${fmtDataHora(s.aprovadoEm)}`}
      />,
    );
  } else {
    marcos.push(
      <Aguardando key="aprov-w" titulo="Aguardando aprovação do gerente" />,
    );
    return <>{marcos}</>;
  }

  if (s.compradoEm) {
    marcos.push(
      <Marco
        key="compr"
        cor="#6366F1"
        icone="📦"
        titulo="Comprada"
        sub={
          <>
            {s.compradorNome || '—'} (Equipe de compras) ·{' '}
            {fmtDataHora(s.compradoEm)}
            {s.numeroPedido && (
              <>
                <br />
                Pedido: <code>{s.numeroPedido}</code>
              </>
            )}
          </>
        }
      />,
    );
  } else {
    marcos.push(
      <Aguardando key="compr-w" titulo="Aguardando compra pela equipe de compras" />,
    );
    return <>{marcos}</>;
  }

  if (s.recebidoEm) {
    marcos.push(
      <Marco
        key="receb"
        cor="#10B981"
        icone="🏭"
        titulo="Recebida (estoque atualizado)"
        sub={
          <>
            {s.recebedorNome || '—'} · {fmtDataHora(s.recebidoEm)}
            {s.nfRecebimento && (
              <>
                <br />
                NF: <code>{s.nfRecebimento}</code>
              </>
            )}
          </>
        }
      />,
    );
  } else {
    marcos.push(
      <Aguardando key="receb-w" titulo="Aguardando chegada do material" />,
    );
  }

  return <>{marcos}</>;
}

interface DetalheSolicitacaoModalProps {
  solicitacao: SolicitacaoCompra;
  onClose: () => void;
}

/** Modal de detalhe da solicitação — linha do tempo + itens. */
export default function DetalheSolicitacaoModal({
  solicitacao: s,
  onClose,
}: DetalheSolicitacaoModalProps) {
  const contractsQuery = useContracts();
  const itens = parseItens(s.itens);
  const contrato = (contractsQuery.data ?? []).find(
    (c) => c.id === s.contractId,
  );
  const cfg = etapaCfg(s.status);

  return (
    <Modal
      open
      title={`Solicitação #${s.numero ?? s.id.slice(-6)}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div style={{ marginBottom: 'var(--sp-md)' }}>
        <span
          className="badge"
          style={{ background: cfg.bg, color: cfg.color, fontWeight: 700 }}
        >
          {cfg.label}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 3fr',
          gap: 'var(--sp-lg)',
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 var(--sp-sm)', fontSize: 15 }}>
            Linha do tempo
          </h3>
          <Timeline s={s} />
        </div>
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 'var(--sp-md)',
              fontSize: 14,
            }}
          >
            <div>
              <strong>Destino:</strong>
              <br />
              {s.status === 'pendente_avaliacao'
                ? '(a definir)'
                : contrato
                  ? `🏗️ ${String(contrato.name ?? '')}`
                  : '🏢 Sede'}
            </div>
            <div>
              <strong>Valor total:</strong>
              <br />
              {s.status === 'pendente_avaliacao'
                ? '—'
                : formatBRL(Number(s.valorTotal) || 0)}
            </div>
          </div>
          {s.justificativa && (
            <div
              style={{
                padding: 10,
                background: 'var(--color-surface-2)',
                borderRadius: 6,
                marginBottom: 'var(--sp-md)',
                fontSize: 14,
              }}
            >
              <strong>Justificativa:</strong>
              <br />
              {s.justificativa}
            </div>
          )}
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>
            Itens ({itens.length})
          </h3>
          {itens.map((it, i) => {
            const esc = it.cotacoes?.[it.cotacaoEscolhidaIdx ?? 0];
            return (
              <div
                key={i}
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  marginBottom: 6,
                  fontSize: 13,
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between' }}
                >
                  <strong>
                    {it.descricao}
                    {it.tipo === 'aluguel' && ' 🔑'}
                  </strong>
                  <span>
                    qtd {it.qtd}
                    {it.precoUnit
                      ? ` · ${formatBRL(it.precoUnit)} = ${formatBRL(
                          it.qtd * it.precoUnit,
                        )}`
                      : ''}
                  </span>
                </div>
                {it.observacoes && (
                  <div
                    style={{ color: 'var(--color-text-muted)', fontSize: 12 }}
                  >
                    {it.observacoes}
                  </div>
                )}
                {esc && (
                  <div
                    style={{
                      color: 'var(--color-text-muted)',
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    Fornecedor: <strong>{esc.fornecedorNome || '—'}</strong>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
