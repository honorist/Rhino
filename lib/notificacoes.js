'use strict';
/**
 * @file Regras puras de preferências de notificação (F19).
 *
 * - BR-NOTIF-001: `TIPOS_CATALOGO` é a lista fechada de tipos de notificação
 *   que o sistema hoje dispara (um por `notificacoes.create({tipo, ...})` no
 *   código — mantenha em sincronia ao adicionar um tipo novo). Cada entrada
 *   tem `tipo` (chave gravada em `notificacoes.tipo`), `label` (texto pro
 *   usuário) e `categoria` (agrupamento na tela de preferências).
 * - BR-NOTIF-002: `deveNotificar(tiposDesativados, tipo)` — um usuário recebe
 *   a notificação a menos que tenha desativado explicitamente aquele tipo.
 *   Lista vazia/ausente = recebe tudo (default é opt-out, não opt-in, pra não
 *   quebrar silenciosamente quem nunca abriu a tela de preferências).
 */

const TIPOS_CATALOGO = [
  { tipo: 'recrutamento.nova_solicitacao', label: 'Nova solicitação de contratação', categoria: 'Recrutamento' },
  { tipo: 'punch.atribuido', label: 'Item de punch list atribuído a você', categoria: 'Qualidade' },
  { tipo: 'sugestao.nova', label: 'Nova sugestão de colaborador (gestores)', categoria: 'Sugestões' },
  { tipo: 'sugestao.status', label: 'Mudança de status da sua sugestão', categoria: 'Sugestões' },
  { tipo: 'dashboard.docs_vencidos', label: 'Documentos de colaboradores vencidos', categoria: 'Dashboard' },
  { tipo: 'dashboard.manutencao_atrasada', label: 'Manutenção de equipamento atrasada', categoria: 'Dashboard' },
  { tipo: 'dashboard.revisao_vencida', label: 'Revisão de veículo vencida', categoria: 'Dashboard' },
];

/**
 * @param {string[]|null|undefined} tiposDesativados
 * @param {string} tipo
 * @returns {boolean}
 */
function deveNotificar(tiposDesativados, tipo) {
  if (!Array.isArray(tiposDesativados) || tiposDesativados.length === 0) return true;
  return !tiposDesativados.includes(tipo);
}

module.exports = { TIPOS_CATALOGO, deveNotificar };
