/**
 * Máquina de Estados Pura de Solicitações de Laudo
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { AppraisalRequestStatus } from '../types/appraisal';

/**
 * Matriz estrita de transições válidas de estado de Solicitação de Laudo
 */
export const ALLOWED_REQUEST_TRANSITIONS: Readonly<Record<AppraisalRequestStatus, readonly AppraisalRequestStatus[]>> = {
  submitted: ['received', 'awaiting_assignment', 'cancelled', 'declined'],
  received: ['awaiting_assignment', 'assigned', 'awaiting_documents', 'cancelled', 'declined'],
  awaiting_assignment: ['assigned', 'awaiting_documents', 'cancelled', 'declined'],
  assigned: ['awaiting_documents', 'accepted', 'converted', 'awaiting_assignment', 'cancelled', 'declined'],
  awaiting_documents: ['accepted', 'assigned', 'converted', 'cancelled', 'declined'],
  accepted: ['converted', 'cancelled', 'declined'],
  converted: ['completed'],
  declined: [],
  cancelled: [],
  completed: [],
};

export interface AppraisalRequestTransitionContext {
  readonly actorUserId: string;
  readonly declineReason?: string;
  readonly cancelReason?: string;
  readonly assignedToUserId?: string;
  readonly resultingAppraisalId?: string;
}

export interface AppraisalRequestTransitionResult {
  readonly success: boolean;
  readonly previousStatus: AppraisalRequestStatus;
  readonly newStatus: AppraisalRequestStatus;
  readonly error?: string;
}

/**
 * Verifica se a transição entre estados da solicitação é permitida teoricamente na matriz
 */
export function canTransitionAppraisalRequest(
  from: AppraisalRequestStatus,
  to: AppraisalRequestStatus
): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_REQUEST_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Retorna a lista de próximos estados permitidos para uma solicitação de laudo
 */
export function getAllowedAppraisalRequestTransitions(
  current: AppraisalRequestStatus
): readonly AppraisalRequestStatus[] {
  return ALLOWED_REQUEST_TRANSITIONS[current] || [];
}

/**
 * Executa a transição de estado de uma solicitação de laudo aplicando as regras de negócio
 */
export function transitionAppraisalRequest(
  current: AppraisalRequestStatus,
  next: AppraisalRequestStatus,
  context: AppraisalRequestTransitionContext
): AppraisalRequestTransitionResult {
  if (current === next) {
    return {
      success: true,
      previousStatus: current,
      newStatus: next,
    };
  }

  // 1. Validar se o estado atual permite transição para o próximo estado
  if (!canTransitionAppraisalRequest(current, next)) {
    return {
      success: false,
      previousStatus: current,
      newStatus: current,
      error: `Transição inválida: Não é permitido alterar a solicitação de "${getAppraisalRequestStatusLabel(current)}" para "${getAppraisalRequestStatusLabel(next)}".`,
    };
  }

  // 2. Proibição estrita: Solicitação concluída, declinada ou cancelada é terminal
  if (current === 'completed' || current === 'declined' || current === 'cancelled') {
    return {
      success: false,
      previousStatus: current,
      newStatus: current,
      error: 'Esta solicitação atingiu um estado terminal e não pode sofrer novas alterações.',
    };
  }

  // 3. Validação de atribuição
  if (next === 'assigned' && !context.assignedToUserId) {
    return {
      success: false,
      previousStatus: current,
      newStatus: current,
      error: 'É obrigatório indicar o responsável técnico ao atribuir a solicitação.',
    };
  }

  // 4. Validação de declínio
  if (next === 'declined' && (!context.declineReason || context.declineReason.trim().length < 5)) {
    return {
      success: false,
      previousStatus: current,
      newStatus: current,
      error: 'O declínio da solicitação exige um motivo detalhado com no mínimo 5 caracteres.',
    };
  }

  // 5. Validação de cancelamento
  if (next === 'cancelled' && (!context.cancelReason || context.cancelReason.trim().length < 5)) {
    return {
      success: false,
      previousStatus: current,
      newStatus: current,
      error: 'O cancelamento da solicitação exige uma justificativa com no mínimo 5 caracteres.',
    };
  }

  // 6. Validação de conversão
  if (next === 'converted' && !context.resultingAppraisalId) {
    return {
      success: false,
      previousStatus: current,
      newStatus: current,
      error: 'A conversão da solicitação exige a referência ao ID do laudo gerado.',
    };
  }

  return {
    success: true,
    previousStatus: current,
    newStatus: next,
  };
}

/**
 * Rótulos oficiais em português do Brasil para os status da solicitação
 */
export function getAppraisalRequestStatusLabel(status: AppraisalRequestStatus): string {
  switch (status) {
    case 'submitted':
      return 'Enviada pelo Captador';
    case 'received':
      return 'Recebida na Fila';
    case 'awaiting_assignment':
      return 'Aguardando Atribuição';
    case 'assigned':
      return 'Responsável Atribuído';
    case 'awaiting_documents':
      return 'Aguardando Documentos';
    case 'accepted':
      return 'Aceita pelo Projetista';
    case 'converted':
      return 'Convertida em Laudo';
    case 'declined':
      return 'Declinada';
    case 'cancelled':
      return 'Cancelada';
    case 'completed':
      return 'Concluída';
    default:
      return status;
  }
}
