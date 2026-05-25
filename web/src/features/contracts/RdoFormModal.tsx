import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import FormField from '../../components/ui/FormField';
import { Input, Select, Textarea } from '../../components/ui/controls';
import { DatePicker } from '../../components/ui/date-picker';
import { useToast } from '../../components/ui/toast/ToastContext';
import { todayISO } from '../../lib/formatDate';
import type { Contract, Rdo } from './types';
import { useCreateRdo, useUpdateRdo } from './queries';
import {
  RDO_COND_OPCOES,
  RDO_EQP_TIPOS,
  RDO_MOD_CARGOS,
  RDO_MOI_CARGOS,
  RDO_TEMPO_OPCOES,
  calcPrazo,
  diaSemanaFromISO,
  rdoTotais,
  type AtvForm,
  type EqpForm,
  type MoForm,
  type RdoFormData,
  type TercForm,
} from './rdoForm';

const n = (v: unknown): number => Number(v) || 0;

const TABS = [
  { k: 'cabecalho', l: 'Cabeçalho' },
  { k: 'tempo', l: 'Tempo' },
  { k: 'mo', l: 'Mão de Obra' },
  { k: 'equipamentos', l: 'Equipamentos' },
  { k: 'atividades', l: 'Atividades' },
  { k: 'seguranca', l: 'Segurança' },
  { k: 'fiscalizacao', l: 'Fiscalização' },
] as const;

const PERIODOS = ['7:00 às 15:00', '7:00 às 17:00', '23:00 às 7:00', 'Outro', 'Manual'];

/** Quando periodoTrabalho começa com este prefixo, é uma jornada manual
 *  (gravada no formato "HH:MM às HH:MM"). */
const PERIODO_MANUAL_FLAG = 'Manual';

function isPeriodoManual(p: string): boolean {
  if (p === PERIODO_MANUAL_FLAG) return true;
  // Já gravado como "HH:MM às HH:MM"
  return /^\d{1,2}:\d{2}\s+às\s+\d{1,2}:\d{2}$/.test(p) && !PERIODOS.includes(p);
}

function parseHorasManual(p: string): { inicio: string; fim: string } {
  const m = p.match(/^(\d{1,2}:\d{2})\s+às\s+(\d{1,2}:\d{2})$/);
  return m ? { inicio: m[1], fim: m[2] } : { inicio: '07:00', fim: '17:00' };
}
const ACIDENTES = [
  { v: 'nao_houve', l: 'Não Houve' },
  { v: 'sem_afastamento', l: 'Sem Afastamento' },
  { v: 'com_afastamento', l: 'Com Afastamento' },
];

/** `tempo` do RDO pode vir como objeto ou string JSON. Normaliza. */
function parseTempo(raw: unknown): Record<string, unknown> {
  let t = raw;
  for (let i = 0; i < 3 && typeof t === 'string'; i++) {
    try {
      t = JSON.parse(t);
    } catch {
      t = {};
    }
  }
  return t && typeof t === 'object' ? (t as Record<string, unknown>) : {};
}

function periodoTempo(t: Record<string, unknown>, k: string) {
  const p = (t[k] as Record<string, unknown>) ?? {};
  return {
    tempo: String(p.tempo ?? 'bom'),
    condicoes: String(p.condicoes ?? 'operavel'),
  };
}

/** Estado inicial do formulário — novo RDO ou edição. */
function initialForm(contract: Contract, rdo: Rdo | null): RdoFormData {
  if (!rdo) {
    const data = todayISO();
    return {
      data,
      diaSemana: diaSemanaFromISO(data),
      osNumero: '',
      periodoTrabalho: PERIODOS[0],
      horaExtra: false,
      prazo: calcPrazo(contract, data),
      tempo: {
        manha: { tempo: 'bom', condicoes: 'operavel' },
        tarde: { tempo: 'bom', condicoes: 'operavel' },
        noiteAnt: { tempo: 'bom', condicoes: 'operavel' },
        precipitacao: 0,
      },
      moi: [],
      mod: [],
      terc: [],
      equipamentos: [],
      atividades: [],
      seguranca: {
        temaDds: '',
        temaMeioAmbiente: '',
        acidente: 'nao_houve',
        diagnostico: '',
        comentarios: '',
      },
      fiscalizacaoComentarios: '',
    };
  }
  const t = parseTempo(rdo.tempo);
  const prazo = (rdo.prazo ?? {}) as Record<string, unknown>;
  const seg = (rdo.seguranca ?? {}) as Record<string, unknown>;
  const data = String(rdo.data ?? todayISO());
  return {
    data,
    diaSemana: rdo.diaSemana ?? diaSemanaFromISO(data),
    osNumero: rdo.osNumero ?? '',
    periodoTrabalho: rdo.periodoTrabalho ?? PERIODOS[0],
    horaExtra: Boolean(rdo.horaExtra),
    prazo: {
      ...calcPrazo(contract, data, n(prazo.pctConcluida)),
    },
    tempo: {
      manha: periodoTempo(t, 'manha'),
      tarde: periodoTempo(t, 'tarde'),
      noiteAnt: periodoTempo(t, 'noiteAnt'),
      precipitacao: n(t.precipitacao),
    },
    // US-03: backfill — horasNormais herda 'horas' antigo (default 9); extras = 0
    moi: (rdo.moi ?? []).map((m) => ({
      cargo: m.cargo ?? '',
      qtd: n(m.qtd ?? m.quantidade),
      horasNormais: n(m.horasNormais ?? m.horas) || 9,
      horasExtras: n(m.horasExtras) || 0,
    })),
    mod: (rdo.mod ?? []).map((m) => ({
      cargo: m.cargo ?? '',
      qtd: n(m.qtd ?? m.quantidade),
      horasNormais: n(m.horasNormais ?? m.horas) || 9,
      horasExtras: n(m.horasExtras) || 0,
    })),
    terc: (rdo.terc ?? []).map((m) => ({
      empresa: m.empresa ?? '',
      cargo: m.cargo ?? '',
      qtd: n(m.qtd ?? m.quantidade),
      horasNormais: n(m.horasNormais ?? m.horas) || 9,
      horasExtras: n(m.horasExtras) || 0,
    })),
    equipamentos: (rdo.equipamentos ?? []).map((e) => ({
      nome: e.nome ?? '',
      qtd: n(e.qtd ?? e.quantidade),
      horas: n(e.horasOperando ?? e.horas),
    })),
    atividades: (rdo.atividades ?? []).map((a) => ({
      area: String((a as Record<string, unknown>).area ?? ''),
      descricao: a.descricao ?? a.nome ?? '',
      pctConcluida: n(a.pctExecutado ?? a.pct),
      ocorrencias: String((a as Record<string, unknown>).ocorrencias ?? ''),
    })),
    seguranca: {
      temaDds: String(seg.temaDds ?? ''),
      temaMeioAmbiente: String(seg.temaMeioAmbiente ?? ''),
      acidente: String(seg.acidente ?? 'nao_houve'),
      diagnostico: String(seg.diagnostico ?? ''),
      comentarios: String(seg.comentarios ?? ''),
    },
    fiscalizacaoComentarios: rdo.fiscalizacaoComentarios ?? '',
  };
}

interface RdoFormModalProps {
  contract: Contract;
  rdo: Rdo | null;
  onClose: () => void;
}

/** Formulário de RDO (criação/edição) — modal com abas internas. */
export default function RdoFormModal({
  contract,
  rdo,
  onClose,
}: RdoFormModalProps) {
  const toast = useToast();
  const criar = useCreateRdo();
  const editar = useUpdateRdo();
  const isEdit = Boolean(rdo);

  const [tab, setTab] = useState<string>('cabecalho');
  const [form, setForm] = useState<RdoFormData>(() =>
    initialForm(contract, rdo),
  );
  const pending = criar.isPending || editar.isPending;

  function patch(updates: Partial<RdoFormData>) {
    setForm((f) => ({ ...f, ...updates }));
  }
  function setData(data: string) {
    patch({
      data,
      diaSemana: diaSemanaFromISO(data),
      prazo: calcPrazo(contract, data, form.prazo.pctConcluida),
    });
  }

  // ── Listas dinâmicas ──
  function addMo(cat: 'moi' | 'mod') {
    patch({
      [cat]: [
        ...form[cat],
        { cargo: '', qtd: 1, horasNormais: 9, horasExtras: 0 },
      ],
    });
  }
  function updMo(cat: 'moi' | 'mod', i: number, p: Partial<MoForm>) {
    patch({ [cat]: form[cat].map((x, j) => (j === i ? { ...x, ...p } : x)) });
  }
  function rmMo(cat: 'moi' | 'mod', i: number) {
    patch({ [cat]: form[cat].filter((_, j) => j !== i) });
  }

  function submit() {
    if (!form.data) {
      toast.show('Data é obrigatória', 'danger');
      return;
    }
    const payload = {
      ...form,
      diaSemana: diaSemanaFromISO(form.data),
      totais: rdoTotais(form),
    };
    const handlers = {
      onSuccess: () => {
        toast.show(isEdit ? 'RDO atualizado' : 'RDO criado', 'success');
        onClose();
      },
      onError: (e: Error) => toast.show(e.message, 'danger'),
    };
    if (rdo) {
      editar.mutate(
        { contractId: contract.id, rdoId: rdo.id, input: payload },
        handlers,
      );
    } else {
      criar.mutate({ contractId: contract.id, input: payload }, handlers);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? `Editar RDO #${rdo?.numero ?? ''}` : 'Novo RDO'}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Criar RDO'}
          </Button>
        </>
      }
    >
      <p className="text-muted" style={{ marginTop: 0, fontSize: 13 }}>
        {contract.name}
      </p>

      <div
        style={{
          display: 'flex',
          gap: 2,
          borderBottom: '1px solid var(--color-border)',
          overflowX: 'auto',
          marginBottom: 'var(--sp-md)',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            style={{
              padding: '8px 12px',
              border: 'none',
              borderBottom: `3px solid ${tab === t.k ? 'var(--color-primary)' : 'transparent'}`,
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === t.k ? 600 : 400,
              color: tab === t.k ? 'var(--color-primary)' : 'var(--color-text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'cabecalho' && (
        <CabecalhoTab form={form} patch={patch} setData={setData} />
      )}
      {tab === 'tempo' && <TempoTab form={form} patch={patch} />}
      {tab === 'mo' && (
        <MoTab form={form} addMo={addMo} updMo={updMo} rmMo={rmMo} patch={patch} />
      )}
      {tab === 'equipamentos' && <EquipamentosTab form={form} patch={patch} />}
      {tab === 'atividades' && <AtividadesTab form={form} patch={patch} />}
      {tab === 'seguranca' && <SegurancaTab form={form} patch={patch} />}
      {tab === 'fiscalizacao' && (
        <FormField label="Comentários da Fiscalização" htmlFor="rdo-fisc">
          <Textarea
            id="rdo-fisc"
            rows={8}
            value={form.fiscalizacaoComentarios}
            onChange={(e) =>
              patch({ fiscalizacaoComentarios: e.target.value })
            }
          />
        </FormField>
      )}
    </Modal>
  );
}

type PatchFn = (u: Partial<RdoFormData>) => void;

function InfoBox({ label, valor }: { label: string; valor: string }) {
  return (
    <div
      style={{
        padding: '8px 12px',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
      }}
    >
      <div className="text-muted" style={{ fontSize: 11, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontWeight: 600 }}>{valor || '—'}</div>
    </div>
  );
}

/** US-01: período "Manual" com hora início + fim. Grava como
 *  "HH:MM às HH:MM" no campo periodoTrabalho (zero migração de banco). */
function PeriodoTrabalho({ form, patch }: { form: RdoFormData; patch: PatchFn }) {
  const manual = isPeriodoManual(form.periodoTrabalho);
  const { inicio, fim } = parseHorasManual(form.periodoTrabalho);
  const erro =
    manual && inicio && fim && inicio !== fim && inicio >= fim
      ? 'Hora de término deve ser maior que a de início'
      : null;

  function changeOption(v: string) {
    if (v === PERIODO_MANUAL_FLAG) {
      // Inicia com 07:00 às 17:00 (defaults razoáveis)
      patch({ periodoTrabalho: '07:00 às 17:00' });
    } else {
      patch({ periodoTrabalho: v });
    }
  }

  function changeHora(qual: 'inicio' | 'fim', valor: string) {
    const novo = qual === 'inicio' ? `${valor} às ${fim}` : `${inicio} às ${valor}`;
    patch({ periodoTrabalho: novo });
  }

  // Valor mostrado no Select: a opção fixa se for uma das pré-definidas;
  // 'Manual' se for um horário customizado.
  const selectValue = PERIODOS.includes(form.periodoTrabalho)
    ? form.periodoTrabalho
    : PERIODO_MANUAL_FLAG;

  return (
    <>
      <FormField label="Período de Trabalho" htmlFor="rdo-per">
        <Select
          id="rdo-per"
          value={selectValue}
          onChange={(e) => changeOption(e.target.value)}
        >
          {PERIODOS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </FormField>
      {manual && (
        <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <FormField label="Hora início" htmlFor="rdo-hora-ini">
              <Input
                id="rdo-hora-ini"
                type="time"
                value={inicio}
                onChange={(e) => changeHora('inicio', e.target.value)}
              />
            </FormField>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <FormField label="Hora término" htmlFor="rdo-hora-fim">
              <Input
                id="rdo-hora-fim"
                type="time"
                value={fim}
                onChange={(e) => changeHora('fim', e.target.value)}
              />
            </FormField>
          </div>
        </div>
      )}
      {erro && (
        <div
          style={{
            color: 'var(--color-danger)',
            fontSize: 13,
            marginTop: -8,
            marginBottom: 8,
          }}
        >
          ⚠️ {erro}
        </div>
      )}
    </>
  );
}

function CabecalhoTab({
  form,
  patch,
  setData,
}: {
  form: RdoFormData;
  patch: PatchFn;
  setData: (d: string) => void;
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="Data *" htmlFor="rdo-data">
            <DatePicker
              id="rdo-data"
              value={form.data}
              onChange={setData}
              placeholder="Selecione a data do RDO"
            />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <FormField label="Dia da Semana" htmlFor="rdo-dsem">
            <Input id="rdo-dsem" value={form.diaSemana} readOnly />
          </FormField>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <FormField label="Nº Ordem de Serviço" htmlFor="rdo-os">
            <Input
              id="rdo-os"
              value={form.osNumero}
              onChange={(e) => patch({ osNumero: e.target.value })}
              placeholder="Ex: OS-2026-042"
            />
          </FormField>
        </div>
      </div>
      <PeriodoTrabalho form={form} patch={patch} />
      <label
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={form.horaExtra}
          onChange={(e) => patch({ horaExtra: e.target.checked })}
        />
        Hora Extra
      </label>

      <h4 style={{ marginTop: 'var(--sp-lg)' }}>⏱ Prazo do Contrato</h4>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <InfoBox label="Contratual" valor={`${form.prazo.contratual} dias`} />
        <InfoBox label="Decorrido" valor={`${form.prazo.decorrido} dias`} />
        <InfoBox
          label={form.prazo.atraso > 0 ? 'Atraso' : 'Faltante'}
          valor={`${form.prazo.atraso > 0 ? form.prazo.atraso : form.prazo.faltante} dias`}
        />
      </div>
      <FormField
        label="% Concluída"
        htmlFor="rdo-pct"
        helper="Datas e dias são calculados automaticamente; edite só o % conforme o avanço."
      >
        <Input
          id="rdo-pct"
          type="number"
          step="0.1"
          value={String(form.prazo.pctConcluida)}
          onChange={(e) =>
            patch({
              prazo: { ...form.prazo, pctConcluida: Number(e.target.value) || 0 },
            })
          }
        />
      </FormField>
    </>
  );
}

function TempoTab({ form, patch }: { form: RdoFormData; patch: PatchFn }) {
  const periodos: { k: 'manha' | 'tarde' | 'noiteAnt'; l: string }[] = [
    { k: 'manha', l: 'Manhã' },
    { k: 'tarde', l: 'Tarde' },
    { k: 'noiteAnt', l: 'Noite Ant.' },
  ];
  return (
    <>
      {periodos.map((p) => (
        <div
          key={p.k}
          style={{
            padding: 'var(--sp-md)',
            background: 'var(--color-surface-2)',
            borderRadius: 8,
            marginBottom: 'var(--sp-md)',
          }}
        >
          <strong>{p.l}</strong>
          <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <FormField label="Tempo">
                <Select
                  value={form.tempo[p.k].tempo}
                  onChange={(e) =>
                    patch({
                      tempo: {
                        ...form.tempo,
                        [p.k]: { ...form.tempo[p.k], tempo: e.target.value },
                      },
                    })
                  }
                >
                  {RDO_TEMPO_OPCOES.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.l}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <FormField label="Condições da Área">
                <Select
                  value={form.tempo[p.k].condicoes}
                  onChange={(e) =>
                    patch({
                      tempo: {
                        ...form.tempo,
                        [p.k]: { ...form.tempo[p.k], condicoes: e.target.value },
                      },
                    })
                  }
                >
                  {RDO_COND_OPCOES.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.l}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>
        </div>
      ))}
      <FormField label="Precipitação (mm)" htmlFor="rdo-prec">
        <Input
          id="rdo-prec"
          type="number"
          step="0.1"
          value={String(form.tempo.precipitacao)}
          onChange={(e) =>
            patch({
              tempo: { ...form.tempo, precipitacao: Number(e.target.value) || 0 },
            })
          }
        />
      </FormField>
    </>
  );
}

function MoTab({
  form,
  addMo,
  updMo,
  rmMo,
  patch,
}: {
  form: RdoFormData;
  addMo: (c: 'moi' | 'mod') => void;
  updMo: (c: 'moi' | 'mod', i: number, p: Partial<MoForm>) => void;
  rmMo: (c: 'moi' | 'mod', i: number) => void;
  patch: PatchFn;
}) {
  const secoes: { k: 'moi' | 'mod'; l: string; cargos: string[] }[] = [
    { k: 'moi', l: 'Mão de Obra Indireta (MOI)', cargos: RDO_MOI_CARGOS },
    { k: 'mod', l: 'Mão de Obra Direta (MOD)', cargos: RDO_MOD_CARGOS },
  ];
  function addTerc() {
    patch({
      terc: [
        ...form.terc,
        { empresa: '', cargo: '', qtd: 1, horasNormais: 9, horasExtras: 0 },
      ],
    });
  }
  function updTerc(i: number, p: Partial<TercForm>) {
    patch({ terc: form.terc.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  }
  return (
    <>
      <datalist id="rdo-moi-list">
        {RDO_MOI_CARGOS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="rdo-mod-list">
        {RDO_MOD_CARGOS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {secoes.map((sec) => (
        <div key={sec.k} style={{ marginBottom: 'var(--sp-lg)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--sp-sm)',
            }}
          >
            <h4 style={{ margin: 0 }}>{sec.l}</h4>
            <Button size="sm" onClick={() => addMo(sec.k)}>
              + Adicionar
            </Button>
          </div>
          {form[sec.k].length === 0 ? (
            <p className="text-muted" style={{ fontSize: 13 }}>
              Nenhum item.
            </p>
          ) : (
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Cargo</th>
                  <th style={{ width: 80 }}>Qtd</th>
                  <th style={{ width: 100 }} title="Horas normais por pessoa (default 9)">H. Normais</th>
                  <th style={{ width: 100 }} title="Horas extras por pessoa">H. Extras</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {form[sec.k].map((m, i) => (
                  <tr key={i}>
                    <td>
                      <Input
                        list={`rdo-${sec.k}-list`}
                        value={m.cargo}
                        onChange={(e) =>
                          updMo(sec.k, i, { cargo: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        value={String(m.qtd)}
                        onChange={(e) =>
                          updMo(sec.k, i, { qtd: Number(e.target.value) || 0 })
                        }
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={String(m.horasNormais)}
                        onChange={(e) =>
                          updMo(sec.k, i, {
                            horasNormais: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                    <td>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={String(m.horasExtras)}
                        onChange={(e) =>
                          updMo(sec.k, i, {
                            horasExtras: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                    <td>
                      <a
                        className="action-link danger"
                        style={{ cursor: 'pointer' }}
                        onClick={() => rmMo(sec.k, i)}
                      >
                        ✕
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--sp-sm)',
        }}
      >
        <h4 style={{ margin: 0 }}>Terceirizados</h4>
        <Button size="sm" onClick={addTerc}>
          + Adicionar
        </Button>
      </div>
      {form.terc.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Nenhum terceirizado.
        </p>
      ) : (
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Cargo</th>
              <th style={{ width: 70 }}>Qtd</th>
              <th style={{ width: 90 }}>H. Normais</th>
              <th style={{ width: 90 }}>H. Extras</th>
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {form.terc.map((t, i) => (
              <tr key={i}>
                <td>
                  <Input
                    value={t.empresa}
                    onChange={(e) => updTerc(i, { empresa: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    value={t.cargo}
                    onChange={(e) => updTerc(i, { cargo: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    value={String(t.qtd)}
                    onChange={(e) =>
                      updTerc(i, { qtd: Number(e.target.value) || 0 })
                    }
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={String(t.horasNormais)}
                    onChange={(e) =>
                      updTerc(i, { horasNormais: Number(e.target.value) || 0 })
                    }
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={String(t.horasExtras)}
                    onChange={(e) =>
                      updTerc(i, { horasExtras: Number(e.target.value) || 0 })
                    }
                  />
                </td>
                <td>
                  <a
                    className="action-link danger"
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      patch({ terc: form.terc.filter((_, j) => j !== i) })
                    }
                  >
                    ✕
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function EquipamentosTab({
  form,
  patch,
}: {
  form: RdoFormData;
  patch: PatchFn;
}) {
  function upd(i: number, p: Partial<EqpForm>) {
    patch({
      equipamentos: form.equipamentos.map((x, j) =>
        j === i ? { ...x, ...p } : x,
      ),
    });
  }
  return (
    <>
      <datalist id="rdo-eqp-list">
        {RDO_EQP_TIPOS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--sp-sm)',
        }}
      >
        <h4 style={{ margin: 0 }}>Equipamentos</h4>
        <Button
          size="sm"
          onClick={() =>
            patch({
              equipamentos: [
                ...form.equipamentos,
                { nome: '', qtd: 1, horas: 9 },
              ],
            })
          }
        >
          + Adicionar
        </Button>
      </div>
      {form.equipamentos.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Nenhum equipamento.
        </p>
      ) : (
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Equipamento</th>
              <th style={{ width: 90 }}>Qtd</th>
              <th style={{ width: 90 }}>Horas</th>
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {form.equipamentos.map((e, i) => (
              <tr key={i}>
                <td>
                  <Input
                    list="rdo-eqp-list"
                    value={e.nome}
                    onChange={(ev) => upd(i, { nome: ev.target.value })}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    value={String(e.qtd)}
                    onChange={(ev) => upd(i, { qtd: Number(ev.target.value) || 0 })}
                  />
                </td>
                <td>
                  <Input
                    type="number"
                    step="0.5"
                    value={String(e.horas)}
                    onChange={(ev) =>
                      upd(i, { horas: Number(ev.target.value) || 0 })
                    }
                  />
                </td>
                <td>
                  <a
                    className="action-link danger"
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      patch({
                        equipamentos: form.equipamentos.filter(
                          (_, j) => j !== i,
                        ),
                      })
                    }
                  >
                    ✕
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function AtividadesTab({
  form,
  patch,
}: {
  form: RdoFormData;
  patch: PatchFn;
}) {
  function upd(i: number, p: Partial<AtvForm>) {
    patch({
      atividades: form.atividades.map((x, j) => (j === i ? { ...x, ...p } : x)),
    });
  }
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--sp-md)',
        }}
      >
        <h4 style={{ margin: 0 }}>Atividades do Dia</h4>
        <Button
          size="sm"
          onClick={() =>
            patch({
              atividades: [
                ...form.atividades,
                { area: '', descricao: '', pctConcluida: 0, ocorrencias: '' },
              ],
            })
          }
        >
          + Nova Atividade
        </Button>
      </div>
      {form.atividades.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Nenhuma atividade.
        </p>
      ) : (
        form.atividades.map((a, i) => (
          <div
            key={i}
            style={{
              padding: 'var(--sp-md)',
              background: 'var(--color-surface-2)',
              borderRadius: 8,
              marginBottom: 'var(--sp-md)',
            }}
          >
            <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 110 }}>
                <FormField label="Área">
                  <Input
                    value={a.area}
                    onChange={(e) => upd(i, { area: e.target.value })}
                  />
                </FormField>
              </div>
              <div style={{ flex: 2, minWidth: 160 }}>
                <FormField label="Descrição">
                  <Input
                    value={a.descricao}
                    onChange={(e) => upd(i, { descricao: e.target.value })}
                  />
                </FormField>
              </div>
              <div style={{ width: 110 }}>
                <FormField label="% Concluída">
                  <Input
                    type="number"
                    step="0.1"
                    value={String(a.pctConcluida)}
                    onChange={(e) =>
                      upd(i, { pctConcluida: Number(e.target.value) || 0 })
                    }
                  />
                </FormField>
              </div>
            </div>
            <FormField label="Ocorrências / Alertas">
              <Textarea
                rows={2}
                value={a.ocorrencias}
                onChange={(e) => upd(i, { ocorrencias: e.target.value })}
              />
            </FormField>
            <a
              className="action-link danger"
              style={{ cursor: 'pointer' }}
              onClick={() =>
                patch({ atividades: form.atividades.filter((_, j) => j !== i) })
              }
            >
              ✕ Remover atividade
            </a>
          </div>
        ))
      )}
    </>
  );
}

function SegurancaTab({ form, patch }: { form: RdoFormData; patch: PatchFn }) {
  const seg = form.seguranca;
  const setSeg = (p: Partial<RdoFormData['seguranca']>) =>
    patch({ seguranca: { ...seg, ...p } });
  return (
    <>
      <FormField label="🛡️ Tema do DDS" htmlFor="rdo-dds">
        <Input
          id="rdo-dds"
          value={seg.temaDds}
          onChange={(e) => setSeg({ temaDds: e.target.value })}
          placeholder="Ex: Uso correto de EPI"
        />
      </FormField>
      <FormField label="🌱 Tema de Meio Ambiente" htmlFor="rdo-ma">
        <Input
          id="rdo-ma"
          value={seg.temaMeioAmbiente}
          onChange={(e) => setSeg({ temaMeioAmbiente: e.target.value })}
        />
      </FormField>
      <FormField label="Houve Acidente?">
        <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
          {ACIDENTES.map((o) => (
            <label
              key={o.v}
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            >
              <input
                type="radio"
                name="rdo-acidente"
                checked={seg.acidente === o.v}
                onChange={() => setSeg({ acidente: o.v })}
              />
              {o.l}
            </label>
          ))}
        </div>
      </FormField>
      {seg.acidente !== 'nao_houve' && (
        <FormField label="Diagnóstico" htmlFor="rdo-diag">
          <Textarea
            id="rdo-diag"
            rows={2}
            value={seg.diagnostico}
            onChange={(e) => setSeg({ diagnostico: e.target.value })}
          />
        </FormField>
      )}
      <FormField label="Comentários da Segurança" htmlFor="rdo-segcom">
        <Textarea
          id="rdo-segcom"
          rows={4}
          value={seg.comentarios}
          onChange={(e) => setSeg({ comentarios: e.target.value })}
        />
      </FormField>
    </>
  );
}
