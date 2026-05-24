import { describe, expect, it } from 'vitest';
import { inferirNivelOrganograma, iniciais } from './organograma';

describe('inferirNivelOrganograma', () => {
  it('reconhece encarregado', () => {
    expect(inferirNivelOrganograma('Encarregado de Obras')).toBe('encarregado');
  });

  it('reconhece líder de área por palavras-chave', () => {
    expect(inferirNivelOrganograma('Líder de Mecânica')).toBe('lider_area');
    expect(inferirNivelOrganograma('Supervisor de Campo')).toBe('lider_area');
    expect(inferirNivelOrganograma('Coordenador')).toBe('lider_area');
  });

  it('usa profissional como padrão', () => {
    expect(inferirNivelOrganograma('Pedreiro')).toBe('profissional');
    expect(inferirNivelOrganograma('')).toBe('profissional');
    expect(inferirNivelOrganograma(null)).toBe('profissional');
  });
});

describe('iniciais', () => {
  it('usa a primeira e a última palavra', () => {
    expect(iniciais('João Pedro Silva')).toBe('JS');
  });

  it('usa as duas primeiras letras de um nome único', () => {
    expect(iniciais('João')).toBe('JO');
  });

  it('devolve "?" para nome vazio', () => {
    expect(iniciais('')).toBe('?');
  });
});
