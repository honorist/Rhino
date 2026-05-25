import { useActionState, useTransition } from 'react';

/**
 * Estado retornado por uma form action no padrão React 19.
 * `ok=true` → sucesso; `ok=false` → erro com mensagem para exibir no FormField.
 */
export type FormActionState =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }
  | { ok: 'idle' };

const IDLE: FormActionState = { ok: 'idle' };

/**
 * Hook React 19 `useActionState` adaptado ao padrão de mutation do Rhino.
 * O `action` recebe o FormData (ou input livre) e devolve sucesso/erro.
 * O pending state vem de graça — sem precisar de `isSubmitting` manual.
 *
 * Uso:
 *   const [state, submitAction, pending] = useFormAction(async (_prev, fd) => {
 *     try {
 *       await api.post('/clientes', Object.fromEntries(fd));
 *       return { ok: true };
 *     } catch (err) {
 *       return { ok: false, error: (err as Error).message };
 *     }
 *   });
 *   <form action={submitAction}>...<button disabled={pending}>Salvar</button></form>
 */
export function useFormAction<TInput = FormData>(
  action: (prev: FormActionState, input: TInput) => Promise<FormActionState>,
) {
  return useActionState<FormActionState, TInput>(action, IDLE);
}

/**
 * Wrapper de uma mutation imperativa (não-form) com pending state via
 * useTransition. Útil quando você precisa disparar uma mutation a partir
 * de um clique fora de form (delete button, toggle, etc.).
 */
export function useImperativeAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => void | Promise<void>) => {
    startTransition(() => {
      void fn();
    });
  };
  return { pending, run };
}
