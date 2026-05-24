import { describe, expect, it } from 'vitest';
import type { Veiculo } from '../../types/domain';
import { proximaManut } from './proximaManut';

function veiculo(over: Partial<Veiculo>): Veiculo {
  return { id: 'v1', placa: 'ABC1234', kmAtual: 10_000, ...over };
}

describe('proximaManut', () => {
  it('devolve null quando não há plano ativo', () => {
    expect(proximaManut(veiculo({ planos: [] }))).toBeNull();
  });

  it('calcula os KM restantes a partir do último KM', () => {
    const prox = proximaManut(
      veiculo({
        kmAtual: 10_000,
        planos: [
          { id: 'p1', descricao: 'Óleo', intervaloKm: 10_000, ultimoKm: 5_000 },
        ],
      }),
    );

    expect(prox?.kmRest).toBe(5_000);
    expect(prox?.status).toBe('vigente');
  });

  it('marca como vencido quando os KM restantes são <= 0', () => {
    const prox = proximaManut(
      veiculo({
        kmAtual: 10_000,
        planos: [
          { id: 'p1', descricao: 'Óleo', intervaloKm: 10_000, ultimoKm: 0 },
        ],
      }),
    );

    expect(prox?.kmRest).toBe(0);
    expect(prox?.status).toBe('vencido');
  });

  it('marca como próximo quando faltam <= 500 km', () => {
    const prox = proximaManut(
      veiculo({
        kmAtual: 10_000,
        planos: [
          { id: 'p1', descricao: 'Óleo', intervaloKm: 10_000, ultimoKm: 300 },
        ],
      }),
    );

    expect(prox?.kmRest).toBe(300);
    expect(prox?.status).toBe('proximo');
  });

  it('escolhe o plano mais urgente entre vários', () => {
    const prox = proximaManut(
      veiculo({
        kmAtual: 10_000,
        planos: [
          { id: 'p1', descricao: 'Óleo', intervaloKm: 10_000, ultimoKm: 5_000 },
          { id: 'p2', descricao: 'Freio', intervaloKm: 10_000, ultimoKm: 1_000 },
        ],
      }),
    );

    expect(prox?.plano.id).toBe('p2');
  });
});
