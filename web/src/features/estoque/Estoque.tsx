import { Fragment, useCallback, useMemo, useState } from 'react';
import Button from '../../components/ui/button';
import Card from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import Spinner from '../../components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/native-select';
import { toast } from 'sonner';
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
import DataTable, { type Column } from '../../components/ui/data-table';
import {
  AjusteModal,
  ComprarModal,
  EnviarObraModal,
  UseiObraModal,
  VoltouObraModal,
} from './MovimentacaoModais';

type Aba = 'geral' | 'historico';

/** Chip de saldo por almoxarifado — usado na linha expansível. */
function SaldoChip({
  icon,
  nome,
  qtd,
  unidade,
  destaque,
}: {
  icon: string;
  nome: string;
  qtd: number;
  unidade?: string;
  destaque?: boolean;
}) {
  const zero = qtd <= 0;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 8,
        background: zero
          ? 'rgba(148,163,184,.10)'
          : destaque
            ? 'rgba(59,130,246,.10)'
            : 'rgba(16,185,129,.10)',
        border: `1px solid ${
          zero
            ? 'rgba(148,163,184,.25)'
            : destaque
              ? 'rgba(59,130,246,.35)'
              : 'rgba(16,185,129,.35)'
        }`,
        fontSize: 13,
        color: zero ? '#94A3B8' : 'var(--color-text)',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontWeight: 500 }}>{nome}</span>
      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
        {qtd.toFixed(2)}
      </strong>
      {unidade && (
        <span className="text-muted" style={{ fontSize: 11 }}>
          {unidade}
        </span>
      )}
    </div>
  );
}

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
  const visaoQuery = useVisaoGeral();
  const movsQuery = useMovimentacoes();
  const reverter = useReverterMovimentacao();

  const [aba, setAba] = useState<Aba>('geral');
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  // Linhas expandidas. Persistido em sessão pra não perder ao trocar de aba.
  const [expandidos, setExpandidos] = useState<Set<string>>(() => new Set());
  function toggleExpand(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const almoxs = useMemo(
    () => visaoQuery.data?.almoxarifados ?? [],
    [visaoQuery.data],
  );
  const itens = useMemo(() => visaoQuery.data?.itens ?? [], [visaoQuery.data]);

  const handleReverter = useCallback((m: Movimentacao) => {
    if (!window.confirm('Reverter esta movimentação? O saldo será ajustado de volta.')) return;
    reverter.mutate(m.id, {
      onSuccess: () => toast.success('Movimentação revertida'),
      onError: (e) => toast.error(e.message),
    });
  }, [reverter]);

  const historicoColumns = useMemo((): Column<Movimentacao>[] => [
    {
      id: 'data', header: 'Data', sortable: true, sortAccessor: (m) => m.data ?? '',
      cell: (m) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateBR(m.data)}</span>,
    },
    { id: 'mov', header: 'Movimentação', cell: (m) => movTexto(m, almoxs) },
    {
      id: 'acao', header: '', hideable: false,
      cell: (m) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="secondary" onClick={() => handleReverter(m)} title="Reverter movimentação">
            ↩️
          </Button>
        </div>
      ),
    },
  ] as Column<Movimentacao>[], [almoxs, handleReverter]);

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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: 36 }}></TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead style={{ width: 110, textAlign: 'center' }}>Σ Total</TableHead>
                      <TableHead style={{ width: 90, textAlign: 'center' }}>Status</TableHead>
                      <TableHead style={{ width: 320, textAlign: 'center' }}>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-muted"
                          style={{ padding: 'var(--sp-md)' }}
                        >
                          Nenhum item no filtro
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtrados.map((item) => {
                        const total = saldoTotal(item);
                        const abaixo = abaixoMinimo(item);
                        const saldoCentral = central
                          ? saldoEm(item, central.id)
                          : 0;
                        const aberto = expandidos.has(item.id);
                        return (
                          <Fragment key={item.id}>
                            <TableRow
                              onClick={() => toggleExpand(item.id)}
                              style={{
                                background: aberto
                                  ? 'rgba(59,130,246,.04)'
                                  : undefined,
                              }}
                            >
                              <TableCell
                                aria-label={aberto ? 'Recolher' : 'Expandir'}
                                style={{
                                  textAlign: 'center',
                                  color: '#64748B',
                                  fontSize: 12,
                                }}
                              >
                                {aberto ? '▾' : '▸'}
                              </TableCell>
                              <TableCell>
                                <strong>{item.descricao}</strong>
                                <div
                                  className="text-muted"
                                  style={{ fontSize: 12 }}
                                >
                                  {item.codigo ? `cod. ${item.codigo} · ` : ''}
                                  {item.unidade}
                                  {item.categoria && ` · ${item.categoria}`}
                                  {' · '}
                                  custo {formatBRL(Number(item.custoMedio) || 0)}
                                </div>
                                {abaixo && (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: 'var(--color-danger)',
                                    }}
                                  >
                                    ⚠ abaixo do mínimo (
                                    {Number(item.estoqueMinimo) || 0})
                                  </div>
                                )}
                              </TableCell>
                              <TableCell
                                style={{
                                  textAlign: 'center',
                                  fontWeight: 800,
                                  fontVariantNumeric: 'tabular-nums',
                                  fontSize: 16,
                                }}
                              >
                                {total.toFixed(2)}
                                <div
                                  className="text-muted"
                                  style={{ fontSize: 11, fontWeight: 400 }}
                                >
                                  {item.unidade}
                                </div>
                              </TableCell>
                              <TableCell
                                style={{ textAlign: 'center' }}
                                title={
                                  abaixo
                                    ? 'Abaixo do mínimo'
                                    : 'Estoque saudável'
                                }
                              >
                                <span
                                  style={{
                                    fontSize: 18,
                                    color: abaixo
                                      ? 'var(--color-danger)'
                                      : 'var(--color-success)',
                                  }}
                                >
                                  {abaixo ? '⚠' : '✓'}
                                </span>
                              </TableCell>
                              <TableCell
                                style={{ whiteSpace: 'nowrap', textAlign: 'center' }}
                                onClick={(e) => e.stopPropagation()}
                              >
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
                                  onClick={() =>
                                    setModal({ type: 'enviar', item })
                                  }
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
                              </TableCell>
                            </TableRow>
                            {aberto && (
                              <TableRow
                                style={{
                                  background: 'rgba(59,130,246,.04)',
                                }}
                              >
                                <TableCell></TableCell>
                                <TableCell colSpan={4} style={{ padding: '8px 12px 14px' }}>
                                  <div
                                    className="text-muted"
                                    style={{
                                      fontSize: 11,
                                      textTransform: 'uppercase',
                                      letterSpacing: '.05em',
                                      marginBottom: 6,
                                    }}
                                  >
                                    Saldo por local
                                  </div>
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: 8,
                                    }}
                                  >
                                    {central && (
                                      <SaldoChip
                                        icon="🏠"
                                        nome="Central"
                                        qtd={saldoCentral}
                                        unidade={item.unidade}
                                        destaque
                                      />
                                    )}
                                    {obras.map((o) => (
                                      <SaldoChip
                                        key={o.id}
                                        icon="🏗️"
                                        nome={o.contractName || o.nome}
                                        qtd={saldoEm(item, o.id)}
                                        unidade={item.unidade}
                                      />
                                    ))}
                                    {!central && obras.length === 0 && (
                                      <span
                                        className="text-muted"
                                        style={{ fontSize: 13 }}
                                      >
                                        Nenhum almoxarifado cadastrado.
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )
      ) : movsQuery.data && movsQuery.data.length > 0 ? (
        <DataTable
          rows={movsQuery.data}
          columns={historicoColumns}
          rowKey={(m) => m.id}
          emptyMessage="Nenhuma movimentação ainda."
          searchPlaceholder="Buscar movimentações..."
          globalFilterFn={(m, q) => movTexto(m, almoxs).toLowerCase().includes(q)}
        />
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
        <Dialog open onOpenChange={(next) => !next && setModal(null)}>
          <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Mais opções</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setModal(null)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
