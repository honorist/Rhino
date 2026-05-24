import { describe, expect, it } from 'vitest';
import type { Contract } from './types';
import { buildTimeline } from './timeline';

const CONTRACT: Contract = {
  id: 'c1',
  name: 'Obra Alfa',
  client: 'Cliente X',
  status: 'ativo',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  aditivos: [{ id: 'a1', numero: '1', data: '2026-06-01', descricao: 'Extra' }],
  marcos: [{ id: 'm1', titulo: 'Fundação', prazo: '2026-03-01' }],
  ocorrencias: [
    { id: 'o1', data: '2026-02-01', descricao: 'Chuva', severidade: 'alta' },
  ],
  rdos: [{ id: 'r1', numero: 5, data: '2026-04-01' }],
};

const NFS = [
  { contractId: 'c1', dataEmissao: '2026-05-01', valor: 1_000, numero: 'NF1' },
  { contractId: 'c2', dataEmissao: '2026-05-02', valor: 999 },
];

describe('buildTimeline', () => {
  const eventos = buildTimeline(CONTRACT, NFS);

  it('agrega eventos de todas as fontes do contrato', () => {
    // início + fim + aditivo + marco + ocorrência + rdo + 1 medição.
    expect(eventos).toHaveLength(7);
  });

  it('ordena por data crescente', () => {
    const datas = eventos.map((e) => e.date);
    expect(datas).toEqual([...datas].sort());
    expect(eventos[0].tipo).toBe('contrato');
    expect(eventos[0].date).toBe('2026-01-01');
  });

  it('ignora notas fiscais de outros contratos', () => {
    expect(eventos.filter((e) => e.tipo === 'medicao')).toHaveLength(1);
  });
});
