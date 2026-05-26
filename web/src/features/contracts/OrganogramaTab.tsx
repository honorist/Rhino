import { useMemo, useState } from 'react';
import Button from '../../components/ui/button';
import Card from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { useRecursos } from '../resources';
import type { ContratoTabProps } from './ContratoDetail';
import type { OrgMembro } from './types';
import { NIVEL_COR, NIVEL_LABEL, NIVEL_ORDEM } from './organograma';
import { useDeleteMembroOrg } from './queries';
import OrganogramaArvore from './OrganogramaArvore';
import MembroModal, { type RecursoOrg } from './MembroModal';
import DataTable, { type Column } from '../../components/ui/data-table';

type Vista = 'hierarquia' | 'lista';

/** Aba Equipe do contrato — organograma da obra. */
export default function OrganogramaTab({ contract }: ContratoTabProps) {
  const recursosQuery = useRecursos();
  const deletar = useDeleteMembroOrg();
  const [vista, setVista] = useState<Vista>('hierarquia');
  const [modal, setModal] = useState<{ membro: OrgMembro | null } | null>(null);

  const membros = useMemo(
    () => (contract.organograma as OrgMembro[] | undefined) ?? [],
    [contract.organograma],
  );

  const recursoMap = useMemo(() => {
    const m = new Map<string, { nome: string; profissao: string }>();
    for (const r of recursosQuery.data ?? []) {
      m.set(r.id, {
        nome: String(r.nome ?? ''),
        profissao: String(r.profissao ?? ''),
      });
    }
    return m;
  }, [recursosQuery.data]);

  const recursosFuncionarios = useMemo<RecursoOrg[]>(
    () =>
      (recursosQuery.data ?? [])
        .filter((r) => r.status === 'funcionario')
        .map((r) => ({
          id: r.id,
          nome: String(r.nome ?? ''),
          profissao: r.profissao ? String(r.profissao) : undefined,
        })),
    [recursosQuery.data],
  );

  const nomeDe = (rid: string) =>
    recursoMap.get(rid)?.nome || '(recurso removido)';
  const profissaoDe = (rid: string) => recursoMap.get(rid)?.profissao || '';

  function handleExcluir(m: OrgMembro) {
    if (!window.confirm(`Remover ${nomeDe(m.recursoId)} do organograma?`)) {
      return;
    }
    deletar.mutate(
      { contractId: contract.id, membroId: m.id },
      {
        onSuccess: () => toast.success('Membro removido'),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const ordenados = useMemo(
    () =>
      [...membros].sort((a, b) => {
        const d = NIVEL_ORDEM[a.nivel] - NIVEL_ORDEM[b.nivel];
        return d !== 0 ? d : nomeDe(a.recursoId).localeCompare(nomeDe(b.recursoId));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [membros, recursoMap],
  );

  const columnsMembros = useMemo<Column<OrgMembro>[]>(
    () => [
      {
        header: 'Nome',
        cell: (m) => <strong>{nomeDe(m.recursoId)}</strong>,
      },
      {
        header: 'Cargo',
        cell: (m) => <>{profissaoDe(m.recursoId) || m.cargo || '—'}</>,
      },
      {
        header: 'Nível',
        cell: (m) => (
          <Badge
            style={{
              background: `${NIVEL_COR[m.nivel]}22`,
              color: NIVEL_COR[m.nivel],
            }}
          >
            {NIVEL_LABEL[m.nivel]}
          </Badge>
        ),
      },
      {
        header: 'Supervisor',
        cell: (m) => {
          const sup = m.supervisorId
            ? membros.find((x) => x.id === m.supervisorId)
            : undefined;
          return <>{sup ? nomeDe(sup.recursoId) : '—'}</>;
        },
      },
      {
        header: 'Área',
        cell: (m) => <>{m.area || '—'}</>,
      },
      {
        header: 'Ações',
        cell: (m) => (
          <div className="actions-cell">
            <a
              className="action-link"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); setModal({ membro: m }); }}
            >
              Editar
            </a>
            <a
              className="action-link danger"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); handleExcluir(m); }}
            >
              Excluir
            </a>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [membros, recursoMap],
  );

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--sp-md) var(--sp-lg)',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>
          Organograma da Obra — Equipe
        </h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="sm"
            variant={vista === 'hierarquia' ? 'primary' : 'secondary'}
            onClick={() => setVista('hierarquia')}
          >
            ⛬ Hierarquia
          </Button>
          <Button
            size="sm"
            variant={vista === 'lista' ? 'primary' : 'secondary'}
            onClick={() => setVista('lista')}
          >
            ☰ Lista
          </Button>
          <Button size="sm" onClick={() => setModal({ membro: null })}>
            + Adicionar Membro
          </Button>
        </div>
      </div>

      <div style={{ padding: 'var(--sp-lg)' }}>
        {membros.length === 0 ? (
          <p className="text-muted">
            Nenhum membro cadastrado. Clique em "+ Adicionar Membro".
          </p>
        ) : vista === 'lista' ? (
          <DataTable
            columns={columnsMembros}
            rows={ordenados}
            rowKey={(m) => m.id}
            emptyMessage="Nenhum membro cadastrado."
          />
        ) : (
          <OrganogramaArvore
            membros={membros}
            nomeDe={nomeDe}
            profissaoDe={profissaoDe}
            onEdit={(m) => setModal({ membro: m })}
            onDelete={handleExcluir}
          />
        )}
      </div>

      {modal && (
        <MembroModal
          contractId={contract.id}
          membros={membros}
          membro={modal.membro}
          recursos={recursosFuncionarios}
          onClose={() => setModal(null)}
        />
      )}
    </Card>
  );
}
