import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  abas,
  podeAcessar,
  podeContractTab,
  podeEditar,
  podeVerValores,
  primeiraAba,
  usePerfilStore,
} from './perfilStore';
import type { NivelAcesso } from './types';

const gerente: NivelAcesso = {
  id: 'gerente',
  label: 'Gerente',
  icon: '👔',
  cor: '#7C3AED',
  abas: ['#/dashboard', '#/contratos', 'edit:#/contratos', 'contrato-tab:visao'],
};

const operador: NivelAcesso = {
  id: 'operador',
  label: 'Operador',
  icon: '👷',
  cor: '#06b6d4',
  abas: ['special:nao-ver-valores'],
};

beforeEach(() => {
  sessionStorage.clear();
  usePerfilStore.getState().clear();
});
afterEach(() => sessionStorage.clear());

describe('usePerfilStore', () => {
  it('inicia com null quando storage vazio', () => {
    expect(usePerfilStore.getState().current).toBeNull();
  });

  it('set persiste em sessionStorage e atualiza state', () => {
    usePerfilStore.getState().set(gerente);
    expect(usePerfilStore.getState().current?.id).toBe('gerente');
    expect(JSON.parse(sessionStorage.getItem('rhino-perfil')!).id).toBe('gerente');
  });

  it('clear remove do sessionStorage', () => {
    usePerfilStore.getState().set(gerente);
    usePerfilStore.getState().clear();
    expect(usePerfilStore.getState().current).toBeNull();
    expect(sessionStorage.getItem('rhino-perfil')).toBeNull();
  });
});

describe('abas / podeAcessar', () => {
  it('sem perfil libera tudo (compat)', () => {
    expect(abas(null)).toBeNull();
    expect(podeAcessar(null, '#/auditoria')).toBe(true);
  });

  it('libera rota presente nas abas', () => {
    expect(podeAcessar(gerente, '#/contratos')).toBe(true);
  });

  it('barra rota fora das abas', () => {
    expect(podeAcessar(gerente, '#/auditoria')).toBe(false);
  });

  it('rotas universais passam mesmo sem aba', () => {
    expect(podeAcessar(gerente, '#/manual')).toBe(true);
    expect(podeAcessar(gerente, '#/frota')).toBe(true);
  });

  it('rotas de detalhe usam a permissão da rota pai', () => {
    expect(podeAcessar(gerente, '#/contratos/abc-123')).toBe(true);
  });
});

describe('podeVerValores', () => {
  it('libera quando sem perfil', () => {
    expect(podeVerValores(null)).toBe(true);
  });

  it('libera quando não tem flag', () => {
    expect(podeVerValores(gerente)).toBe(true);
  });

  it('mascara quando perfil tem special:nao-ver-valores', () => {
    expect(podeVerValores(operador)).toBe(false);
  });
});

describe('podeEditar', () => {
  it('libera sem perfil', () => {
    expect(podeEditar(null, '#/contratos')).toBe(true);
  });

  it('exige prefixo edit:', () => {
    expect(podeEditar(gerente, '#/contratos')).toBe(true);
    expect(podeEditar(gerente, '#/dashboard')).toBe(false);
  });

  it('rota vazia → barra', () => {
    expect(podeEditar(gerente, '')).toBe(false);
  });
});

describe('podeContractTab', () => {
  it('cronograma e timeline são universais', () => {
    expect(podeContractTab(operador, 'cronograma')).toBe(true);
    expect(podeContractTab(operador, 'timeline')).toBe(true);
  });

  it('perfil sem nenhuma contrato-tab → libera todas (legado)', () => {
    expect(podeContractTab(operador, 'financeiro')).toBe(true);
  });

  it('perfil com contrato-tab restringe ao listado', () => {
    expect(podeContractTab(gerente, 'visao')).toBe(true);
    expect(podeContractTab(gerente, 'financeiro')).toBe(false);
  });
});

describe('primeiraAba', () => {
  it('default /dashboard sem perfil', () => {
    expect(primeiraAba(null)).toBe('#/dashboard');
  });

  it('default /dashboard com perfil sem abas', () => {
    const vazio: NivelAcesso = { ...gerente, abas: [] };
    expect(primeiraAba(vazio)).toBe('#/dashboard');
  });

  it('devolve a primeira aba quando há lista', () => {
    expect(primeiraAba(gerente)).toBe('#/dashboard');
  });
});
