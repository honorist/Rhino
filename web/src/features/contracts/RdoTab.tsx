import { useMemo, useState } from 'react';
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

  function handleExcluir(rdo: Rdo) {
    if (!window.confirm(`Excluir o RDO #${rdo.numero ?? ''}?`)) return;
    deletar.mutate(
      { contractId: contract.id, rdoId: rdo.id },
      {
        onSuccess: () => toast.success('RDO excluído'),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  async function handlePdf(rdo: Rdo) {
    try {
      await exportRdoPdf(rdo, contract);
    } catch {
      toast.error('Falha ao gerar o PDF');
    }
  }

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
        {rdos.length === 0 ? (
          <p
            className="text-muted"
            style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}
          >
            Nenhum RDO registrado.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Data</th>
                  <th>Clima</th>
                  <th style={{ textAlign: 'center' }}>MO Total</th>
                  <th style={{ textAlign: 'center' }}>Equip.</th>
                  <th style={{ textAlign: 'center' }}>Atividades</th>
                  <th style={{ textAlign: 'center' }}>Fotos</th>
                  <th>Segurança</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rdos.map((r) => {
                  const eqpTotal = (r.equipamentos ?? []).reduce(
                    (s, x) => s + n(x.qtd ?? x.quantidade),
                    0,
                  );
                  const fotos = (r.fotos ?? []).length;
                  return (
                    <tr
                      key={r.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setModal({ tipo: 'detalhe', rdo: r })}
                    >
                      <td>
                        <strong style={{ color: 'var(--color-primary)' }}>
                          #{r.numero}
                        </strong>
                      </td>
                      <td>
                        <strong>{formatDateBR(r.data)}</strong>
                        {r.diaSemana && (
                          <div
                            className="text-muted"
                            style={{ fontSize: 12 }}
                          >
                            {r.diaSemana}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 18 }}>{climaManha(r)}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                        {moTotal(r)}
                      </td>
                      <td style={{ textAlign: 'center' }}>{eqpTotal}</td>
                      <td style={{ textAlign: 'center' }}>
                        {(r.atividades ?? []).length}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {fotos > 0 ? `📷 ${fotos}` : '—'}
                      </td>
                      <td>{segBadge(r)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="actions-cell">
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
                            onClick={() => handlePdf(r)}
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
