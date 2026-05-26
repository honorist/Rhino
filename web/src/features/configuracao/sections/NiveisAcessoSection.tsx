import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState, type CSSProperties } from 'react';
import Button from '../../../components/ui/button';
import Card from '../../../components/ui/card';
import Spinner from '../../../components/ui/spinner';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useNiveisAcesso } from '../../auth/queries';
import type { NivelAcesso } from '../../auth/types';

/**
 * Definição completa de abas e sub-permissões — espelha
 * js/views/Configuracao.js (linhas 191-237). Mantenha sincronizado com as
 * rotas reais de App.tsx + niveis_acesso.json.
 */
interface AbaDef {
  route: string;
  label: string;
  icon: string;
  grupo: string;
  /** Sub-itens (flags binárias indentadas embaixo). */
  children?: AbaDef[];
}

const TODAS_ABAS: AbaDef[] = [
  // ── Principal ──
  { route: '#/dashboard', label: 'Dashboard', icon: '🏠', grupo: 'Principal' },
  { route: '#/proposta', label: 'Propostas', icon: '📄', grupo: 'Principal' },
  { route: '#/clausulas', label: 'Biblioteca de Cláusulas', icon: '📖', grupo: 'Principal' },
  {
    route: '#/contratos',
    label: 'Contratos',
    icon: '💼',
    grupo: 'Principal',
    children: [
      { route: 'contrato-tab:visao', label: 'Aba Visão Geral', icon: '👁', grupo: 'Principal' },
      { route: 'contrato-tab:financeiro', label: 'Aba Financeiro', icon: '$', grupo: 'Principal' },
      { route: 'contrato-tab:equipe', label: 'Aba Equipe', icon: '👥', grupo: 'Principal' },
      { route: 'contrato-tab:rdo', label: 'Aba RDO', icon: '📋', grupo: 'Principal' },
      { route: 'contrato-tab:pendencias', label: 'Aba Pendências', icon: '⚠', grupo: 'Principal' },
    ],
  },
  // ── Obras ──
  { route: '#/rdos', label: 'RDOs (todos)', icon: '📋', grupo: 'Obras' },
  { route: '#/obras', label: 'Mapa de Obras', icon: '📍', grupo: 'Obras' },
  {
    route: '#/solicitacoes-compra',
    label: 'Solicitações de Compra',
    icon: '🛒',
    grupo: 'Obras',
    children: [
      { route: 'solicitacoes-compra:avaliar', label: 'Etapa — Avaliar e cotar', icon: '$', grupo: 'Obras' },
      { route: 'solicitacoes-compra:aprovar', label: 'Etapa — Aprovar ou rejeitar', icon: '✓', grupo: 'Obras' },
      { route: 'solicitacoes-compra:receber', label: 'Etapa — Registrar recebimento', icon: '📦', grupo: 'Obras' },
    ],
  },
  { route: '#/estoque', label: 'Almoxarifado', icon: '📦', grupo: 'Obras' },
  { route: '#/frota', label: 'Frota', icon: '🚚', grupo: 'Obras' },
  {
    route: '#/manutencao',
    label: 'Manutenção',
    icon: '🔧',
    grupo: 'Obras',
    children: [
      { route: 'manutencao:avaliar', label: 'Etapa — Avaliar oficina/prazo', icon: '$', grupo: 'Obras' },
      { route: 'manutencao:aprovar', label: 'Etapa — Aprovar ou rejeitar', icon: '✓', grupo: 'Obras' },
    ],
  },
  // ── RH ──
  { route: '#/clientes', label: 'Clientes', icon: '👥', grupo: 'RH' },
  { route: '#/fornecedores', label: 'Fornecedores', icon: '🚚', grupo: 'RH' },
  { route: '#/recursos', label: 'Recursos', icon: '👤', grupo: 'RH' },
  { route: '#/recrutamento', label: 'Recrutamento', icon: '👤', grupo: 'RH' },
  { route: '#/folha-pagamento', label: 'Folha de Pagamento', icon: '$', grupo: 'RH' },
  { route: '#/documentos', label: 'Documentação', icon: '📄', grupo: 'RH' },
  // ── Financeiro ──
  { route: '#/base', label: 'BASE', icon: '🗄', grupo: 'Financeiro' },
  { route: '#/caixa', label: 'Caixa', icon: '👛', grupo: 'Financeiro' },
  { route: '#/contas-pagar', label: 'Contas a Pagar', icon: '➖', grupo: 'Financeiro' },
  { route: '#/notas-fiscais', label: 'Contas a Receber', icon: '🧾', grupo: 'Financeiro' },
  { route: '#/conciliacao', label: 'Conciliação', icon: '✓', grupo: 'Financeiro' },
  { route: '#/cobranca', label: 'Cobrança', icon: '🧾', grupo: 'Financeiro' },
  { route: '#/socios', label: 'Sócios', icon: '👥', grupo: 'Financeiro' },
  { route: '#/investimentos', label: 'Aportes', icon: '➕', grupo: 'Financeiro' },
  { route: '#/previsao', label: 'Previsão', icon: '📈', grupo: 'Financeiro' },
  { route: '#/ai-chat', label: 'Assistente IA', icon: '✨', grupo: 'Financeiro' },
  // ── Sistema ──
  { route: '#/configuracao', label: 'Configuração', icon: '⚙', grupo: 'Sistema' },
  { route: '#/usuarios', label: 'Usuários', icon: '👤', grupo: 'Sistema' },
  { route: '#/auditoria', label: 'Auditoria', icon: '👁', grupo: 'Sistema' },
  // ── Restrições especiais (flag) ──
  {
    route: 'special:nao-ver-valores',
    label: 'Ocultar valores monetários (R$)',
    icon: '🙈',
    grupo: 'Restrições especiais',
  },
];

const GRUPOS = ['Principal', 'Obras', 'RH', 'Financeiro', 'Sistema', 'Restrições especiais'];

function isFlag(route: string): boolean {
  return (
    route.startsWith('special:') ||
    route.startsWith('contrato-tab:') ||
    route.startsWith('solicitacoes-compra:') ||
    route.startsWith('manutencao:')
  );
}

/**
 * Seção "Níveis de Acesso" — MATRIZ visual (linhas = abas, colunas = perfis
 * com Ver+Editar cada). Porte fiel de renderNiveisAcesso() de
 * js/views/Configuracao.js. Salvamento em batch.
 */
export default function NiveisAcessoSection() {
  const niveisQuery = useNiveisAcesso();
  const [edits, setEdits] = useState<Map<string, Set<string>>>(new Map());

  if (niveisQuery.isLoading) return <Spinner label="Carregando perfis…" />;
  const niveisRaw = niveisQuery.data?.niveis ?? [];
  // Gerente sempre na ponta direita.
  const niveis = [...niveisRaw].sort(
    (a, b) => (a.id === 'gerente' ? 1 : 0) - (b.id === 'gerente' ? 1 : 0),
  );

  const getAbasEdit = (nivelId: string): Set<string> =>
    edits.get(nivelId) ?? new Set(niveis.find((n) => n.id === nivelId)?.abas ?? []);

  function toggle(nivelId: string, route: string) {
    setEdits((prev) => {
      const next = new Map(prev);
      const atual = new Set(
        prev.get(nivelId) ?? niveis.find((n) => n.id === nivelId)?.abas ?? [],
      );
      if (atual.has(route)) {
        atual.delete(route);
        if (!route.startsWith('edit:')) atual.delete('edit:' + route);
      } else {
        atual.add(route);
      }
      next.set(nivelId, atual);
      return next;
    });
  }

  const hasChanges = edits.size > 0;
  const headerProps =
    hasChanges && niveis.length > 0
      ? { hasChanges: true as const, edits, niveis, onSaved: () => setEdits(new Map()), onReset: () => setEdits(new Map()) }
      : {};

  return (
    <>
      <Header {...headerProps} />

      {niveis.length === 0 ? (
        <Card style={{ padding: 'var(--sp-lg)' }}>
          <p className="text-muted">Nenhum perfil cadastrado.</p>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          <table
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <th style={{ ...th(), background: 'var(--color-surface)', textAlign: 'left' }}>
                  Tela / Permissão
                </th>
                {niveis.map((n, i) => (
                  <th
                    key={n.id}
                    colSpan={2}
                    style={{
                      ...th(),
                      background: 'var(--color-surface)',
                      borderLeft: i > 0 ? '2px solid var(--color-border)' : undefined,
                      borderBottom: `3px solid ${n.cor}`,
                    }}
                  >
                    <span style={{ fontSize: 16, marginRight: 4 }}>{n.icon}</span>
                    <span style={{ color: n.cor }}>{n.label}</span>
                  </th>
                ))}
              </tr>
              <tr>
                <th style={{ ...th(), background: 'var(--color-surface)' }} />
                {niveis.map((n, i) => (
                  <Fragment key={n.id}>
                    <th
                      style={{
                        ...subTh(),
                        borderLeft: i > 0 ? '2px solid var(--color-border)' : undefined,
                      }}
                    >
                      Ver
                    </th>
                    <th style={subTh()}>Ed.</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {GRUPOS.map((grupo) => {
                const abasGrupo = TODAS_ABAS.filter((a) => a.grupo === grupo);
                if (abasGrupo.length === 0) return null;
                return (
                  <Fragment key={grupo}>
                    <tr>
                      <td
                        colSpan={1 + niveis.length * 2}
                        style={{
                          background: 'var(--color-bg)',
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '.06em',
                          color: '#64748B',
                          padding: '8px 10px',
                        }}
                      >
                        {grupo}
                      </td>
                    </tr>
                    {abasGrupo.flatMap((aba) => [
                      <MatrixRow
                        key={aba.route}
                        aba={aba}
                        niveis={niveis}
                        getAbas={getAbasEdit}
                        onToggle={toggle}
                        indented={false}
                      />,
                      ...(aba.children ?? []).map((child) => (
                        <MatrixRow
                          key={child.route}
                          aba={child}
                          niveis={niveis}
                          getAbas={getAbasEdit}
                          onToggle={toggle}
                          indented
                        />
                      )),
                    ])}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

interface HeaderProps {
  hasChanges?: boolean;
  edits?: Map<string, Set<string>>;
  niveis?: NivelAcesso[];
  onSaved?: () => void;
  onReset?: () => void;
}

function Header({ hasChanges, edits, niveis, onSaved, onReset }: HeaderProps) {
  const qc = useQueryClient();
  const salvar = useMutation({
    mutationFn: async () => {
      if (!edits || !niveis) return;
      const calls = Array.from(edits.entries()).map(([nivelId, set]) =>
        api.put(`/api/niveis-acesso/${nivelId}`, { abas: Array.from(set) }),
      );
      await Promise.all(calls);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.niveisAcesso });
      toast.success('Permissões atualizadas em todos os perfis editados.');
      onSaved?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div
      className="page-header"
      style={{ marginBottom: 'var(--sp-lg)', alignItems: 'flex-start' }}
    >
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          🔐 Níveis de Acesso
        </h2>
        <p className="page-subtitle">
          Matriz de telas (linhas) × perfis (colunas). Marque <strong>Ver</strong>{' '}
          para liberar a tela no menu; <strong>Editar</strong> habilita
          criar/atualizar/excluir.
        </p>
      </div>
      {hasChanges && (
        <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
          <Button variant="secondary" onClick={onReset} disabled={salvar.isPending}>
            Descartar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </div>
      )}
    </div>
  );
}

function MatrixRow({
  aba,
  niveis,
  getAbas,
  onToggle,
  indented,
}: {
  aba: AbaDef;
  niveis: NivelAcesso[];
  getAbas: (nivelId: string) => Set<string>;
  onToggle: (nivelId: string, route: string) => void;
  indented: boolean;
}) {
  const flag = isFlag(aba.route);
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <td
        style={{
          padding: '6px 10px',
          paddingLeft: indented ? 30 : 10,
          color: indented ? 'var(--color-text-muted)' : 'var(--color-text)',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ marginRight: 6 }}>{aba.icon}</span>
        {aba.label}
      </td>
      {niveis.map((n, i) => {
        const abasEd = getAbas(n.id);
        const verChecked = abasEd.has(aba.route);
        const editChecked = abasEd.has('edit:' + aba.route);
        return (
          <Fragment key={n.id}>
            <td
              style={{
                textAlign: 'center',
                padding: '4px 8px',
                borderLeft: i > 0 ? '2px solid var(--color-border)' : undefined,
              }}
            >
              <input
                type="checkbox"
                checked={verChecked}
                onChange={() => onToggle(n.id, aba.route)}
                style={{ width: 14, height: 14, accentColor: n.cor }}
                title={flag ? 'Sub-permissão — marcado = liberado' : `Ver ${aba.label}`}
              />
            </td>
            <td style={{ textAlign: 'center', padding: '4px 8px' }}>
              {flag ? (
                <span style={{ color: 'var(--color-text-muted)' }} title="Não se aplica">
                  —
                </span>
              ) : (
                <input
                  type="checkbox"
                  checked={editChecked}
                  disabled={!verChecked}
                  onChange={() => onToggle(n.id, 'edit:' + aba.route)}
                  style={{
                    width: 14,
                    height: 14,
                    accentColor: n.cor,
                    opacity: verChecked ? 1 : 0.35,
                  }}
                  title={`Editar ${aba.label}`}
                />
              )}
            </td>
          </Fragment>
        );
      })}
    </tr>
  );
}

const th = (): CSSProperties => ({
  padding: '8px 10px',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  color: '#64748B',
  textAlign: 'center',
  position: 'sticky',
  top: 0,
  zIndex: 2,
});

const subTh = (): CSSProperties => ({
  padding: '4px 8px',
  width: 46,
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  color: '#64748B',
  background: 'var(--color-surface)',
  textAlign: 'center',
});
