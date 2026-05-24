import { describe, expect, it } from 'vitest';
import { buildBmInputFromSaida } from './bmFromSaida';
import type { Contract } from './types';

const contract = {
  id: 'C1',
  name: 'Obra Acme',
  client: 'Acme',
  status: 'em_andamento',
  value: 100000,
} as unknown as Contract;

describe('buildBmInputFromSaida', () => {
  it('retorna null para saída inexistente', () => {
    const r = buildBmInputFromSaida({
      contract,
      saidaId: 'X',
      saidas: [],
      notasFiscais: [],
    });
    expect(r).toBeNull();
  });

  it('retorna null se a saída é de outro contrato', () => {
    const r = buildBmInputFromSaida({
      contract,
      saidaId: 'S1',
      saidas: [{ id: 'S1', contractId: 'OUTRO' }],
      notasFiscais: [],
    });
    expect(r).toBeNull();
  });

  it('associa NF da saída via nfId', () => {
    const r = buildBmInputFromSaida({
      contract,
      saidaId: 'S1',
      saidas: [{ id: 'S1', contractId: 'C1', nfId: 'N1' }],
      notasFiscais: [{ id: 'N1', contractId: 'C1', numero: '001', valor: 1000 }],
    });
    expect(r).not.toBeNull();
    expect(r!.nf?.numero).toBe('001');
  });

  it('nf null quando saída sem nfId', () => {
    const r = buildBmInputFromSaida({
      contract,
      saidaId: 'S1',
      saidas: [{ id: 'S1', contractId: 'C1' }],
      notasFiscais: [],
    });
    expect(r!.nf).toBeNull();
    expect(r!.saidasDoDia).toEqual([r!.saida]);
  });

  it('nfsContrato vem cronológica por dataLimite', () => {
    const r = buildBmInputFromSaida({
      contract,
      saidaId: 'S1',
      saidas: [{ id: 'S1', contractId: 'C1', nfId: 'N2' }],
      notasFiscais: [
        { id: 'N2', contractId: 'C1', dataLimite: '2025-03-15' },
        { id: 'N1', contractId: 'C1', dataLimite: '2025-02-15' },
        { id: 'N3', contractId: 'C1', dataLimite: '2025-04-15' },
        { id: 'X', contractId: 'OUTRO', dataLimite: '2025-01-01' },
      ],
    });
    expect(r!.nfsContrato?.map((n) => n.id) ?? []).toEqual(['N1', 'N2', 'N3']);
  });

  it('nfsAnteriores são as NFs ANTES da atual', () => {
    const r = buildBmInputFromSaida({
      contract,
      saidaId: 'S1',
      saidas: [{ id: 'S1', contractId: 'C1', nfId: 'N2' }],
      notasFiscais: [
        { id: 'N1', contractId: 'C1', dataLimite: '2025-02-15' },
        { id: 'N2', contractId: 'C1', dataLimite: '2025-03-15' },
        { id: 'N3', contractId: 'C1', dataLimite: '2025-04-15' },
      ],
    });
    expect(r!.nfsAnteriores?.map((n) => n.id) ?? []).toEqual(['N1']);
  });

  it('saidasDoDia agrupa todas as saídas com a mesma nfId, em ordem de createdAt', () => {
    const r = buildBmInputFromSaida({
      contract,
      saidaId: 'S2',
      saidas: [
        { id: 'S2', contractId: 'C1', nfId: 'N1', createdAt: '2025-03-01T10:00' },
        { id: 'S1', contractId: 'C1', nfId: 'N1', createdAt: '2025-03-01T09:00' },
        { id: 'S3', contractId: 'C1', nfId: 'OUTRA', createdAt: '2025-03-01T11:00' },
      ],
      notasFiscais: [{ id: 'N1', contractId: 'C1' }],
    });
    expect(r!.saidasDoDia!.map((s) => (s as { id: string }).id)).toEqual(['S1', 'S2']);
  });
});
