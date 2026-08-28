/**
 * Gerador e Validador de Eventos de Domínio do Módulo de Laudos
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Princípios Arquiteturais:
 * 1. Taxonomia estrita e validada em tempo de execução
 * 2. Imutabilidade e identificação com correlationId
 * 3. Sanitização automática de dados confidenciais (LGPD / Segurança)
 * 4. Registro append-only em memória para auditoria e verificação comportamental
 */

import {
  AppraisalDomainEvent,
  AppraisalDomainEventType,
} from '../types/appraisal';

export const VALID_APPRAISAL_DOMAIN_EVENT_TYPES: ReadonlySet<AppraisalDomainEventType> = new Set<AppraisalDomainEventType>([
  'appraisal_created_from_request',
  'appraisal_created_by_technical_initiative',
  'appraisal_responsible_assigned',
  'appraisal_status_changed',
  'appraisal_ready_to_issue',
  'appraisal_issued',
  'appraisal_cancelled',
  'appraisal_request_submitted',
  'appraisal_request_received',
  'appraisal_request_assigned',
  'appraisal_request_reassigned',
  'appraisal_request_accepted',
  'appraisal_request_declined',
  'appraisal_request_status_changed',
  'appraisal_request_documents_changed',
  'appraisal_request_converted',
  'client_capturer_assigned',
  'client_capturer_transferred',
  'client_capturer_terminated',
  'appraisal_notification_dispatched',
  'appraisal_admin_fallback_triggered',
]);

export function isValidDomainEventType(type: unknown): type is AppraisalDomainEventType {
  return typeof type === 'string' && VALID_APPRAISAL_DOMAIN_EVENT_TYPES.has(type as AppraisalDomainEventType);
}

export interface CreateDomainEventParams {
  readonly organizationId: string;
  readonly eventType: AppraisalDomainEventType;
  readonly entityType: 'appraisal' | 'appraisal_request' | 'client_capturer_assignment' | 'notification';
  readonly entityId: string;
  readonly relatedEntityId?: string;
  readonly actorUserId: string;
  readonly correlationId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

// Armazenamento append-only em memória para fins de auditoria e testes
const domainEventStore: AppraisalDomainEvent[] = [];

/**
 * Retorna uma cópia imutável dos eventos de domínio registrados (filtrada por organização se fornecida)
 */
export function getDomainEventJournal(organizationId?: string): readonly AppraisalDomainEvent[] {
  if (organizationId) {
    return Object.freeze(domainEventStore.filter((evt) => evt.organizationId === organizationId));
  }
  return Object.freeze([...domainEventStore]);
}

/**
 * Limpa o diário de eventos (utilizado exclusivamente em encerramento de sessão ou suites de teste)
 */
export function clearDomainEventJournal(): void {
  domainEventStore.length = 0;
}

function generateSecureId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}_${randomPart}`;
}

/**
 * Sanitiza recursivamente valores de payload para impedir vazamento de credenciais, CPFs/CNPJs brutos e tokens
 */
function sanitizePayloadValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;

  const lowerKey = key.toLowerCase();
  if (
    lowerKey.includes('password') ||
    lowerKey.includes('senha') ||
    lowerKey.includes('secret') ||
    lowerKey.includes('token') ||
    lowerKey.includes('bearer') ||
    lowerKey.includes('auth')
  ) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    // Mascarar CPF completo se detectado
    if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value) || /^\d{11}$/.test(value)) {
      return value.replace(/^(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})$/, '$1.***.***-$4');
    }
    // Truncar base64 longo
    if (value.length > 500 && /^data:|^[A-Za-z0-9+/=]{200,}/.test(value)) {
      return '[PAYLOAD_TRUNCATED]';
    }
    return value;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      sanitizedObj[k] = sanitizePayloadValue(k, v);
    }
    return sanitizedObj;
  }

  return value;
}

/**
 * Cria e registra uma instância imutável e validada de evento de domínio
 */
export function createAppraisalDomainEvent(
  params: CreateDomainEventParams
): AppraisalDomainEvent {
  // 1. Validação Estrita de Tipo de Evento
  if (!isValidDomainEventType(params.eventType)) {
    throw new Error(`Taxonomia inválida: Tipo de evento de domínio não reconhecido "${params.eventType}".`);
  }

  // 2. Validação de Campos Obrigatórios
  if (!params.organizationId || params.organizationId.trim() === '') {
    throw new Error('Evento de domínio requer "organizationId" válido para isolamento multitenant.');
  }

  if (!params.entityId || params.entityId.trim() === '') {
    throw new Error('Evento de domínio requer "entityId" válido.');
  }

  if (!params.actorUserId || params.actorUserId.trim() === '') {
    throw new Error('Evento de domínio requer "actorUserId" identificado para trilha de auditoria.');
  }

  const eventId = generateSecureId('evt');
  const correlationId = params.correlationId || generateSecureId('corr');
  const now = new Date().toISOString();

  // 3. Sanitização e Imutabilidade de Payload
  const safePayload: Record<string, unknown> = {};
  if (params.payload) {
    for (const [key, value] of Object.entries(params.payload)) {
      safePayload[key] = sanitizePayloadValue(key, value);
    }
  }

  const event: AppraisalDomainEvent = Object.freeze({
    id: eventId,
    organizationId: params.organizationId,
    eventType: params.eventType,
    entityType: params.entityType,
    entityId: params.entityId,
    relatedEntityId: params.relatedEntityId,
    actorUserId: params.actorUserId,
    occurredAt: now,
    correlationId,
    payload: Object.freeze(safePayload),
  });

  // 4. Registro no Diário Append-Only
  domainEventStore.push(event);

  return event;
}
