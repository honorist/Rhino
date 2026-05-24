import { describe, expect, it, vi } from 'vitest';
import { buildCommandIndex, filterCommands, normalize } from './commandIndex';

describe('normalize', () => {
  it('remove acentos e minimiza', () => {
    expect(normalize('Operação')).toBe('operacao');
    expect(normalize('CONFIGURAÇÃO')).toBe('configuracao');
  });

  it('vazio para null/undefined', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });
});

describe('buildCommandIndex', () => {
  const navigate = vi.fn();
  const toggleTheme = vi.fn();
  const toggleHighContrast = vi.fn();

  it('inclui rotas mas não detalhes com :id', () => {
    const items = buildCommandIndex({ navigate, toggleTheme });
    const labels = items.map((i) => i.label);
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Contratos');
    // Não deve incluir rota com :id
    expect(items.some((i) => /:id/.test(i.label))).toBe(false);
  });

  it('rota "Ir para" navega ao path declarado', () => {
    const items = buildCommandIndex({ navigate, toggleTheme });
    const dash = items.find((i) => i.label === 'Dashboard');
    expect(dash).toBeDefined();
    dash!.run();
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('inclui ações globais Tema e Manual', () => {
    const items = buildCommandIndex({ navigate, toggleTheme });
    expect(items.some((i) => i.hint === 'Tema')).toBe(true);
    expect(items.some((i) => i.hint === 'Ajuda')).toBe(true);
  });

  it('inclui alto contraste só quando handler fornecido', () => {
    const semHC = buildCommandIndex({ navigate, toggleTheme });
    expect(semHC.some((i) => /alto contraste/i.test(i.label))).toBe(false);
    const comHC = buildCommandIndex({ navigate, toggleTheme, toggleHighContrast });
    expect(comHC.some((i) => /alto contraste/i.test(i.label))).toBe(true);
  });
});

describe('filterCommands', () => {
  const navigate = vi.fn();
  const toggleTheme = vi.fn();
  const items = buildCommandIndex({ navigate, toggleTheme });

  it('vazia devolve tudo', () => {
    expect(filterCommands(items, '')).toHaveLength(items.length);
    expect(filterCommands(items, '   ')).toHaveLength(items.length);
  });

  it('busca por label sem acento', () => {
    const r = filterCommands(items, 'configuracao');
    expect(r.some((i) => i.label === 'Configuração')).toBe(true);
  });

  it('busca por hint', () => {
    const r = filterCommands(items, 'tema');
    expect(r.some((i) => i.hint === 'Tema')).toBe(true);
  });

  it('não casa devolve []', () => {
    expect(filterCommands(items, 'xyzwwwww')).toEqual([]);
  });
});
