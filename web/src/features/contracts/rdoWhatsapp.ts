/**
 * Gera o texto formatado para colar no grupo de WhatsApp da obra.
 * Porte de js/views/contrato/rdos.js (linhas ~376-404).
 * Função pura — testável sem React.
 */
import type { Contract, Rdo, RdoMaoObra, RdoEquipamento, RdoAtividade } from './types';

const TEMPO_LABEL: Record<string, string> = {
  bom: 'Bom',
  nublado: 'Nublado',
  chuva: 'Chuva',
  sem_expediente: 'Sem expediente',
  nao_houve: '—',
};

const ACIDENTE_LABEL: Record<string, string> = {
  nao_houve: 'Sem ocorrências',
  sem_afastamento: 'Acidente sem afastamento',
  com_afastamento: 'Acidente COM afastamento',
};

function fmt(d?: string | null): string {
  if (!d) return '';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
}

function n(v: unknown): number {
  return Number(v) || 0;
}

function climaPeriodo(p: { tempo?: string } | undefined): string | null {
  if (!p?.tempo) return null;
  return TEMPO_LABEL[p.tempo] ?? p.tempo;
}

/**
 * Monta o texto-padrão do RDO para o grupo de WhatsApp.
 * Idêntico ao do legacy (mesmos emojis e estrutura).
 */
export function rdoWhatsappText(rdo: Rdo, contract: Contract): string {
  const moi = (rdo.moi ?? []) as RdoMaoObra[];
  const mod = (rdo.mod ?? []) as RdoMaoObra[];
  const terc = (rdo.terc ?? []) as RdoMaoObra[];
  const eqp = (rdo.equipamentos ?? []) as RdoEquipamento[];
  const atv = (rdo.atividades ?? []) as RdoAtividade[];
  const fotos = (rdo.fotos ?? []) as unknown[];

  const totMoi = moi.reduce((s, x) => s + n(x.qtd ?? x.quantidade), 0);
  const totMod = mod.reduce((s, x) => s + n(x.qtd ?? x.quantidade), 0);
  const totTerc = terc.reduce((s, x) => s + n(x.qtd ?? x.quantidade), 0);
  const totEfetivo = totMoi + totMod + totTerc;

  const equipNomes = eqp
    .map((e) => e.nome)
    .filter((s): s is string => !!s)
    .join(', ');

  const atividadesTxt = atv
    .map((a) => (a.descricao || a.nome || '').trim())
    .filter(Boolean)
    .map((d) => `• ${d}`)
    .join('\n');

  // Tempo pode vir como string JSON ou objeto.
  let tempo: { manha?: { tempo?: string }; tarde?: { tempo?: string } } = {};
  try {
    tempo =
      typeof rdo.tempo === 'string'
        ? (JSON.parse(rdo.tempo) as typeof tempo)
        : ((rdo.tempo as typeof tempo) ?? {});
  } catch {
    tempo = {};
  }
  const cManha = climaPeriodo(tempo.manha);
  const cTarde = climaPeriodo(tempo.tarde);
  const climaTxt =
    cManha && cTarde
      ? cManha === cTarde
        ? cManha
        : `${cManha} de manhã, ${cTarde} à tarde`
      : cManha || cTarde || '—';

  const seg = (rdo.seguranca ?? {}) as { acidente?: string };
  const acidenteLbl = ACIDENTE_LABEL[String(seg.acidente ?? 'nao_houve')] ?? '—';

  const linhas = [
    `📋 *RDO ${rdo.numero ?? ''} — ${fmt(rdo.data)}${rdo.diaSemana ? ` (${rdo.diaSemana})` : ''}*`,
    `🏗️ *${contract.name ?? ''}*`,
    '',
    `🌡️ Clima: ${climaTxt}`,
    totEfetivo > 0 ? `👷 Equipe: ${totEfetivo} no canteiro` : '',
    totEfetivo > 0 ? `   (${totMoi} MOI · ${totMod} MOD · ${totTerc} terceiros)` : '',
    equipNomes ? `🔧 Equipamentos: ${equipNomes}` : '',
    atividadesTxt ? `\n✅ *O que foi feito hoje:*\n${atividadesTxt}` : '',
    `\n🦺 Segurança: ${acidenteLbl}`,
    rdo.fiscalizacaoComentarios ? `📝 Obs: ${rdo.fiscalizacaoComentarios}` : '',
    fotos.length ? `📷 ${fotos.length} foto${fotos.length !== 1 ? 's' : ''}` : '',
  ];

  return linhas.filter(Boolean).join('\n');
}
