import { describe, expect, it } from 'vitest';
import { formatarPlaca, normalizarPlaca, placaValida } from './placa';

describe('normalizarPlaca', () => {
  it('remove separadores, deixa maiúsculo e limita a 7', () => {
    expect(normalizarPlaca('abc-1234')).toBe('ABC1234');
    expect(normalizarPlaca('abc1d23xxx')).toBe('ABC1D23');
  });
});

describe('formatarPlaca', () => {
  it('insere hífen no padrão antigo', () => {
    expect(formatarPlaca('ABC1234')).toBe('ABC-1234');
  });

  it('separa as 3 primeiras letras com hífen (4ª posição é sempre dígito)', () => {
    expect(formatarPlaca('ABC1D23')).toBe('ABC-1D23');
  });

  it('não formata enquanto há 3 caracteres ou menos', () => {
    expect(formatarPlaca('AB')).toBe('AB');
  });
});

describe('placaValida', () => {
  it('aceita o padrão antigo', () => {
    expect(placaValida('ABC-1234')).toBe(true);
  });

  it('aceita o padrão Mercosul', () => {
    expect(placaValida('ABC1D23')).toBe(true);
  });

  it('rejeita placas incompletas ou malformadas', () => {
    expect(placaValida('ABC123')).toBe(false);
    expect(placaValida('1234567')).toBe(false);
  });
});
