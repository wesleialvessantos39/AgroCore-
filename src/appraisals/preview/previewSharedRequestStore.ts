/**
 * Armazenamento Volátil Compartilhado de Solicitações de Laudo
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Garante fonte única de verdade (Single Source of Truth) entre o
 * PreviewAppraisalGateway e o PreviewAppraisalRequestGateway.
 */

import { AppraisalRequest } from '../../types/appraisal';

const sharedRequestsStore = new Map<string, AppraisalRequest[]>();
const sharedRequestEventsStore = new Map<string, unknown[]>();

export function getSharedRequestsByOrg(organizationId: string): AppraisalRequest[] {
  return sharedRequestsStore.get(organizationId) || [];
}

export function setSharedRequestsForOrg(organizationId: string, requests: AppraisalRequest[]): void {
  sharedRequestsStore.set(organizationId, requests);
}

export function clearAllSharedRequests(): void {
  sharedRequestsStore.clear();
  sharedRequestEventsStore.clear();
}
