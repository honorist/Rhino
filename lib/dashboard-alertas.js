'use strict';
/**
 * @file Alertas do dashboard operacional — quando um indicador crítico (doc de
 * colaborador vencido, manutenção de equipamento atrasada, revisão de frota
 * vencida) está presente, dispara 1 notificação in-app (`/api/notificacoes`,
 * mesmo mecanismo do sino usado por punch-itens/recrutamento/sugestões).
 *
 * Consultas próprias (não reusa handleDashboardOperacional) — só os 3 contadores
 * que viram alerta, cada um com o mesmo SQL usado em handlers/dashboards.js pros
 * KPIs equivalentes. Resiliente: uma query falhando não derruba as outras.
 *
 * Dedup: no máximo 1 notificação por tipo por dia (checa created_at::date antes
 * de criar) — chamar isto de hora em hora (como o scheduler de push já faz) não
 * spamma o usuário.
 */

const THRESHOLDS = [
  {
    tipo: 'dashboard.docs_vencidos',
    query: `
      WITH ds AS (
        SELECT NULLIF(doc.val->>'uploadedAt', '')::timestamptz
                 + (t.periodicidade_meses || ' months')::interval AS vence_em
        FROM recursos r,
             jsonb_each(r.documentos) AS doc(tipo, val),
             doc_templates t
        WHERE r.status = 'funcionario'
          AND r.documentos IS NOT NULL
          AND r.documentos != '{}'::jsonb
          AND t.id = doc.tipo
          AND t.periodicidade_meses IS NOT NULL
          AND (doc.val->>'uploadedAt') IS NOT NULL
      )
      SELECT COUNT(*) FILTER (WHERE vence_em < NOW())::int AS n FROM ds`,
    build: (n) => ({
      titulo: 'Documentos vencidos',
      mensagem: `${n} documento(s) de colaboradores vencido(s)`,
      link: '#/recursos',
    }),
  },
  {
    tipo: 'dashboard.manutencao_atrasada',
    query: `
      SELECT COUNT(*) FILTER (WHERE status = 'aprovada'
        AND data_retorno_prevista IS NOT NULL
        AND data_retorno_prevista < CURRENT_DATE
        AND data_retorno IS NULL)::int AS n
      FROM manutencoes`,
    build: (n) => ({
      titulo: 'Manutenções atrasadas',
      mensagem: `${n} manutenção(ões) de equipamento com retorno atrasado`,
      link: '#/manutencao',
    }),
  },
  {
    tipo: 'dashboard.revisao_vencida',
    query: `
      SELECT COUNT(DISTINCT veiculo_id)::int AS n
      FROM veiculo_planos
      WHERE ativo = TRUE
        AND intervalo_meses IS NOT NULL
        AND ultima_data IS NOT NULL
        AND (ultima_data + (intervalo_meses || ' months')::interval)::date < CURRENT_DATE`,
    build: (n) => ({
      titulo: 'Revisões de frota vencidas',
      mensagem: `${n} veículo(s) com revisão preventiva vencida`,
      link: '#/frota',
    }),
  },
];

async function jaNotificadoHoje(db, tipo) {
  const row = await db.getOne(
    `SELECT id FROM notificacoes WHERE tipo = $1 AND created_at::date = CURRENT_DATE LIMIT 1`,
    [tipo]
  );
  return !!row;
}

/**
 * Roda os 3 checks e dispara notificação (destinatario 'todos') pra cada
 * indicador crítico ainda sem alerta hoje. Devolve os tipos disparados —
 * útil pra teste e pro log do scheduler.
 */
async function checarAlertasDashboard({ db, repos, generateId }) {
  const disparados = [];
  for (const t of THRESHOLDS) {
    try {
      const row = await db.getOne(t.query);
      const n = row?.n || 0;
      if (n <= 0) continue;
      if (await jaNotificadoHoje(db, t.tipo)) continue;
      const { titulo, mensagem, link } = t.build(n);
      await repos.notificacoes.create({
        id: generateId('not'),
        destinatario: 'todos',
        tipo: t.tipo,
        titulo,
        mensagem,
        link,
        metadata: { n },
      });
      disparados.push(t.tipo);
    } catch (e) {
      console.warn('[dashboard-alertas]', t.tipo, e.message);
    }
  }
  return disparados;
}

module.exports = { checarAlertasDashboard, THRESHOLDS };
