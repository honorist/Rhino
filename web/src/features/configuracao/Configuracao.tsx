import { useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import ArquivosSection from './sections/ArquivosSection';
import AtualizacoesSection from './sections/AtualizacoesSection';
import BackupSection from './sections/BackupSection';
import DocTemplatesSection from './sections/DocTemplatesSection';
import FeatureFlagsSection from './sections/FeatureFlagsSection';
import LgpdSection from './sections/LgpdSection';
import NiveisAcessoSection from './sections/NiveisAcessoSection';
import PushSection from './sections/PushSection';
import TiposCustoSection from './sections/TiposCustoSection';
import TourSection from './sections/TourSection';

const SECAO_COMPONENTS: Record<string, ComponentType> = {
  tipos_custo: TiposCustoSection,
  niveis_acesso: NiveisAcessoSection,
  doc_templates: DocTemplatesSection,
  arquivos: ArquivosSection,
  backup: BackupSection,
  feature_flags: FeatureFlagsSection,
  notificacoes: PushSection,
  lgpd: LgpdSection,
  tour: TourSection,
  atualizacoes: AtualizacoesSection,
};

interface Secao {
  k: string;
  icon: string;
  label: string;
  descricao: string;
}

const SECOES: Secao[] = [
  {
    k: 'tipos_custo',
    icon: '🏷️',
    label: 'Tipos de Custo',
    descricao:
      'Classificação de custos usados em BASE e Aportes. Tipos do sistema não podem ser excluídos.',
  },
  {
    k: 'niveis_acesso',
    icon: '🔐',
    label: 'Níveis de Acesso',
    descricao:
      'Matriz de perfis × telas. Cada linha é uma tela; cada coluna é um perfil. Marque Ver/Editar para liberar.',
  },
  {
    k: 'doc_templates',
    icon: '📋',
    label: 'Templates de Docs',
    descricao:
      'Modelos de documento (ASO, NR-10, ART...) usados no cadastro de documentos dos colaboradores.',
  },
  {
    k: 'arquivos',
    icon: '📁',
    label: 'Arquivos do Sistema',
    descricao:
      'Anexos PDF/imagens armazenados pelo sistema (anexos de propostas, logos de cases, etc.).',
  },
  {
    k: 'backup',
    icon: '💾',
    label: 'Backup do Sistema',
    descricao:
      'Exportação completa dos dados em JSON. Útil para arquivamento e migração.',
  },
  {
    k: 'feature_flags',
    icon: '🚀',
    label: 'Feature Flags',
    descricao: 'Habilita/desabilita funcionalidades em fase de teste.',
  },
  {
    k: 'notificacoes',
    icon: '🔔',
    label: 'Notificações Push',
    descricao:
      'Inscrição em notificações push do navegador para alertas de RDO, NF, contas a pagar.',
  },
  {
    k: 'lgpd',
    icon: '🔒',
    label: 'Privacidade (LGPD)',
    descricao:
      'Exportação e exclusão de dados pessoais, em conformidade com a LGPD.',
  },
  {
    k: 'tour',
    icon: '🗺️',
    label: 'Tour Guiado',
    descricao:
      'Reativa o tour inicial do sistema (útil para apresentar a novos usuários).',
  },
  {
    k: 'atualizacoes',
    icon: '🆕',
    label: 'Atualizações',
    descricao:
      'Histórico de versões e novidades recentes do Rhino.',
  },
];

const ATALHOS: { to: string; label: string }[] = [
  { to: '/usuarios', label: '👤 Usuários e Logins' },
  { to: '/auditoria', label: '👁️ Auditoria' },
  { to: '/cobranca', label: '💳 Cobrança' },
];

/** Tela de Configurações — porte da estrutura de Configuracao.js. */
export default function Configuracao() {
  const [secao, setSecao] = useState<string>('tipos_custo');
  const ativa = SECOES.find((s) => s.k === secao) ?? SECOES[0];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">⚙️ Configurações</h1>
          <p className="page-subtitle">Personalize seu sistema</p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          gap: 'var(--sp-lg)',
          alignItems: 'start',
        }}
      >
        <Card
          style={{
            padding: 'var(--sp-sm)',
            position: 'sticky',
            top: 'var(--sp-md)',
          }}
        >
          {SECOES.map((s) => {
            const ativo = secao === s.k;
            return (
              <button
                key={s.k}
                type="button"
                onClick={() => setSecao(s.k)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: ativo ? 'var(--color-primary)' : 'transparent',
                  color: ativo ? '#fff' : 'var(--color-text)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: ativo ? 600 : 500,
                  textAlign: 'left',
                }}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            );
          })}
          <div
            style={{
              borderTop: '1px solid var(--color-border)',
              marginTop: 6,
              paddingTop: 6,
            }}
          >
            {ATALHOS.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                style={{
                  display: 'block',
                  padding: '10px 12px',
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: 'var(--color-text)',
                  fontSize: 14,
                }}
              >
                {a.label}
              </Link>
            ))}
          </div>
        </Card>

        <div>
          {(() => {
            const Componente = SECAO_COMPONENTS[ativa.k];
            return Componente ? (
              <Componente />
            ) : (
              <Card style={{ padding: 'var(--sp-xl)' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>
                  {ativa.icon} {ativa.label}
                </h2>
                <p
                  className="text-muted"
                  style={{ margin: '0 0 var(--sp-lg)', fontSize: 14 }}
                >
                  {ativa.descricao}
                </p>
                <div
                  style={{
                    background: 'rgba(245,158,11,.08)',
                    border: '1px solid #fcd34d',
                    borderRadius: 8,
                    padding: 'var(--sp-lg)',
                    fontSize: 14,
                  }}
                >
                  <strong>🚧 Em construção.</strong> Esta seção ainda não foi
                  portada para React.
                </div>
              </Card>
            );
          })()}
        </div>
      </div>
    </>
  );
}
