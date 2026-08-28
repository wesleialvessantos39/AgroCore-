/**
 * Tipos e Contratos do Domínio de Laudos de Avaliação
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { TechnicalProfessionalProfile, TechnicalProfessionalProfileId } from './technicalProfessional';

export type { TechnicalProfessionalProfile, TechnicalProfessionalProfileId };

export type AppraisalId = string;
export type AppraisalRequestId = string;
export type AppraisalVersionId = string;
export type AppraisalEventId = string;
export type AppraisalDocumentReferenceId = string;

export type AppraisalOrigin = 'capturer_request' | 'technical_initiative';

export type AppraisalStatus =
  | 'draft'
  | 'data_collection'
  | 'visit_to_schedule'
  | 'visit_scheduled'
  | 'fieldwork'
  | 'analysis'
  | 'awaiting_information'
  | 'review'
  | 'ready_to_issue'
  | 'issued'
  | 'superseded'
  | 'cancelled';

export type AppraisalRequestStatus =
  | 'submitted'
  | 'received'
  | 'awaiting_assignment'
  | 'assigned'
  | 'awaiting_documents'
  | 'accepted'
  | 'converted'
  | 'declined'
  | 'cancelled'
  | 'completed';

export type AppraisalContextStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'forbidden'
  | 'unavailable'
  | 'error';

export interface AppraisalSummary {
  readonly id: AppraisalId;
  readonly organizationId: string;
  readonly clientId: string;
  readonly propertyId: string;
  readonly responsibleUserId: string;
  readonly technicalProfessionalProfileId?: TechnicalProfessionalProfileId;
  readonly appraisalRequestId?: AppraisalRequestId;
  readonly origin: AppraisalOrigin;
  readonly status: AppraisalStatus;
  readonly purpose: string;
  readonly title: string;
  readonly propertyType: 'rural' | 'urban';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly issuedAt?: string;
  readonly activeVersionNumber: number;
}

export interface Appraisal {
  readonly id: AppraisalId;
  readonly organizationId: string;
  readonly clientId: string;
  readonly propertyId: string;
  readonly responsibleUserId: string;
  readonly technicalProfessionalProfileId?: TechnicalProfessionalProfileId;
  readonly appraisalRequestId?: AppraisalRequestId;
  readonly origin: AppraisalOrigin;
  readonly status: AppraisalStatus;
  readonly purpose: string;
  readonly title: string;
  readonly propertyType: 'rural' | 'urban';
  readonly currentVersionNumber: number;
  readonly cancellationReason?: string;
  readonly observations?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly issuedAt?: string;
}

export type AppraisalPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface AppraisalRequest {
  readonly id: AppraisalRequestId;
  readonly organizationId: string;
  readonly clientId: string;
  readonly propertyId: string;
  readonly requestedByUserId: string;
  readonly capturerRelationship?: string;
  readonly purpose: string;
  readonly status: AppraisalRequestStatus;
  readonly priority?: AppraisalPriority;
  readonly assignedToUserId?: string;
  readonly assignedAt?: string;
  readonly resultingAppraisalId?: AppraisalId;
  readonly declineReason?: string;
  readonly cancelReason?: string;
  readonly notes?: string;
  readonly documentReferences: readonly AppraisalDocumentReference[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export interface AppraisalVersionMetadata {
  readonly id: AppraisalVersionId;
  readonly appraisalId: AppraisalId;
  readonly versionNumber: number;
  readonly previousVersionId?: AppraisalVersionId;
  readonly status: 'draft' | 'issued' | 'superseded';
  readonly responsibleUserId: string;
  readonly technicalProfessionalProfileId?: TechnicalProfessionalProfileId;
  readonly createdAt: string;
  readonly issuedAt?: string;
  readonly documentChecksum?: string;
}

export interface AppraisalDocumentReference {
  readonly id: AppraisalDocumentReferenceId;
  readonly organizationId: string;
  readonly sourceEntity: 'appraisal' | 'appraisal_request';
  readonly sourceEntityId: string;
  readonly category: 'registration_certificate' | 'car_receipt' | 'topography_map' | 'photo_report' | 'art_rrt' | 'other';
  readonly version: number;
  readonly displayName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum?: string;
  readonly authorUserId: string;
  readonly createdAt: string;
  readonly accessStatus: 'available' | 'restricted' | 'archived';
}

export type AppraisalDomainEventType =
  | 'appraisal_created_from_request'
  | 'appraisal_created_by_technical_initiative'
  | 'appraisal_responsible_assigned'
  | 'appraisal_status_changed'
  | 'appraisal_ready_to_issue'
  | 'appraisal_issued'
  | 'appraisal_cancelled'
  | 'appraisal_request_submitted'
  | 'appraisal_request_received'
  | 'appraisal_request_assigned'
  | 'appraisal_request_reassigned'
  | 'appraisal_request_accepted'
  | 'appraisal_request_declined'
  | 'appraisal_request_status_changed'
  | 'appraisal_request_documents_changed'
  | 'appraisal_request_converted'
  | 'client_capturer_assigned'
  | 'client_capturer_transferred'
  | 'client_capturer_terminated'
  | 'appraisal_notification_dispatched'
  | 'appraisal_admin_fallback_triggered';

export interface AppraisalDomainEvent {
  readonly id: AppraisalEventId;
  readonly organizationId: string;
  readonly eventType: AppraisalDomainEventType;
  readonly entityType: 'appraisal' | 'appraisal_request' | 'client_capturer_assignment' | 'notification';
  readonly entityId: string;
  readonly relatedEntityId?: string;
  readonly actorUserId: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface StartDirectAppraisalCommand {
  readonly clientId: string;
  readonly propertyId: string;
  readonly title: string;
  readonly purpose: string;
  readonly notes?: string;
  readonly idempotencyKey?: string;
}

export interface ConvertRequestToAppraisalCommand {
  readonly requestId: AppraisalRequestId;
  readonly responsibleUserId?: string;
  readonly title?: string;
  readonly purpose?: string;
  readonly observations?: string;
  readonly idempotencyKey?: string;
}

export interface AssignAppraisalRequestCommand {
  readonly requestId: AppraisalRequestId;
  readonly designerUserId?: string;
  readonly assignedToUserId?: string;
  readonly transferReason?: string;
  readonly priority?: AppraisalPriority;
  readonly notes?: string;
}

export interface CreateAppraisalRequestInput {
  readonly clientId: string;
  readonly propertyId: string;
  readonly purpose: string;
  readonly desiredDeadline?: string;
  readonly notes?: string;
  readonly documentReferences?: readonly Omit<AppraisalDocumentReference, 'id' | 'organizationId' | 'sourceEntity' | 'sourceEntityId' | 'authorUserId' | 'createdAt'>[];
  readonly idempotencyKey?: string;
}

export type AppraisalNotificationType =
  | 'new_request_in_queue'
  | 'request_assigned'
  | 'request_reassigned'
  | 'request_accepted'
  | 'request_converted'
  | 'direct_appraisal_started'
  | 'admin_fallback';

export interface AppraisalOperationalNotification {
  readonly id: string;
  readonly organizationId: string;
  readonly recipientUserId?: string;
  readonly recipientRole?: string;
  readonly type: AppraisalNotificationType;
  readonly clientId: string;
  readonly propertyId: string;
  readonly appraisalId?: AppraisalId;
  readonly appraisalRequestId?: AppraisalRequestId;
  readonly title: string;
  readonly message: string;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly readAt?: string;
}

/**
 * Projeção Sanitizada do Laudo para o Captador (OE-004.002)
 * Protege cálculos, amostras, valores e diagnósticos técnicos periciais.
 */
export interface AppraisalCapturerProjection {
  readonly appraisalId: AppraisalId;
  readonly protocol: string;
  readonly clientId: string;
  readonly propertyId: string;
  readonly businessStage: string;
  readonly responsibleName?: string;
  readonly operationalDates: {
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly startedAt?: string;
  };
  readonly status: AppraisalStatus;
  readonly isInProgress: boolean;
}

export interface AppraisalListFilters {
  readonly organizationId: string;
  readonly status?: AppraisalStatus | 'all';
  readonly origin?: AppraisalOrigin | 'all';
  readonly propertyType?: 'rural' | 'urban' | 'all';
  readonly clientId?: string;
  readonly propertyId?: string;
  readonly responsibleUserId?: string;
  readonly search?: string;
}

export interface AppraisalRequestListFilters {
  readonly organizationId: string;
  readonly status?: AppraisalRequestStatus | 'all';
  readonly requestedByUserId?: string;
  readonly assignedToUserId?: string;
  readonly clientId?: string;
  readonly propertyId?: string;
  readonly search?: string;
}

export interface AppraisalListPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface AppraisalListResult {
  readonly items: readonly AppraisalSummary[];
  readonly pagination: AppraisalListPagination;
}

export interface AppraisalRequestListResult {
  readonly items: readonly AppraisalRequest[];
  readonly pagination: AppraisalListPagination;
}
