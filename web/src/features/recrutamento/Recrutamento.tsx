import { useState } from 'react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { Select } from '@/components/ui/native-select';
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

      <Card style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 'var(--sp-xl)' }}>
            <Spinner label="Carregando solicitações…" />
          </div>
        ) : solicitacoes.length === 0 ? (
          <p
            className="text-muted"
            style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}
          >
            Nenhuma solicitação encontrada.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={th()}>Solicitante</th>
                <th style={th()}>Data</th>
                <th style={th()}>Vagas</th>
                <th style={th()}>Status</th>
                <th style={th()}></th>
              </tr>
            </thead>
            <tbody>
              {solicitacoes.map((s) => {
                const totalVagas = (s.vagas ?? []).reduce((acc, v) => acc + v.qtdTotal, 0);
                const preenchidas = (s.vagas ?? []).reduce((acc, v) => acc + v.qtdPreenchida, 0);
                return (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setDetalheId(s.id)}
                  >
                    <td style={td()}>
                      <strong>{s.solicitanteNome ?? '—'}</strong>
                    </td>
                    <td style={td()}>
                      {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td style={td()}>
                      {preenchidas}/{totalVagas} ·{' '}
                      {(s.vagas ?? [])
                        .map((v) => `${v.qtdTotal}× ${v.cargo}`)
                        .join(', ')}
                    </td>
                    <td style={td()}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 700,
                          background: STATUS_SOLICITACAO_COR[s.status] + '22',
                          color: STATUS_SOLICITACAO_COR[s.status],
                        }}
                      >
                        {STATUS_SOLICITACAO_LABEL[s.status]}
                      </span>
                    </td>
                    <td style={td()}>
                      <a className="action-link" style={{ cursor: 'pointer' }}>
                        Abrir
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

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

const th = (): React.CSSProperties => ({
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  color: '#64748B',
});
const td = (): React.CSSProperties => ({ padding: '10px 12px', verticalAlign: 'middle' });
