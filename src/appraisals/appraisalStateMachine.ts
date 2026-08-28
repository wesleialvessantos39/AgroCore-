/**
 * Máquina de Estados Pura do Laudo de Avaliação
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { AppraisalStatus } from '../types/appraisal';

/**
 * Matriz estrita de transições válidas de estado de Laudo
 */
export const ALLOWED_APPRAISAL_TRANSITIONS: Readonly<Record<AppraisalStatus, readonly AppraisalStatus[]>> = {
  draft: ['data_collection', 'visit_to_schedule', 'review', 'ready_to_issue', 'issued', 'cancelled'],
  data_collection: ['draft', 'visit_to_schedule', 'visit_scheduled', 'fieldwork', 'analysis', 'review', 'ready_to_issue', 'issued', 'cancelled'],
  visit_to_schedule: ['visit_scheduled', 'data_collection', 'cancelled'],
  visit_scheduled: ['fieldwork', 'visit_to_schedule', 'cancelled'],
  fieldwork: ['analysis', 'awaiting_information', 'data_collection', 'cancelled'],
  analysis: ['review', 'awaiting_information', 'data_collection', 'ready_to_issue', 'issued', 'cancelled'],
  awaiting_information: ['analysis', 'data_collection', 'fieldwork', 'cancelled'],
  review: ['ready_to_issue', 'analysis', 'awaiting_information', 'issued', 'cancelled'],
  ready_to_issue: ['review', 'analysis', 'issued', 'cancelled'],
  issued: ['superseded'],
  superseded: [],
  cancelled: [],
};

export interface AppraisalTransitionContext {
  readonly canIssueDirectly?: boolean;
  readonly cancellationReason?: string;
  readonly actorUserId: string;
}

export interface AppraisalTransitionResult {
  readonly success: boolean;
  readonly previousStatus: AppraisalStatus;
  readonly newStatus: AppraisalStatus;
  readonly error?: string;
}

/**
 * Verifica se a transição entre estados é permitida teoricamente na matriz
 */
export function canTransitionAppraisal(from: AppraisalStatus, to: AppraisalStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_APPRAISAL_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Retorna a lista de próximos estados permitidos para um laudo
 */
export function getAllowedAppraisalTransitions(current: AppraisalStatus): readonly AppraisalStatus[] {
  return ALLOWED_APPRAISAL_TRANSITIONS[current] || [];
}

/**
 * Executa a transição de estado de um laudo aplicando as regras de negócio
 */
export function transitionAppraisal(
  current: AppraisalStatus,
  next: AppraisalStatus,
  context: AppraisalTransitionContext
): AppraisalTransitionResult {
  if (current === next) {
    return {
      success: true,
      previousStatus: current,
      newStatus: next,
    };
  }

  // 1. Validar se o estado atual permite transição para o próximo estado
  if (!canTransitionAppraisal(current, next)) {
    return {
      success: false,
      previousStatus: current,
      newStatus: current,
      error: `Transição inválida: Não é permitido alterar o status de "${getAppraisalStatusLabel(current)}" para "${getAppraisalStatusLabel(next)}".`,
    };
  }

  // 2. Proibição estrita: Laudo emitido é imutável e não pode retornar a rascunho
  if (current === 'issued' && next !== 'superseded') {
    return {
      success: false,
      previousStatus: current,
      newStatus: current,
      error: 'Um laudo emitido é um documento final e não pode ser revertido para rascunho ou edição.',
    };
  }

  // 3. Proibição estrita: Cancelamento exige justificativa
  if (next === 'cancelled') {
    if (!context.cancellationReason || context.cancellationReason.trim().length < 5) {
      return {
        success: false,
        previousStatus: current,
        newStatus: current,
        error: 'O cancelamento do laudo exige uma justificativa detalhada com no mínimo 5 caracteres.',
      };
    }
  }

  // 4. Regra de Fundação (OE-004.001): A transição para "issued" permanece fechada por ausência de motor de cálculo e elegibilidade completa
  if (next === 'issued' && !context.canIssueDirectly) {
    return {
      success: false,
      previousStatus: current,
      newStatus: current,
      error: 'A emissão de laudos está bloqueada nesta fase de fundação arquitetural do módulo.',
    };
  }

  return {
    success: true,
    previousStatus: current,
    newStatus: next,
  };
}

/**
 * Rótulos oficiais em português do Brasil para os status do laudo
 */
export function getAppraisalStatusLabel(status: AppraisalStatus): string {
  switch (status) {
    case 'draft':
      return 'Rascunho Inicial';
    case 'data_collection':
      return 'Coleta de Dados';
    case 'visit_to_schedule':
      return 'Vistoria a Agendar';
    case 'visit_scheduled':
      return 'Vistoria Agendada';
    case 'fieldwork':
      return 'Trabalho de Campo';
    case 'analysis':
      return 'Análise Técnica';
    case 'awaiting_information':
      return 'Aguardando Informações';
    case 'review':
      return 'Em Revisão Técnica';
    case 'ready_to_issue':
      return 'Pronto para Emissão';
    case 'issued':
      return 'Laudo Emitido';
    case 'superseded':
      return 'Substituído por Nova Versão';
    case 'cancelled':
      return 'Cancelado';
    default:
      return status;
  }
}
