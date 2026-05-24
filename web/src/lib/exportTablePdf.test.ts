import { describe, expect, it } from 'vitest';
import { buildTablePdfBody } from './exportTablePdf';

interface Row extends Record<string, unknown> {
  data: string;
  valor: number;
  obs?: string | null;
}

describe('buildTablePdfBody', () => {
  it('usa label quando definido; caso contrário usa key', () => {
    const { head } = buildTablePdfBody<Row>(
      [{ key: 'data', label: 'Data' }, { key: 'valor' }, { key: 'obs', label: 'Observação' }],
      [],
    );
    expect(head).toEqual([['Data', 'valor', 'Observação']]);
  });

  it('aplica format() na célula quando presente', () => {
    const { body } = buildTablePdfBody<Row>(
      [
        { key: 'data', label: 'Data' },
        { key: 'valor', label: 'Valor', format: (v) => `R$ ${Number(v).toFixed(2)}` },
      ],
      [
        { data: '2025-01-15', valor: 100 },
        { data: '2025-02-01', valor: 250.5 },
      ],
    );
    expect(body).toEqual([
      ['2025-01-15', 'R$ 100.00'],
      ['2025-02-01', 'R$ 250.50'],
    ]);
  });

  it('null/undefined viram string vazia sem formatter', () => {
    const { body } = buildTablePdfBody<Row>(
      [{ key: 'obs' }],
      [{ data: '', valor: 0, obs: null }, { data: '', valor: 0 }],
    );
    expect(body).toEqual([[''], ['']]);
  });

  it('row pode ser repassado ao formatter', () => {
    const { body } = buildTablePdfBody<Row>(
      [{ key: 'valor', format: (v, row) => `${row.data}=${v}` }],
      [{ data: '2025-01-01', valor: 9 }],
    );
    expect(body).toEqual([['2025-01-01=9']]);
  });
});
