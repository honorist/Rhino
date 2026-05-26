import { useMemo, useState } from 'react';
import Button from '../../components/ui/button';
import { Select } from '@/components/ui/native-select';
import DataTable, { type Column } from '../../components/ui/data-table';
import NovaSolicitacaoModal from './NovaSolicitacaoModal';
import SolicitacaoDetail from './SolicitacaoDetail';
import { useSolicitacoes } from './queries';
import {
  STATUS_SOLICITACAO_COR,
  STATUS_SOLICITACAO_LABEL,
  type SolicitacaoStatus,
} from './types';

/**
 * Tela "Recrutamento" — lista de solicitações + filtros + drill-in.
 * Acessível pelo menu RH (rota /recrutamento).
 */
export default function Recrutamento() {
  const [filtro, setFiltro] = useState<'todas' | SolicitacaoStatus>('todas');
  const { data, isLoading } = useSolicitacoes(filtro === 'todas' ? undefined : filtro);
  const [novaModal, setNovaModal] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const solicitacoes = data?.solicitacoes ?? [];

  type Sol = NonNullable<typeof solicitacoes>[number];

  const solColumns = useMemo((): Column<Sol>[] => [
    {
      id: 'solicitante',
      header: 'Solicitante',
      sortable: true,
      sortAccessor: (s) => s.solicitanteNome ?? '',
      cell: (s) => <strong>{s.solicitanteNome ?? '—'}</strong>,
    },
    {
      id: 'data',
      header: 'Data',
      sortable: true,
      sortAccessor: (s) => s.createdAt,
      cell: (s) => new Date(s.createdAt).toLocaleDateString('pt-BR'),
    },
    {
      id: 'vagas',
      header: 'Vagas',
      cell: (s) => {
        const totalVagas = (s.vagas ?? []).reduce((acc, v) => acc + v.qtdTotal, 0);
        const preenchidas = (s.vagas ?? []).reduce((acc, v) => acc + v.qtdPreenchida, 0);
        return (
          <>
            <strong>{preenchidas}/{totalVagas}</strong>
            {' · '}
            {(s.vagas ?? []).map((v) => `${v.qtdTotal}× ${v.cargo}`).join(', ')}
          </>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: (s) => (
        <span style={{
          padding: '2px 8px',
          borderRadius: 10,
          fontSize: 11,
          fontWeight: 700,
          background: STATUS_SOLICITACAO_COR[s.status] + '22',
          color: STATUS_SOLICITACAO_COR[s.status],
        }}>
          {STATUS_SOLICITACAO_LABEL[s.status]}
        </span>
      ),
    },
    {
      id: 'acoes',
      header: '',
      hideable: false,
      cell: () => <a className="action-link" style={{ cursor: 'pointer' }}>Abrir</a>,
    },
  ] as Column<Sol>[], []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">👥 Recrutamento</h1>
          <p className="page-subtitle">
            Solicitações de contratação abertas pelos encarregados e gerenciamento
            de candidatos pelo RH
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
          <Select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as typeof filtro)}
            style={{ width: 160 }}
          >
            <option value="todas">Todas</option>
            <option value="aberta">Abertas</option>
            <option value="preenchida">Preenchidas</option>
            <option value="cancelada">Canceladas</option>
          </Select>
          <Button onClick={() => setNovaModal(true)}>+ Nova solicitação</Button>
        </div>
      </div>

      <DataTable
        rows={solicitacoes}
        columns={solColumns}
        rowKey={(s) => s.id}
        onRowClick={(s) => setDetalheId(s.id)}
        emptyMessage={isLoading ? 'Carregando solicitações…' : 'Nenhuma solicitação encontrada.'}
        searchPlaceholder="Buscar por solicitante ou cargo..."
        globalFilterFn={(s, q) =>
          [s.solicitanteNome, ...(s.vagas ?? []).map((v) => v.cargo)].some(
            (v) => String(v ?? '').toLowerCase().includes(q),
          )
        }
      />

      {novaModal && <NovaSolicitacaoModal onClose={() => setNovaModal(false)} />}
      {detalheId && (
        <SolicitacaoDetail
          solicitacaoId={detalheId}
          onClose={() => setDetalheId(null)}
        />
      )}
    </>
  );
}

