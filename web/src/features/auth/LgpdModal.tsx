import * as Dialog from '@radix-ui/react-dialog';
import { useAcceptTerms, useLogout } from './queries';

/**
 * Modal LGPD que aparece após o login enquanto !user.acceptedTermsAt.
 * Porte de showTermosModal em js/app.js. Radix Dialog garante focus trap,
 * tab order e ARIA — `onEscapeKeyDown`/`onPointerDownOutside` com
 * preventDefault bloqueiam fechamento acidental: o usuário PRECISA decidir
 * (aceitar ou sair).
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
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[10001] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[10001] flex max-h-[90vh] w-full max-w-[720px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[10px] bg-card text-card-foreground shadow-2xl"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="border-b border-border p-6">
            <Dialog.Title className="m-0 text-xl font-bold">
              Termos de uso e tratamento de dados (LGPD)
            </Dialog.Title>
          </div>
          <Dialog.Description className="sr-only">
            Para usar o Rhino você precisa aceitar os termos abaixo ou sair do sistema.
          </Dialog.Description>
          <div className="overflow-y-auto p-6 text-sm leading-relaxed">
            <p className="mb-3">
              <strong>Rhino — Sistema de gestão empresarial.</strong> Ao usar este
              sistema você concorda com o tratamento dos seus dados pessoais nos
              termos abaixo.
            </p>
            <h3 className="mb-2.5 mt-3.5 text-base font-semibold">1. Controlador</h3>
            <p className="mb-3">Rhino Manutenções.</p>

            <h3 className="mb-2.5 mt-3.5 text-base font-semibold">2. Dados tratados</h3>
            <ul className="mb-3 ml-5 list-disc">
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

            <h3 className="mb-2.5 mt-3.5 text-base font-semibold">3. Finalidade</h3>
            <p className="mb-3">
              Gestão administrativa, financeira e operacional; emissão de medições,
              controle de folgas, pagamentos, conformidade trabalhista e fiscal.
            </p>

            <h3 className="mb-2.5 mt-3.5 text-base font-semibold">4. Direitos do titular</h3>
            <p className="mb-2">Você tem direito a:</p>
            <ul className="mb-3 ml-5 list-disc">
              <li>Confirmar tratamento e acessar seus dados</li>
              <li>Corrigir, anonimizar ou eliminar dados</li>
              <li>Solicitar portabilidade ou revogar consentimento</li>
            </ul>

            <h3 className="mb-2.5 mt-3.5 text-base font-semibold">5. Segurança</h3>
            <ul className="mb-3 ml-5 list-disc">
              <li>Senhas com hash bcrypt; cookies httpOnly + SameSite=Lax</li>
              <li>Tráfego HTTPS em produção; rate limit em login</li>
              <li>Logs estruturados para auditoria</li>
            </ul>

            <h3 className="mb-2.5 mt-3.5 text-base font-semibold">6. Aceite</h3>
            <p className="mb-3">
              Ao clicar em <strong>"Aceito"</strong>, você confirma que leu e
              concorda. O aceite é registrado com data/hora.
            </p>

            <p className="m-0 text-[13px] text-muted-foreground">
              Versão 1.0 · {new Date().toLocaleDateString('pt-BR')}
            </p>
          </div>
          <div className="flex justify-end gap-4 border-t border-border p-6">
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
