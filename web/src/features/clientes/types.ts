/**
 * Tipos do domínio Cliente (CRM) — detalhados na migração de Clientes.js.
 */
export interface Cliente {
  id: string;
  nome: string;
  empresa?: string;
  cargo?: string;
  setor?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  notas?: string;
  /** Email de acesso ao Portal do Cliente (quando habilitado). */
  portalEmail?: string;
  createdAt?: string;
}

/** Payload de criação/edição de cliente. */
export interface ClienteInput {
  nome: string;
  empresa?: string;
  cargo?: string;
  setor?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  notas?: string;
  portalEmail?: string;
  /** Senha do portal — vazio na edição mantém a atual. */
  portalSenha?: string;
  /** Marca para revogar o acesso ao portal. */
  removerPortalAcesso?: boolean;
}
