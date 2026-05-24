/**
 * Tipos do subsistema de autenticação.
 */

/** Usuário autenticado (espelha handler /api/auth/me). */
export interface CurrentUser {
  id: string;
  email: string;
  name?: string | null;
  nivelAcessoId?: string | null;
  socioId?: string | null;
  /** ISO timestamp do aceite LGPD; null/undefined = ainda não aceitou. */
  acceptedTermsAt?: string | null;
}

/** Resposta de /api/auth/me. */
export interface MeResponse {
  user: CurrentUser;
  permissions?: unknown;
}

/** Resposta de POST /api/auth/login. */
export interface LoginResponse {
  user: CurrentUser;
}

/** Nível de acesso (porte de data/niveis_acesso.json). */
export interface NivelAcesso {
  id: string;
  label: string;
  icon: string;
  cor: string;
  /**
   * Lista de rotas/abas permitidas. As rotas usam o formato hash do legacy
   * (ex.: '#/dashboard'). Strings com prefixo "edit:" ou "contrato-tab:"
   * carregam permissões granulares.
   */
  abas: string[];
}

/** Resposta de GET /api/niveis-acesso. */
export interface NiveisAcessoResponse {
  niveis: NivelAcesso[];
}
