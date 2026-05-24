import { useAcceptTerms, useLogout } from './queries';

/**
 * Modal LGPD que aparece após o login enquanto !user.acceptedTermsAt.
 * Porte de showTermosModal em js/app.js. Texto simplificado — o
 * documento completo continua em js/app.js para referência; aqui está
 * o essencial p/ aceite ou recusa.
 */
export default function LgpdModal() {
  const accept = useAcceptTerms();
  const logout = useLogout();

  async function handleAccept() {
    try {
      await accept.mutateAsync();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleReject() {
    await logout.mutateAsync();
    location.reload();
  }

  return (
    <div
      id="lgpdOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lgpdTitle"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,.4)',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 12px 36px rgba(0,0,0,.25)',
        }}
      >
        <div
          style={{
            padding: 'var(--sp-lg)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h2 id="lgpdTitle" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            Termos de uso e tratamento de dados (LGPD)
          </h2>
        </div>
        <div
          style={{
            overflowY: 'auto',
            padding: 'var(--sp-lg)',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: '0 0 12px' }}>
            <strong>Rhino — Sistema de gestão empresarial.</strong> Ao usar este
            sistema você concorda com o tratamento dos seus dados pessoais nos termos
            abaixo.
          </p>
          <h3 style={{ margin: '14px 0 10px', fontSize: 16 }}>1. Controlador</h3>
          <p style={{ margin: '0 0 12px' }}>Rhino Manutenções.</p>

          <h3 style={{ margin: '14px 0 10px', fontSize: 16 }}>2. Dados tratados</h3>
          <ul style={{ margin: '0 0 12px 22px' }}>
            <li>
              <strong>Usuários:</strong> nome, email, senha (hash bcrypt), nível de
              acesso e último login.
            </li>
            <li>
              <strong>Colaboradores:</strong> nome, CPF, RG, PIS, CNH, contato,
              endereço, salário e documentos digitalizados.
            </li>
            <li>
              <strong>Clientes/fornecedores/sócios:</strong> razão social, CNPJ/CPF,
              contato, dados bancários (fornecedores) e percentual societário.
            </li>
          </ul>

          <h3 style={{ margin: '14px 0 10px', fontSize: 16 }}>3. Finalidade</h3>
          <p style={{ margin: '0 0 12px' }}>
            Gestão administrativa, financeira e operacional; emissão de medições,
            controle de folgas, pagamentos, conformidade trabalhista e fiscal.
          </p>

          <h3 style={{ margin: '14px 0 10px', fontSize: 16 }}>4. Direitos do titular</h3>
          <p style={{ margin: '0 0 8px' }}>Você tem direito a:</p>
          <ul style={{ margin: '0 0 12px 22px' }}>
            <li>Confirmar tratamento e acessar seus dados</li>
            <li>Corrigir, anonimizar ou eliminar dados</li>
            <li>Solicitar portabilidade ou revogar consentimento</li>
          </ul>

          <h3 style={{ margin: '14px 0 10px', fontSize: 16 }}>5. Segurança</h3>
          <ul style={{ margin: '0 0 12px 22px' }}>
            <li>Senhas com hash bcrypt; cookies httpOnly + SameSite=Lax</li>
            <li>Tráfego HTTPS em produção; rate limit em login</li>
            <li>Logs estruturados para auditoria</li>
          </ul>

          <h3 style={{ margin: '14px 0 10px', fontSize: 16 }}>6. Aceite</h3>
          <p style={{ margin: '0 0 12px' }}>
            Ao clicar em <strong>"Aceito"</strong>, você confirma que leu e
            concorda. O aceite é registrado com data/hora.
          </p>

          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 13 }}>
            Versão 1.0 · {new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>
        <div
          style={{
            padding: 'var(--sp-lg)',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            gap: 'var(--sp-md)',
            justifyContent: 'flex-end',
          }}
        >
          <button
            id="btnRejeitar"
            type="button"
            className="btn btn-secondary"
            onClick={handleReject}
            disabled={logout.isPending}
          >
            Não aceito (sair)
          </button>
          <button
            id="btnAceitarTermos"
            type="button"
            className="btn btn-primary"
            onClick={handleAccept}
            disabled={accept.isPending}
          >
            {accept.isPending ? 'Salvando…' : 'Aceito'}
          </button>
        </div>
      </div>
    </div>
  );
}
