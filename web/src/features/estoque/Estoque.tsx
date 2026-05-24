import { useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import { Input, Select } from '../../components/ui/controls';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import type { Almoxarifado, EstoqueItem, Movimentacao } from './types';
import {
  abaixoMinimo,
  almoxCentral,
  almoxsObras,
  saldoEm,
  saldoTotal,
} from './saldo';
import { useMovimentacoes, useReverterMovimentacao, useVisaoGeral } from './queries';
import ItemModal from './ItemModal';
import {
  AjusteModal,
  ComprarModal,
  EnviarObraModal,
  UseiObraModal,
  VoltouObraModal,
} from './MovimentacaoModais';

type Aba = 'geral' | 'historico';

type ModalState =
  | { type: 'novoItem' }
  | {
      type: 'editItem' | 'comprei' | 'enviar' | 'usei' | 'voltou' | 'ajuste' | 'mais';
      item: EstoqueItem;
    }
  | null;

function Kpi({
  label,
  value,
  cor,
}: {
  label: string;
  value: string | number;
  cor: string;
}) {
  return (
    <Card style={{ padding: 12, borderLeft: `3px solid ${cor}` }}>
      <div className="text-muted" style={{ fontSize: 13 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor }}>{value}</div>
    </Card>
  );
}

/** Texto amigável de uma movimentação. */
function movTexto(m: Movimentacao, almoxs: Almoxarifado[]): string {
  const central = almoxCentral(almoxs);
  const isCentral = (id?: string) => Boolean(central && id === central.id);
  const nomeAlmox = (id?: string): string => {
    if (!id) return '—';
    if (isCentral(id)) return '🏠 Central';
    const a = almoxs.find((x) => x.id === id);
    return a ? `🏗️ ${a.contractName || a.nome}` : 'Almox removido';
  };
  const qtd = `${Number(m.quantidade).toFixed(2)} ${m.unidade ?? ''}`;
  const item = m.itemDesc || '?';
  if (m.tipo === 'entrada') {
    return `🟢 Recebi ${qtd} de ${item} no ${nomeAlmox(m.almoxarifadoDestinoId)}`;
  }
  if (m.tipo === 'saida') {
    return `🔴 Usei ${qtd} de ${item} em ${
      m.contractName || nomeAlmox(m.almoxarifadoOrigemId)
    }`;
  }
  if (m.tipo === 'transferencia') {
    const icon = isCentral(m.almoxarifadoOrigemId) ? '🔵' : '🟡';
    const verbo = isCentral(m.almoxarifadoOrigemId) ? 'Enviei' : 'Voltou';
    return `${icon} ${verbo} ${qtd} de ${item}: ${nomeAlmox(
      m.almoxarifadoOrigemId,
    )} → ${nomeAlmox(m.almoxarifadoDestinoId)}`;
  }
  return `🟠 Ajuste de ${qtd} em ${item} (${nomeAlmox(
    m.almoxarifadoDestinoId || m.almoxarifadoOrigemId,
  )})`;
}

/** Almoxarifado / Estoque — matriz item × almoxarifado. */
export default function Estoque() {
  const toast = useToast();
  const visaoQuery = useVisaoGeral();
  const movsQuery = useMovimentacoes();
  const reverter = useReverterMovimentacao();

  const [aba, setAba] = useState<Aba>('geral');
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [modal, setModal] = useState<ModalState>(null);

  const almoxs = useMemo(
    () => visaoQuery.data?.almoxarifados ?? [],
    [visaoQuery.data],
  );
  const itens = useMemo(() => visaoQuery.data?.itens ?? [], [visaoQuery.data]);

  if (visaoQuery.isLoading) {
    return <Spinner label="Carregando estoque..." />;
  }
  if (visaoQuery.isError) {
    return <div className="error-banner">Erro ao carregar o estoque.</div>;
  }

  const central = almoxCentral(almoxs);
  const obras = almoxsObras(almoxs);
  const valorTotal = itens.reduce(
    (s, i) => s + saldoTotal(i) * (Number(i.custoMedio) || 0),
    0,
  );
  const abaixoMin = itens.filter(abaixoMinimo).length;

  const categorias = [
    ...new Set(itens.map((i) => i.categoria).filter(Boolean)),
  ].sort() as string[];

  const termo = busca.toLowerCase().trim();
  const filtrados = itens.filter((i) => {
    if (filtroCategoria && i.categoria !== filtroCategoria) return false;
    if (!termo) return true;
    return [i.descricao, i.codigo, i.categoria].some((c) =>
      String(c ?? '').toLowerCase().includes(termo),
    );
  });

  function handleReverter(m: Movimentacao) {
    if (
      !window.confirm(
        'Reverter esta movimentação? O saldo será ajustado de volta.',
      )
    ) {
      return;
    }
    reverter.mutate(m.id, {
      onSuccess: () => toast.show('Movimentação revertida', 'success'),
      onError: (e) => toast.show(e.message, 'danger'),
    });
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">📦 Almoxarifado</h1>
          <p className="page-subtitle">
            Controle simples — Central + 1 almoxarifado por obra
          </p>
        </div>
        <Button onClick={() => setModal({ type: 'novoItem' })}>
          + Novo item
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 8,
          marginBottom: 'var(--sp-md)',
        }}
      >
        <Kpi label="Itens cadastrados" value={itens.length} cor="#3b82f6" />
        <Kpi label="Valor em estoque" value={formatBRL(valorTotal)} cor="#8b5cf6" />
        <Kpi
          label="Abaixo do mínimo"
          value={abaixoMin}
          cor={abaixoMin > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
        />
        <Kpi label="Obras com estoque" value={obras.length} cor="#f59e0b" />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 2,
          marginBottom: 'var(--sp-md)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {(
          [
            ['geral', '📊 Visão geral'],
            ['historico', '🔁 Histórico'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setAba(key)}
            style={{
              padding: '10px 16px',
              background: aba === key ? 'var(--color-primary)' : 'transparent',
              color: aba === key ? '#fff' : 'var(--color-text)',
              border: 'none',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              fontWeight: aba === key ? 700 : 500,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'geral' ? (
        itens.length === 0 ? (
          <Card style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>📦</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              Nenhum item cadastrado
            </div>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Comece cadastrando um item no botão acima.
            </div>
          </Card>
        ) : (
          <>
            <Card
              style={{
                padding: 'var(--sp-md)',
                marginBottom: 'var(--sp-md)',
                display: 'grid',
                gridTemplateColumns: '1fr 220px',
                gap: 8,
              }}
            >
              <Input
                placeholder="🔎 Buscar por descrição, código ou categoria..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <Select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
              >
                <option value="">Todas categorias</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Card>

            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Categoria</th>
                      <th style={{ textAlign: 'center' }}>🏠 Central</th>
                      {obras.map((o) => (
                        <th key={o.id} style={{ textAlign: 'center' }}>
                          🏗️ {o.contractName || o.nome}
                        </th>
                      ))}
                      <th style={{ textAlign: 'center' }}>Σ Total</th>
                      <th style={{ textAlign: 'right' }}>Custo médio</th>
                      <th style={{ textAlign: 'center' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5 + obras.length + 2}
                          className="text-center text-muted"
                          style={{ padding: 'var(--sp-md)' }}
                        >
                          Nenhum item no filtro
                        </td>
                      </tr>
                    ) : (
                      filtrados.map((item) => {
                        const total = saldoTotal(item);
                        const abaixo = abaixoMinimo(item);
                        const saldoCentral = central
                          ? saldoEm(item, central.id)
                          : 0;
                        return (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.descricao}</strong>
                              <div className="text-muted" style={{ fontSize: 12 }}>
                                {item.codigo ? `cod. ${item.codigo} · ` : ''}
                                {item.unidade}
                              </div>
                              {abaixo && (
                                <div
                                  style={{ fontSize: 11, color: 'var(--color-danger)' }}
                                >
                                  ⚠ abaixo do mínimo (
                                  {Number(item.estoqueMinimo) || 0})
                                </div>
                              )}
                            </td>
                            <td>
                              <span className="badge" style={{ fontSize: 11 }}>
                                {item.categoria || '—'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>
                              {saldoCentral.toFixed(2)}
                            </td>
                            {obras.map((o) => (
                              <td key={o.id} style={{ textAlign: 'center' }}>
                                {saldoEm(item, o.id).toFixed(2)}
                              </td>
                            ))}
                            <td
                              style={{ textAlign: 'center', fontWeight: 700 }}
                            >
                              {total.toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {formatBRL(Number(item.custoMedio) || 0)}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <Button
                                size="sm"
                                variant="success"
                                onClick={() =>
                                  setModal({ type: 'comprei', item })
                                }
                              >
                                🟢 Comprei
                              </Button>{' '}
                              <Button
                                size="sm"
                                onClick={() => setModal({ type: 'enviar', item })}
                                disabled={saldoCentral <= 0}
                              >
                                🔵 Enviar
                              </Button>{' '}
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => setModal({ type: 'usei', item })}
                              >
                                🔴 Usei
                              </Button>{' '}
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setModal({ type: 'mais', item })}
                              >
                                ⋯
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )
      ) : movsQuery.data && movsQuery.data.length > 0 ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Data</th>
                  <th>Movimentação</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {movsQuery.data.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatDateBR(m.data)}
                    </td>
                    <td>{movTexto(m, almoxs)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleReverter(m)}
                        title="Reverter movimentação"
                      >
                        ↩️
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}>
          <span className="text-muted">
            Nenhuma movimentação ainda. Use os botões da Visão Geral.
          </span>
        </Card>
      )}

      {modal?.type === 'novoItem' && (
        <ItemModal item={null} almoxs={almoxs} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'editItem' && (
        <ItemModal
          item={modal.item}
          almoxs={almoxs}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'comprei' && (
        <ComprarModal
          item={modal.item}
          almoxs={almoxs}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'enviar' && (
        <EnviarObraModal
          item={modal.item}
          almoxs={almoxs}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'usei' && (
        <UseiObraModal
          item={modal.item}
          almoxs={almoxs}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'voltou' && (
        <VoltouObraModal
          item={modal.item}
          almoxs={almoxs}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'ajuste' && (
        <AjusteModal
          item={modal.item}
          almoxs={almoxs}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'mais' && (
        <Modal
          open
          title="Mais opções"
          onClose={() => setModal(null)}
          footer={
            <Button variant="secondary" onClick={() => setModal(null)}>
              Fechar
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() => setModal({ type: 'voltou', item: modal.item })}
            >
              🟡 Voltou da obra
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModal({ type: 'ajuste', item: modal.item })}
            >
              🟠 Corrigir saldo
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModal({ type: 'editItem', item: modal.item })}
            >
              ✏️ Editar item
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
