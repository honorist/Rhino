/**
 * Placa de veículo — normalização, máscara e validação. Aceita o padrão
 * antigo (ABC-1234) e o Mercosul (ABC1D23). Porte de Frota.js.
 */

/** Remove tudo que não é alfanumérico, maiúsculo, máx. 7 caracteres. */
export function normalizarPlaca(input: string): string {
  return (input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7);
}

/**
 * Aplica a máscara conforme o padrão detectado: padrão antigo recebe hífen
 * (ABC-1234); Mercosul fica sem hífen (ABC1D23).
 */
export function formatarPlaca(input: string): string {
  const limpa = normalizarPlaca(input);
  if (limpa.length <= 3) return limpa;
  // 4ª posição: dígito → padrão antigo; letra → Mercosul.
  if (/[0-9]/.test(limpa[3])) {
    return `${limpa.slice(0, 3)}-${limpa.slice(3)}`;
  }
  return limpa;
}

/** Valida placa no padrão antigo (ABC1234) ou Mercosul (ABC1D23). */
export function placaValida(input: string): boolean {
  const limpa = normalizarPlaca(input);
  if (limpa.length !== 7) return false;
  if (/^[A-Z]{3}[0-9]{4}$/.test(limpa)) return true;
  if (/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(limpa)) return true;
  return false;
}
