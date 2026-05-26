import { useCallback, useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { formatDateBR } from '../../lib/formatDate';
import type { ContratoTabProps } from './ContratoDetail';
import type { Rdo } from './types';
import { moTotal, rdoCompliance } from './rdoCompliance';
import { useDeleteRdo } from './queries';
import { exportRdoPdf } from './exportRdoPdf';
import RdoDetailModal from './RdoDetailModal';
import RdoFormModal from './RdoFormModal';
import RdoFotosModal from './RdoFotosModal';
import DataTable, { type Column } from '../../components/ui/DataTable';

const n = (v: unknown): number => Number(v) || 0;

const CLIMA_ICONE: Record<string, string> = {
  bom: '☀️',
  chuva: '🌧️',
  nublado: '⛅',
};

const ALERTA_ESTILO: Record<
  string,
  { bg: string; cor: string; borda: string }
> = {
  erro: { bg: '#fee2e2', cor: '#991b1b', borda: '#fca5a5' },
  aviso: { bg: '#fef3c7', cor: '#92400e', borda: '#fcd34d' },
  info: { bg: '#dbeafe', cor: '#1e3a8a', borda: '#93c5fd' },
};

type ModalState =
  | { tipo: 'detalhe'; rdo: Rdo }
  | { tipo: 'form'; rdo: Rdo | null }
  | { tipo: 'fotos'; rdo: Rdo }
  | null;

/** Clima da manhã, lendo `tempo` como objeto (ignora formato string). */
function climaManha(rdo: Rdo): string {
  const t = typeof rdo.tempo === 'object' && rdo.tempo ? rdo.tempo : {};
  const manha = (t as Record<string, unknown>).manha as
    | Record<string, unknown>
    | undefined;
  return CLIMA_ICONE[String(manha?.tempo ?? '')] ?? '—';
}

function segBadge(rdo: Rdo) {
  const seg = rdo.seguranca ?? {};
  const acidente = String(seg.acidente ?? 'nao_houve');
  if (acidente === 'nao_houve') {
    return (
      <Badge style={{ background: '#D1FAE5', color: '#047857' }}>OK</Badge>
    );
  }
  if (acidente === 'sem_afastamento') {
    return (
      <Badge style={{ background: '#FEF3C7', color: '#B45309' }}>S/ Afast.</Badge>
    );
  }
  return (
    <Badge style={{ background: '#FEE2E2', color: '#B91C1C' }}>C/ Afast.</Badge>
  );
}

/** Aba RDO do contrato — lista de Relatórios Diários de Obra. */
export default function RdoTab({ contract }: ContratoTabProps) {
  const deletar = useDeleteRdo();
  const [modal, setModal] = useState<ModalState>(null);

  const rdos = useMemo(
    () =>
      ((contract.rdos as Rdo[] | undefined) ?? [])
        .slice()
        .sort((a, b) =>
          String(b.data ?? '').localeCompare(String(a.data ?? '')),
        ),
    [contract.rdos],
  );

  const compliance = rdoCompliance(rdos, contract.status);
  const alerta = compliance.nivel ? ALERTA_ESTILO[compliance.nivel] : null;

  const handleExcluir = useCallback(
    (rdo: Rdo) => {
      if (!window.confirm(`Excluir o RDO #${rdo.numero ?? ''}?`)) return;
      deletar.mutate(
        { contractId: contract.id, rdoId: rdo.id },
        {
          onSuccess: () => toast.success('RDO excluído'),
          onError: (e) => toast.error(e.message),
        },
      );
    },
    [contract.id, deletar],
  );

  const handlePdf = useCallback(
    async (rdo: Rdo) => {
      try {
        await exportRdoPdf(rdo, contract);
      } catch {
        toast.error('Falha ao gerar o PDF');
      }
    },
    [contract],
  );

  const columns = useMemo<Column<Rdo>[]>(
    () => [
      {
        id: 'numero',
        header: 'Nº',
        sortable: true,
        sortAccessor: (r) => Number(r.numero ?? 0),
        cell: (r) => (
          <strong style={{ color: 'var(--color-primary)' }}>#{r.numero}</strong>
        ),
      },
      {
        id: 'data',
        header: 'Data',
        sortable: true,
        sortAccessor: (r) => String(r.data ?? ''),
        cell: (r) => (
          <>
            <strong>{formatDateBR(r.data)}</strong>
            {r.diaSemana && (
              <div className="text-muted" style={{ fontSize: 12 }}>
                {r.diaSemana}
              </div>
            )}
          </>
        ),
      },
      {
        id: 'clima',
        header: 'Clima',
        cell: (r) => <span style={{ fontSize: 18 }}>{climaManha(r)}</span>,
      },
      {
        id: 'mo',
        header: 'MO Total',
        align: 'center',
        cell: (r) => <strong>{moTotal(r)}</strong>,
      },
      {
        id: 'equipamentos',
        header: 'Equip.',
        align: 'center',
        cell: (r) =>
          (r.equipamentos ?? []).reduce(
            (s, x) => s + n(x.qtd ?? x.quantidade),
            0,
          ),
      },
      {
        id: 'atividades',
        header: 'Atividades',
        align: 'center',
        cell: (r) => (r.atividades ?? []).length,
      },
      {
        id: 'fotos',
        header: 'Fotos',
        align: 'center',
        cell: (r) => {
          const qty = (r.fotos ?? []).length;
          return qty > 0 ? `📷 ${qty}` : '—';
        },
      },
      {
        id: 'seguranca',
        header: 'Segurança',
        cell: (r) => segBadge(r),
      },
      {
        id: 'acoes',
        header: 'Ações',
        hideable: false,
        cell: (r) => (
          <div
            className="actions-cell"
            onClick={(e) => e.stopPropagation()}
          >
            <a
              className="action-link"
              style={{ cursor: 'pointer' }}
              onClick={() => setModal({ tipo: 'detalhe', rdo: r })}
            >
              Ver
            </a>
            <a
              className="action-link"
              style={{ cursor: 'pointer' }}
              onClick={() => setModal({ tipo: 'form', rdo: r })}
            >
              Editar
            </a>
            <a
              className="action-link"
              style={{ cursor: 'pointer' }}
              onClick={() => setModal({ tipo: 'fotos', rdo: r })}
            >
              📷 Fotos
            </a>
            <a
              className="action-link"
              style={{ cursor: 'pointer' }}
              onClick={() => void handlePdf(r)}
            >
              📄 PDF
            </a>
            <a
              className="action-link danger"
              style={{ cursor: 'pointer' }}
              onClick={() => handleExcluir(r)}
            >
              Excluir
            </a>
          </div>
        ),
      },
    ],
    [setModal, handleExcluir, handlePdf],
  );

  return (
    <>
      {alerta && (
        <div
          style={{
            background: alerta.bg,
            color: alerta.cor,
            border: `1px solid ${alerta.borda}`,
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 'var(--sp-md)',
            fontSize: 14,
          }}
        >
          {compliance.mensagem}
        </div>
      )}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--sp-md) var(--sp-lg)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>
            Relatórios Diários de Obra (RDO)
          </h3>
          <Button size="sm" onClick={() => setModal({ tipo: 'form', rdo: null })}>
            + Novo RDO
          </Button>
        </div>
        <div style={{ padding: '0 var(--sp-lg) var(--sp-lg)' }}>
          <DataTable
            rows={rdos}
            columns={columns}
            rowKey={(r) => r.id}
            onRowClick={(r) => setModal({ tipo: 'detalhe', rdo: r })}
            emptyMessage="Nenhum RDO registrado."
            searchPlaceholder="Buscar por nº ou data…"
            globalFilterFn={(r, q) =>
              String(r.numero ?? '').includes(q) ||
              formatDateBR(r.data).toLowerCase().includes(q)
            }
          />
        </div>
      </Card>

      {modal?.tipo === 'detalhe' && (
        <RdoDetailModal
          rdo={modal.rdo}
          contract={contract}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'form' && (
        <RdoFormModal
          contract={contract}
          rdo={modal.rdo}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'fotos' && (
        <RdoFotosModal
          contractId={contract.id}
          rdo={modal.rdo}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
