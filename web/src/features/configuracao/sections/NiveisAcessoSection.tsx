import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Modal from '../../../components/ui/Modal';
import Spinner from '../../../components/ui/Spinner';
import { useToast } from '../../../components/ui/toast/ToastContext';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useNiveisAcesso } from '../../auth/queries';
import type { NivelAcesso } from '../../auth/types';

/**
 * Catálogo de rotas e flags — espelha js/views/Configuracao.js linhas 191-237.
 * Inclui rotas (#/x), sub-abas (contrato-tab:y) e flags especiais.
 */
interface Aba {
  route: string;
  label: string;
  grupo: string;
  isFlag?: boolean;
  isEditable?: boolean; // permite edit:#/x
}

const TODAS_ABAS: Aba[] = [
  // Principal
  { route: '#/dashboard', label: 'Dashboard', grupo: 'Principal', isEditable: true },
  { route: '#/proposta', label: 'Propostas', grupo: 'Principal', isEditable: true },
  { route: '#/clausulas', label: 'Cláusulas', grupo: 'Principal', isEditable: true },
  { route: '#/contratos', label: 'Contratos', grupo: 'Principal', isEditable: true },
  { route: 'contrato-tab:visao', label: '  ↳ Aba Visão Geral', grupo: 'Principal', isFlag: true },
  { route: 'contrato-tab:financeiro', label: '  ↳ Aba Financeiro', grupo: 'Principal', isFlag: true },
  { route: 'contrato-tab:equipe', label: '  ↳ Aba Equipe', grupo: 'Principal', isFlag: true },
  { route: 'contrato-tab:rdo', label: '  ↳ Aba RDO', grupo: 'Principal', isFlag: true },
  { route: 'contrato-tab:pendencias', label: '  ↳ Aba Pendências', grupo: 'Principal', isFlag: true },
  // Obras
  { route: '#/rdos', label: 'RDOs', grupo: 'Obras', isEditable: true },
  { route: '#/obras', label: 'Mapa de Obras', grupo: 'Obras', isEditable: true },
  { route: '#/solicitacoes-compra', label: 'Solicitações de Compra', grupo: 'Obras', isEditable: true },
  { route: 'solicitacoes-compra:avaliar', label: '  ↳ Etapa Avaliar', grupo: 'Obras', isFlag: true },
  { route: 'solicitacoes-compra:aprovar', label: '  ↳ Etapa Aprovar', grupo: 'Obras', isFlag: true },
  { route: 'solicitacoes-compra:receber', label: '  ↳ Etapa Receber', grupo: 'Obras', isFlag: true },
  { route: '#/estoque', label: 'Almoxarifado', grupo: 'Obras', isEditable: true },
  { route: '#/frota', label: 'Frota', grupo: 'Obras', isEditable: true },
  { route: '#/manutencao', label: 'Manutenção', grupo: 'Obras', isEditable: true },
  { route: 'manutencao:avaliar', label: '  ↳ Etapa Avaliar', grupo: 'Obras', isFlag: true },
  { route: 'manutencao:aprovar', label: '  ↳ Etapa Aprovar', grupo: 'Obras', isFlag: true },
  // RH
  { route: '#/clientes', label: 'Clientes', grupo: 'RH', isEditable: true },
  { route: '#/fornecedores', label: 'Fornecedores', grupo: 'RH', isEditable: true },
  { route: '#/recursos', label: 'Recursos', grupo: 'RH', isEditable: true },
  { route: '#/folha-pagamento', label: 'Folha de Pagamento', grupo: 'RH', isEditable: true },
  { route: '#/documentos', label: 'Documentação', grupo: 'RH', isEditable: true },
  // Financeiro
  { route: '#/base', label: 'BASE', grupo: 'Financeiro', isEditable: true },
  { route: '#/caixa', label: 'Caixa', grupo: 'Financeiro', isEditable: true },
  { route: '#/contas-pagar', label: 'Contas a Pagar', grupo: 'Financeiro', isEditable: true },
  { route: '#/notas-fiscais', label: 'Notas Fiscais', grupo: 'Financeiro', isEditable: true },
  { route: '#/conciliacao', label: 'Conciliação', grupo: 'Financeiro', isEditable: true },
  { route: '#/cobranca', label: 'Cobrança', grupo: 'Financeiro', isEditable: true },
  { route: '#/socios', label: 'Sócios', grupo: 'Financeiro', isEditable: true },
  { route: '#/investimentos', label: 'Aportes', grupo: 'Financeiro', isEditable: true },
  { route: '#/previsao', label: 'Previsão', grupo: 'Financeiro', isEditable: true },
  { route: '#/ai-chat', label: 'Assistente IA', grupo: 'Financeiro' },
  // Sistema
  { route: '#/configuracao', label: 'Configuração', grupo: 'Sistema', isEditable: true },
  { route: '#/usuarios', label: 'Usuários', grupo: 'Sistema', isEditable: true },
  { route: '#/auditoria', label: 'Auditoria', grupo: 'Sistema' },
  // Restrições
  {
    route: 'special:nao-ver-valores',
    label: 'Ocultar valores monetários (R$)',
    grupo: 'Restrições',
    isFlag: true,
  },
];

const GRUPOS = ['Principal', 'Obras', 'RH', 'Financeiro', 'Sistema', 'Restrições'];

/**
 * Seção "Níveis de Acesso" — porte de renderNiveisAcesso() em
 * js/views/Configuracao.js. Lista de perfis e editor de matriz Ver/Editar.
 */
export default function NiveisAcessoSection() {
  const niveisQuery = useNiveisAcesso();
  const [editing, setEditing] = useState<NivelAcesso | null>(null);

  if (niveisQuery.isLoading) return <Spinner label="Carregando perfis…" />;

  const niveis = niveisQuery.data?.niveis ?? [];

  return (
    <>
      <div className="page-header" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            🔐 Níveis de Acesso
          </h2>
          <p className="page-subtitle">
            Perfis que controlam quais telas cada usuário pode ver e editar
          </p>
        </div>
      </div>

      {niveis.length === 0 ? (
        <Card style={{ padding: 'var(--sp-lg)' }}>
          <p className="text-muted">Nenhum perfil cadastrado.</p>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={th()}>Perfil</th>
                  <th style={th()}>Cor</th>
                  <th style={th()}>Abas liberadas</th>
                  <th style={th()}></th>
                </tr>
              </thead>
              <tbody>
                {niveis.map((n) => (
                  <tr key={n.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={td()}>
                      <span style={{ fontSize: 20 }}>{n.icon}</span>{' '}
                      <strong>{n.label}</strong>
                    </td>
                    <td style={td()}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          background: n.cor,
                        }}
                      />
                    </td>
                    <td style={td()}>
                      <span className="text-muted">
                        {(n.abas ?? []).length} aba(s) /{' '}
                        {(n.abas ?? []).filter((a) => a.startsWith('edit:')).length} edição(ões)
                      </span>
                    </td>
                    <td style={td()}>
                      <a
                        className="action-link"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setEditing(n)}
                      >
                        Editar permissões
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <PermissionsEditorModal
          nivel={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function PermissionsEditorModal({
  nivel,
  onClose,
}: {
  nivel: NivelAcesso;
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [abas, setAbas] = useState<Set<string>>(new Set(nivel.abas ?? []));

  const salvar = useMutation({
    mutationFn: (input: { abas: string[] }) =>
      api.put<{ ok: boolean }>(`/api/niveis-acesso/${nivel.id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.niveisAcesso });
      toast.show(`Permissões de ${nivel.label} atualizadas`, 'success');
      onClose();
    },
    onError: (e) => toast.show(e.message, 'danger'),
  });

  function toggle(route: string) {
    setAbas((prev) => {
      const next = new Set(prev);
      if (next.has(route)) next.delete(route);
      else next.add(route);
      return next;
    });
  }

  return (
    <Modal
      open
      title={`Permissões — ${nivel.label}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => salvar.mutate({ abas: Array.from(abas) })}
            disabled={salvar.isPending}
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar permissões'}
          </Button>
        </>
      }
    >
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 'var(--sp-md)' }}>
        Marque <strong>Ver</strong> para liberar a tela no menu;{' '}
        <strong>Editar</strong> habilita criar/atualizar/excluir nessa tela.
      </p>

      {GRUPOS.map((g) => {
        const itens = TODAS_ABAS.filter((a) => a.grupo === g);
        if (itens.length === 0) return null;
        return (
          <fieldset
            key={g}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: 'var(--sp-md)',
              marginBottom: 'var(--sp-md)',
            }}
          >
            <legend
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.04em',
                color: '#64748B',
                padding: '0 6px',
              }}
            >
              {g}
            </legend>
            <table style={{ width: '100%', fontSize: 13 }}>
              <tbody>
                {itens.map((aba) => {
                  const liberada = abas.has(aba.route);
                  const editable = aba.isEditable && !aba.isFlag;
                  const editRoute = 'edit:' + aba.route;
                  const liberadaEdit = abas.has(editRoute);
                  return (
                    <tr key={aba.route}>
                      <td style={{ padding: '4px 0', whiteSpace: 'pre-wrap' }}>
                        {aba.label}
                      </td>
                      <td style={{ padding: '4px 0', width: 80, textAlign: 'center' }}>
                        <label
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                        >
                          <input
                            type="checkbox"
                            checked={liberada}
                            onChange={() => toggle(aba.route)}
                          />
                          Ver
                        </label>
                      </td>
                      <td style={{ padding: '4px 0', width: 80, textAlign: 'center' }}>
                        {editable && (
                          <label
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                          >
                            <input
                              type="checkbox"
                              checked={liberadaEdit}
                              onChange={() => toggle(editRoute)}
                              disabled={!liberada}
                            />
                            Editar
                          </label>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </fieldset>
        );
      })}
    </Modal>
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
const td = (): React.CSSProperties => ({
  padding: '10px 12px',
  verticalAlign: 'middle',
});
