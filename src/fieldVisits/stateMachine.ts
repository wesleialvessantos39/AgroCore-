import {
  TechnicalVisitDomainError,
  type TechnicalVisitStatus,
} from '../types/technicalVisit';

const TRANSITIONS: Readonly<Record<TechnicalVisitStatus, readonly TechnicalVisitStatus[]>> = {
  planned: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionTechnicalVisit(
  currentStatus: TechnicalVisitStatus,
  targetStatus: TechnicalVisitStatus
): boolean {
  return TRANSITIONS[currentStatus].includes(targetStatus);
}

export function assertTechnicalVisitTransition(
  currentStatus: TechnicalVisitStatus,
  targetStatus: TechnicalVisitStatus
): void {
  if (!canTransitionTechnicalVisit(currentStatus, targetStatus)) {
    throw new TechnicalVisitDomainError(
      'INVALID_TRANSITION',
      'A mudança de situação solicitada não é permitida para esta visita.'
    );
  }
}

export function isTechnicalVisitTerminal(status: TechnicalVisitStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}
