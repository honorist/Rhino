import type { OrgMembro } from './types';
import { NIVEL_COR, NIVEL_LABEL, iniciais } from './organograma';
import './organograma.css';

interface ArvoreCtx {
  membros: OrgMembro[];
  nomeDe: (recursoId: string) => string;
  profissaoDe: (recursoId: string) => string;
  onEdit: (m: OrgMembro) => void;
  onDelete: (m: OrgMembro) => void;
}

function OrgNode({ membro, ctx }: { membro: OrgMembro; ctx: ArvoreCtx }) {
  const nome = ctx.nomeDe(membro.recursoId);
  const cargo = ctx.profissaoDe(membro.recursoId) || membro.cargo || '';
  const filhos = ctx.membros.filter((m) => m.supervisorId === membro.id);

  return (
    <li className="org-li">
      <div className={`org-node node-${membro.nivel}`}>
        <div
          className="org-avatar"
          style={{ background: NIVEL_COR[membro.nivel] }}
          aria-hidden="true"
        >
          {iniciais(nome)}
        </div>
        <div className="org-node-nome">{nome}</div>
        {cargo && <div className="org-cargo">{cargo}</div>}
        {membro.area && <div className="org-area">{membro.area}</div>}
        <div className="org-nivel-tag">{NIVEL_LABEL[membro.nivel]}</div>
        <div className="org-node-actions">
          <a
            className="action-link"
            style={{ cursor: 'pointer', fontSize: 12 }}
            onClick={() => ctx.onEdit(membro)}
          >
            Editar
          </a>
          <a
            className="action-link danger"
            style={{ cursor: 'pointer', fontSize: 12 }}
            onClick={() => ctx.onDelete(membro)}
          >
            Excluir
          </a>
        </div>
      </div>
      {filhos.length > 0 && (
        <ul className="org-ul">
          {filhos.map((f) => (
            <OrgNode key={f.id} membro={f} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Organograma da obra em árvore (conectores CSS). */
export default function OrganogramaArvore(ctx: ArvoreCtx) {
  const { membros } = ctx;
  const encarregado = membros.find((m) => m.nivel === 'encarregado');
  const raizes: OrgMembro[] = [];
  if (encarregado) raizes.push(encarregado);
  for (const m of membros) {
    if (m === encarregado) continue;
    const temSupervisor =
      m.supervisorId && membros.some((x) => x.id === m.supervisorId);
    if (!temSupervisor) raizes.push(m);
  }

  return (
    <div className="org-tree">
      <ul className="org-root">
        {raizes.map((r) => (
          <OrgNode key={r.id} membro={r} ctx={ctx} />
        ))}
      </ul>
    </div>
  );
}
