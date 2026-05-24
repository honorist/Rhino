/**
 * Liga o `_maskMoney` global do `lib/format.ts` ao perfil ativo do
 * `perfilStore`. Chamado uma vez no boot do App (App.tsx), antes do render.
 *
 * Quando o perfil contém `special:nao-ver-valores`, todas as chamadas a
 * `formatBRL` e `formatBRLk` retornam "R$ ●●●●" automaticamente — sem
 * precisar refatorar os ~80 call sites de toda a aplicação.
 *
 * Também aplica uma classe `body.mask-money` para que componentes não
 * monetários que mostrem `R$` literal (raros, mas existem) possam ser
 * estilizados via CSS se for o caso.
 */
import { podeVerValores, usePerfilStore } from '../features/auth/perfilStore';
import { setMaskMoney } from './format';

let installed = false;

function applyMask(podeVer: boolean): void {
  const mask = !podeVer;
  setMaskMoney(mask);
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('mask-money', mask);
  }
}

export function installMoneyMaskSubscription(): void {
  if (installed) return;
  installed = true;
  // Estado inicial
  applyMask(podeVerValores(usePerfilStore.getState().current));
  // Subscribe a mudanças de perfil
  usePerfilStore.subscribe((state) => {
    applyMask(podeVerValores(state.current));
  });
}
