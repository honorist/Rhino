/** Usuário (login) — campos confirmados em js/views/Usuarios.js. */
export interface User {
  id: string;
  email: string;
  name?: string | null;
  nivelAcessoId?: string | null;
  isActive?: boolean;
  lastLoginAt?: string | null;
}

/** Nível de acesso (perfil) — usado como lookup. */
export interface NivelAcesso {
  id: string;
  label: string;
  icon?: string;
  cor?: string;
}

/** Payload de criação/edição de usuário. */
export interface UserInput {
  email: string;
  name?: string | null;
  /** Senha — obrigatória na criação, opcional na edição (vazio = não altera). */
  password?: string;
  nivelAcessoId?: string | null;
  isActive?: boolean;
}
