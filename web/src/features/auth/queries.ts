import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type {
  CurrentUser,
  LoginResponse,
  MeResponse,
  NiveisAcessoResponse,
} from './types';

// Re-export para callers já existentes (Apresentacao, Base, etc.)
export type { CurrentUser };

/**
 * Usuário logado — GET /api/auth/me.
 * Não faz retry: 401 (sessão ausente) é um resultado esperado, não um erro
 * a insistir. Consumidores tratam `data` ausente como "não autenticado".
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => api.get<MeResponse>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** Lista de níveis de acesso — pública (server.js libera GET sem auth). */
export function useNiveisAcesso() {
  return useQuery({
    queryKey: queryKeys.niveisAcesso,
    queryFn: () => api.get<NiveisAcessoResponse>('/api/niveis-acesso'),
    staleTime: 10 * 60_000,
  });
}

interface LoginInput {
  email: string;
  password: string;
}

/** POST /api/auth/login. Em sucesso, invalida `currentUser`. */
export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api.post<LoginResponse>('/api/auth/login', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.currentUser });
    },
  });
}

/** POST /api/auth/logout. Limpa o cache local. */
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>('/api/auth/logout'),
    onSuccess: () => {
      qc.clear();
    },
  });
}

/** POST /api/auth/accept-terms (LGPD). */
export function useAcceptTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>('/api/auth/accept-terms'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.currentUser });
    },
  });
}

interface ForgotResponse {
  message?: string;
}

/** POST /api/auth/forgot-password — não invalida nada. */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<ForgotResponse>('/api/auth/forgot-password', { email }),
  });
}
