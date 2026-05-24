import { describe, expect, it } from 'vitest';
import {
  calcAReceberPagar,
  calcAportes,
  calcColaboradores,
  calcCoberturaMeses,
  calcFaturadoMes,
  calcNfsSituacao,
  calcPipeline,
  calcProspeccao,
  calcScoreSaude,
  calcSparklines,
  primeiroNome,
  saudacao,
} from './dashboardCalc';

describe('saudacao', () => {
  it('Bom dia antes do meio-dia', () => expect(saudacao(8)).toBe('Bom dia'));
  it('Boa tarde 12-17', () => expect(saudacao(14)).toBe('Boa tarde'));
  it('Boa noite a partir das 18', () => expect(saudacao(19)).toBe('Boa noite'));
});

describe('primeiroNome', () => {
  it('extrai primeiro nome', () => expect(primeiroNome('Honorio Silva')).toBe('Honorio'));
  it('usa parte antes do @ em emails', () =>
    expect(primeiroNome('honorio@x.com')).toBe('honorio'));
  it('null/undefined viram visitante', () => {
    expect(primeiroNome(null)).toBe('visitante');
    expect(primeiroNome(undefined)).toBe('visitante');
  });
});

describe('calcFaturadoMes', () => {
  const hoje = new Date('2026-04-15T12:00:00');
  it('soma entradas do mês corrente', () => {
    const r = calcFaturadoMes(
      [
        { type: 'entrada', date: '2026-04-01', value: 1000 },
        { type: 'entrada', date: '2026-04-10', value: 500 },
        { type: 'saida', date: '2026-04-05', value: 200 },
        { type: 'entrada', date: '2026-03-30', value: 9999 }, // mês anterior
      ],
      hoje,
    );
    expect(r.faturadoMes).toBe(1500);
  });

  it('delta % positivo quando faturou mais que mês ant', () => {
    const r = calcFaturadoMes(
      [
        { type: 'entrada', date: '2026-04-10', value: 1500 },
        { type: 'entrada', date: '2026-03-10', value: 1000 },
      ],
      hoje,
    );
    expect(r.deltaPct).toBe(50);
  });

  it('delta zero quando mês ant é zero', () => {
    const r = calcFaturadoMes(
      [{ type: 'entrada', date: '2026-04-10', value: 1500 }],
      hoje,
    );
    expect(r.deltaPct).toBe(0);
  });
});

describe('calcAportes', () => {
  it('soma sócios + investimentos com origem empresa', () => {
    const total = calcAportes(
      [{ aporte: 10000 }, { aporteTotal: 5000 }],
      [
        { origem: 'empresa', value: 3000 },
        { origem: 'banco', value: 100000 }, // ignorado
      ],
    );
    expect(total).toBe(18000);
  });

  it('zero quando vazio', () => expect(calcAportes([], [])).toBe(0));
});

describe('calcProspeccao', () => {
  it('conta rascunho + enviada como prospecção; valor potencial só dessas', () => {
    const r = calcProspeccao([
      { status: 'rascunho', valorTotal: 1000 },
      { status: 'enviada', valorTotal: 2000 },
      { status: 'aceita', valorTotal: 99999 },
      { status: 'rejeitada', valorTotal: 9999 },
    ]);
    expect(r.prospeccaoTotal).toBe(2);
    expect(r.valorPotencial).toBe(3000);
    expect(r.aceita).toBe(1);
  });
});

describe('calcColaboradores', () => {
  it('separa funcionário vs candidato', () => {
    const r = calcColaboradores([
      { status: 'funcionario' },
      { status: 'funcionario' },
      { status: 'candidato' },
    ]);
    expect(r).toEqual({ ativos: 2, candidatos: 1 });
  });
});

describe('calcAReceberPagar', () => {
  const hoje = new Date('2026-04-15T12:00:00');
  it('NFs emitidas sem caixaEntry → a receber', () => {
    const r = calcAReceberPagar(
      [
        { emitida: true, valor: 5000 },
        { emitida: true, valor: 1000, caixaEntryId: 'x' }, // já recebida
        { emitida: false, valor: 9999 }, // pendente
      ],
      [],
      hoje,
    );
    expect(r.totalAReceber).toBe(5000);
    expect(r.nfsEmitidas).toBe(2);
    expect(r.nfsPendentes).toBe(1);
  });

  it('contas com vencimento ≤ +30d', () => {
    const r = calcAReceberPagar(
      [],
      [
        { status: 'pendente', valor: 500, dataVencimento: '2026-04-20' },
        { status: 'pendente', valor: 1000, dataVencimento: '2026-06-01' }, // fora
        { status: 'paga', valor: 9999, dataVencimento: '2026-04-20' }, // não pendente
      ],
      hoje,
    );
    expect(r.totalAPagar30d).toBe(500);
    expect(r.cp30dCount).toBe(1);
  });
});

describe('calcPipeline', () => {
  it('saídas sem nfId → rascunho; NFs distribuídas por estágio', () => {
    const r = calcPipeline(
      [
        { valor: 100 }, // sem emitida nem caixa → aguardEmissao
        { valor: 200, emitida: true }, // → nfEmitida
        { valor: 300, emitida: true, caixaEntryId: 'x' }, // → recebida
      ],
      [{ value: 50 }, { value: 70, nfId: 'N1' }], // 50 vai p/ rascunho
    );
    expect(r.rascunho).toEqual({ count: 1, valor: 50 });
    expect(r.aguardEmissao).toEqual({ count: 1, valor: 100 });
    expect(r.nfEmitida).toEqual({ count: 1, valor: 200 });
    expect(r.recebida).toEqual({ count: 1, valor: 300 });
  });
});

describe('calcCoberturaMeses', () => {
  const hoje = new Date('2026-04-15T12:00:00');
  it('saldo / saída média mensal últimos 90d', () => {
    const r = calcCoberturaMeses(
      30000,
      [
        { type: 'saida', date: '2026-02-15', value: 5000 },
        { type: 'saida', date: '2026-03-15', value: 5000 },
        { type: 'saida', date: '2026-04-01', value: 5000 },
        // saída antiga (fora dos 90d) — ignorada
        { type: 'saida', date: '2025-12-01', value: 99999 },
      ],
      hoje,
    );
    // 15000 / 3 = 5000 média; 30000 / 5000 = 6 meses
    expect(r).toBeCloseTo(6, 4);
  });

  it('zero quando sem saídas', () => {
    expect(calcCoberturaMeses(1000, [], hoje)).toBe(0);
  });
});

describe('calcSparklines', () => {
  it('produz arrays do tamanho esperado', () => {
    const r = calcSparklines([{ type: 'entrada', date: '2026-04-10', value: 100 }], 10);
    expect(r.saldo).toHaveLength(10);
    expect(r.entradasAcum).toHaveLength(10);
    expect(r.saidasAcum).toHaveLength(10);
    expect(r.entradaDia).toHaveLength(10);
  });
});

describe('calcScoreSaude', () => {
  it('score 100 quando tudo saudável', () => {
    const r = calcScoreSaude(50, 25, 10000);
    expect(r.score).toBe(100);
    expect(r.label).toBe('Saudável');
  });

  it('penaliza taxa despesa alta e margem negativa', () => {
    const r = calcScoreSaude(85, -5, 5000);
    // -40 (taxa) -30 (margem) = 30 → Crítico
    expect(r.score).toBe(30);
    expect(r.label).toBe('Crítico');
  });

  it('penalidade média para taxa 60-80 e margem 0-10', () => {
    const r = calcScoreSaude(70, 5, 10000);
    // -20 -15 = 65 → Atenção
    expect(r.score).toBe(65);
    expect(r.label).toBe('Atenção');
  });
});

describe('calcNfsSituacao', () => {
  const hoje = new Date('2026-04-15T12:00:00');
  it('classifica NFs não-emitidas por dataLimite', () => {
    const r = calcNfsSituacao(
      [
        { emitida: false, dataLimite: '2026-04-10' }, // vencida
        { emitida: false, dataLimite: '2026-04-20' }, // próx 7d
        { emitida: false, dataLimite: '2026-05-30' }, // no prazo
        { emitida: true, dataLimite: '2026-04-10' }, // emitida → ignora
      ],
      hoje,
    );
    expect(r).toEqual({ vencidas: 1, proximas7d: 1, noPrazo: 1 });
  });
});
