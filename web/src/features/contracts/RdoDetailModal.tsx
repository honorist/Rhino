import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { useToast } from '../../components/ui/toast/ToastContext';
import { formatDateBR } from '../../lib/formatDate';
import type { Contract, Rdo, RdoMaoObra } from './types';
import { exportRdoPdf } from './exportRdoPdf';
import { rdoWhatsappText } from './rdoWhatsapp';
import RdoWhatsappModal from './RdoWhatsappModal';

const n = (v: unknown): number => Number(v) || 0;

const ACIDENTE_LABEL: Record<string, string> = {
  nao_houve: 'Sem acidentes',
  sem_afastamento: 'Acidente sem afastamento',
  com_afastamento: 'Acidente com afastamento',
};
const ACIDENTE_COR: Record<string, string> = {
  nao_houve: '#10b981',
  sem_afastamento: '#f59e0b',
  com_afastamento: '#dc2626',
};
const TEMPO_LABEL: Record<string, string> = {
  bom: '☀️ Bom',
  nublado: '⛅ Nublado',
  chuva: '🌧 Chuva',
};

/** `tempo` pode vir como objeto ou string JSON (às vezes dupla). Normaliza. */
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

function tempoLabel(v: unknown): string {
  const s = String(v ?? '');
  if (!s || s === 'nao_houve' || s === 'sem_expediente') return '—';
  return TEMPO_LABEL[s] ?? s;
}

function periodo(t: Record<string, unknown>, chave: string): string {
  const p = t[chave] as Record<string, unknown> | undefined;
  return tempoLabel(p?.tempo);
}

/** Tabela compacta de itens (mão de obra / equipamentos / atividades). */
function MiniTabela({
  titulo,
  colunas,
  linhas,
}: {
  titulo: string;
  colunas: { label: string; chave: string; centro?: boolean }[];
  linhas: Record<string, string | number>[];
}) {
  if (linhas.length === 0) return null;
  return (
    <div style={{ marginBottom: 'var(--sp-md)' }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
          marginBottom: 6,
        }}
      >
        {titulo}
      </div>
      <table style={{ width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th
                key={c.chave}
                style={{ textAlign: c.centro ? 'center' : 'left' }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              {colunas.map((c) => (
                <td
                  key={c.chave}
                  style={{ textAlign: c.centro ? 'center' : 'left' }}
                >
                  {l[c.chave] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoCard({ label, valor }: { label: string; valor: string }) {
  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'var(--color-surface-2)',
        borderRadius: 6,
      }}
    >
      <div className="text-muted" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div style={{ fontWeight: 600 }}>{valor}</div>
    </div>
  );
}

interface RdoDetailModalProps {
  rdo: Rdo;
  contract: Contract;
  onClose: () => void;
}

/** Modal de resumo de um RDO (somente leitura). */
export default function RdoDetailModal({
  rdo,
  contract,
  onClose,
}: RdoDetailModalProps) {
  const toast = useToast();
  const [exportando, setExportando] = useState(false);
  const [whatsOpen, setWhatsOpen] = useState(false);

  async function handlePdf() {
    setExportando(true);
    try {
      await exportRdoPdf(rdo, contract);
    } catch {
      toast.show('Falha ao gerar o PDF', 'danger');
    } finally {
      setExportando(false);
    }
  }

  const moi = rdo.moi ?? [];
  const mod = rdo.mod ?? [];
  const terc = rdo.terc ?? [];
  const eqp = rdo.equipamentos ?? [];
  const atv = rdo.atividades ?? [];
  const fotos = rdo.fotos ?? [];

  const qtd = (x: RdoMaoObra) => n(x.qtd ?? x.quantidade);
  const totMoi = moi.reduce((s, x) => s + qtd(x), 0);
  const totMod = mod.reduce((s, x) => s + qtd(x), 0);
  const totTerc = terc.reduce((s, x) => s + qtd(x), 0);

  const tempo = parseTempo(rdo.tempo);
  const prazo = rdo.prazo ?? {};
  const seg = rdo.seguranca ?? {};
  const acidente = String(seg.acidente ?? 'nao_houve');

  return (
    <Modal
      open
      title={`RDO #${rdo.numero ?? ''} — ${formatDateBR(rdo.data)}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button
            variant="secondary"
            onClick={() => setWhatsOpen(true)}
            title="Enviar resumo via WhatsApp"
          >
            💬 WhatsApp
          </Button>
          <Button onClick={handlePdf} disabled={exportando}>
            {exportando ? 'Gerando…' : '📄 Exportar PDF'}
          </Button>
        </>
      }
    >
      {whatsOpen && (
        <RdoWhatsappModal
          texto={rdoWhatsappText(rdo, contract)}
          onClose={() => setWhatsOpen(false)}
        />
      )}
      <p className="text-muted" style={{ marginTop: 0, fontSize: 13 }}>
        {contract.name}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 'var(--sp-sm)',
          marginBottom: 'var(--sp-md)',
        }}
      >
        <InfoCard label="Dia da semana" valor={rdo.diaSemana || '—'} />
        <InfoCard label="OS" valor={rdo.osNumero || '—'} />
        <InfoCard label="Ordem de compra" valor={rdo.ordemCompra || '—'} />
        <InfoCard label="Período" valor={rdo.periodoTrabalho || '—'} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-md)',
        }}
      >
        <div
          style={{
            padding: 'var(--sp-md)',
            background: 'var(--color-surface-2)',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <strong>Tempo</strong>
          <div>Manhã: {periodo(tempo, 'manha')}</div>
          <div>Tarde: {periodo(tempo, 'tarde')}</div>
          <div>Precipitação: {String(tempo.precipitacao ?? 0)} mm</div>
        </div>
        <div
          style={{
            padding: 'var(--sp-md)',
            background: 'var(--color-surface-2)',
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <strong>Prazo</strong>
          <div>Contratual: {String(prazo.contratual ?? 0)} dias</div>
          <div>Decorrido: {String(prazo.decorrido ?? 0)} dias</div>
          <div>% Concluído: {String(prazo.pctConcluida ?? 0)}%</div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-md)',
          textAlign: 'center',
        }}
      >
        <InfoCard label="MOI" valor={String(totMoi)} />
        <InfoCard label="MOD" valor={String(totMod)} />
        <InfoCard label="Terceiros" valor={String(totTerc)} />
      </div>

      <MiniTabela
        titulo="Mão de Obra Indireta (MOI)"
        colunas={[
          { label: 'Cargo', chave: 'cargo' },
          { label: 'Qtd', chave: 'qtd', centro: true },
          { label: 'Horas', chave: 'horas', centro: true },
        ]}
        linhas={moi.map((m) => ({
          cargo: m.cargo ?? '—',
          qtd: qtd(m),
          horas: n(m.horas) || 8,
        }))}
      />
      <MiniTabela
        titulo="Mão de Obra Direta (MOD)"
        colunas={[
          { label: 'Cargo', chave: 'cargo' },
          { label: 'Qtd', chave: 'qtd', centro: true },
          { label: 'Horas', chave: 'horas', centro: true },
        ]}
        linhas={mod.map((m) => ({
          cargo: m.cargo ?? '—',
          qtd: qtd(m),
          horas: n(m.horas) || 8,
        }))}
      />
      <MiniTabela
        titulo="Terceiros"
        colunas={[
          { label: 'Empresa/Cargo', chave: 'empresa' },
          { label: 'Qtd', chave: 'qtd', centro: true },
        ]}
        linhas={terc.map((m) => ({
          empresa: m.empresa ?? m.cargo ?? '—',
          qtd: qtd(m),
        }))}
      />
      <MiniTabela
        titulo="Equipamentos"
        colunas={[
          { label: 'Equipamento', chave: 'nome' },
          { label: 'Qtd', chave: 'qtd', centro: true },
          { label: 'Horas oper.', chave: 'horas', centro: true },
        ]}
        linhas={eqp.map((e) => ({
          nome: e.nome ?? '—',
          qtd: n(e.qtd ?? e.quantidade),
          horas: n(e.horasOperando ?? e.horas),
        }))}
      />
      <MiniTabela
        titulo="Atividades do dia"
        colunas={[
          { label: 'Descrição', chave: 'descricao' },
          { label: 'Executado', chave: 'pct', centro: true },
        ]}
        linhas={atv.map((a) => ({
          descricao: a.descricao ?? a.nome ?? '—',
          pct: `${n(a.pctExecutado ?? a.pct)}%`,
        }))}
      />

      <div
        style={{
          padding: 'var(--sp-md)',
          background: 'var(--color-surface-2)',
          borderRadius: 8,
          borderLeft: `3px solid ${ACIDENTE_COR[acidente] ?? '#999'}`,
          marginBottom: 'var(--sp-md)',
          fontSize: 13,
        }}
      >
        <strong>Segurança: </strong>
        <span style={{ color: ACIDENTE_COR[acidente], fontWeight: 700 }}>
          {ACIDENTE_LABEL[acidente] ?? acidente}
        </span>
        {seg.comentarios ? <div>Observações: {String(seg.comentarios)}</div> : null}
      </div>

      {rdo.fiscalizacaoComentarios && (
        <div
          style={{
            padding: 'var(--sp-md)',
            background: 'var(--color-surface-2)',
            borderRadius: 8,
            marginBottom: 'var(--sp-md)',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
          }}
        >
          <strong>Fiscalização: </strong>
          {rdo.fiscalizacaoComentarios}
        </div>
      )}

      {fotos.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginBottom: 8,
            }}
          >
            Fotos ({fotos.length})
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: 8,
            }}
          >
            {fotos.slice(0, 12).map((f, i) => (
              <div
                key={f.id ?? i}
                style={{
                  aspectRatio: '1',
                  background: 'var(--color-surface-2)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                {f.url && (
                  <img
                    src={f.url}
                    alt={f.legenda || ''}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
