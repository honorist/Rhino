import { createResource } from '../../lib/createResource';
import { queryKeys } from '../../lib/queryKeys';
import type { NivelAcesso, User, UserInput } from './types';

/** Hooks de dados de Usuários — GET /api/users devolve `{ users: [...] }`. */
const usersResource = createResource<User, UserInput>({
  key: queryKeys.users,
  path: '/api/users',
  envelope: 'users',
});

export const useUsers = usersResource.useList;
export const useCreateUser = usersResource.useCreate;
export const useUpdateUser = usersResource.useUpdate;
export const useRemoveUser = usersResource.useRemove;

/** Níveis de acesso (perfis) — GET /api/niveis-acesso devolve `{ niveis: [...] }`. */
const niveisResource = createResource<NivelAcesso>({
  key: queryKeys.niveisAcesso,
  path: '/api/niveis-acesso',
  envelope: 'niveis',
});

export const useNiveisAcesso = niveisResource.useList;
