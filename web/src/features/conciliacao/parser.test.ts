import { describe, expect, it } from 'vitest';
import { isOfxContent, parseCSV, parseOFX } from './parser';

const OFX_SAMPLE = `
<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260115120000[-3:BRT]
<TRNAMT>-150.00
<FITID>ABC123
<MEMO>Pagamento fornecedor X
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260120120000
<TRNAMT>2000.00
<FITID>DEF456
<MEMO>Recebimento cliente
</STMTTRN>
</OFX>
`;

describe('isOfxContent', () => {
  it('detecta OFX pela extensão', () => {
    expect(isOfxContent('extrato.ofx', '')).toBe(true);
  });
  it('detecta OFX pelo conteúdo', () => {
    expect(isOfxContent('extrato.txt', '<STMTTRN>...')).toBe(true);
  });
  it('trata CSV como não-OFX', () => {
    expect(isOfxContent('extrato.csv', 'Data;Valor')).toBe(false);
  });
});

describe('parseOFX', () => {
  it('extrai transações com sinal correto', () => {
    const txs = parseOFX(OFX_SAMPLE);
    expect(txs).toHaveLength(2);
    expect(txs[0]).toMatchObject({
      date: '2026-01-15',
      value: 150,
      type: 'saida',
      description: 'Pagamento fornecedor X',
    });
    expect(txs[1]).toMatchObject({
      date: '2026-01-20',
      value: 2000,
      type: 'entrada',
    });
  });
});

describe('parseCSV', () => {
  it('faz parse de CSV com separador ";" e número BR', () => {
    const csv = [
      'Data;Valor;Descricao',
      '15/01/2026;-1.250,50;Aluguel galpão',
      '20/01/2026;3.000,00;Recebimento',
    ].join('\n');
    const txs = parseCSV(csv);
    expect(txs).toHaveLength(2);
    expect(txs[0]).toMatchObject({
      date: '2026-01-15',
      value: 1250.5,
      type: 'saida',
      description: 'Aluguel galpão',
    });
    expect(txs[1].type).toBe('entrada');
  });

  it('ignora linhas sem data válida', () => {
    const csv = ['linha lixo', '10/02/2026;100,00;Item'].join('\n');
    expect(parseCSV(csv)).toHaveLength(1);
  });
});
