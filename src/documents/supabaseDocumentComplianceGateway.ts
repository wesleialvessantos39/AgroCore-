import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseRuntimeConfig } from '../infrastructure/supabaseClient';
import type {
  DocumentAlertPolicy,
  DocumentExportAudit,
  DocumentShareGrant,
  RedeemedDocumentShare,
} from '../types/documentCompliance';
import { DocumentDomainError } from '../types/documents';
import type {
  CompleteDocumentExportRecord,
  ConfigureDocumentAlertPolicyRecord,
  CreateDocumentExportRecord,
  CreateDocumentShareRecord,
  DocumentComplianceGateway,
  FailDocumentExportRecord,
  RevokeDocumentShareRecord,
} from './documentComplianceGateway';

interface PolicyRow {
  readonly organization_id: string;
  readonly warning_days: number;
  readonly critical_days: number;
  readonly version_number: number;
  readonly updated_by_user_id: string;
  readonly updated_by_display_name: string;
  readonly updated_at: string;
}

interface ShareRow {
  readonly id: string;
  readonly organization_id: string;
  readonly document_id: string;
  readonly logical_document_id: string;
  readonly document_display_name: string;
  readonly purpose: string;
  readonly status: DocumentShareGrant['status'];
  readonly expires_at: string;
  readonly max_accesses: number;
  readonly access_count: number;
  readonly created_by_user_id: string;
  readonly created_by_display_name: string;
  readonly created_at: string;
  readonly last_accessed_at: string | null;
  readonly revoked_at: string | null;
  readonly revoked_by_user_id: string | null;
  readonly revocation_reason: string | null;
}

interface ExportRow {
  readonly id: string;
  readonly organization_id: string;
  readonly document_count: number;
  readonly purpose: string;
  readonly status: DocumentExportAudit['status'];
  readonly requested_by_user_id: string;
  readonly requested_by_display_name: string;
  readonly requested_at: string;
  readonly completed_at: string | null;
  readonly file_size_bytes: number | null;
  readonly checksum_sha256: string | null;
  readonly failure_reason: string | null;
}

interface ExportItemRow {
  readonly export_id: string;
  readonly document_id: string;
  readonly position: number;
}

const POLICY_COLUMNS = [
  'organization_id', 'warning_days', 'critical_days', 'version_number',
  'updated_by_user_id', 'updated_by_display_name', 'updated_at',
].join(',');

const SHARE_COLUMNS = [
  'id', 'organization_id', 'document_id', 'logical_document_id', 'document_display_name',
  'purpose', 'status', 'expires_at', 'max_accesses', 'access_count',
  'created_by_user_id', 'created_by_display_name', 'created_at', 'last_accessed_at',
  'revoked_at', 'revoked_by_user_id', 'revocation_reason',
].join(',');

const EXPORT_COLUMNS = [
  'id', 'organization_id', 'document_count', 'purpose', 'status',
  'requested_by_user_id', 'requested_by_display_name', 'requested_at', 'completed_at',
  'file_size_bytes', 'checksum_sha256', 'failure_reason',
].join(',');

function databaseError(error: { readonly message?: string; readonly code?: string } | null): DocumentDomainError {
  const message = error?.message ?? '';
  if (message.includes('AGROCORE_VERSION_CONFLICT')) {
    return new DocumentDomainError('VERSION_CONFLICT', 'O registro recebeu outra atualização.');
  }
  if (message.includes('AGROCORE_IDEMPOTENCY_CONFLICT')) {
    return new DocumentDomainError('IDEMPOTENCY_CONFLICT', 'A operação já foi usada com informações diferentes.');
  }
  if (message.includes('AGROCORE_DOCUMENT_EXPIRED')) {
    return new DocumentDomainError('DOCUMENT_EXPIRED', 'Documento vencido não pode sair do AgroCore.');
  }
  if (message.includes('AGROCORE_REFERENCE_NOT_FOUND') || message.includes('AGROCORE_SHARE_NOT_FOUND')) {
    return new DocumentDomainError('REFERENCE_NOT_FOUND', 'O registro solicitado não está disponível.');
  }
  if (message.includes('AGROCORE_FORBIDDEN')) {
    return new DocumentDomainError('FORBIDDEN', 'Operação documental não autorizada.');
  }
  if (message.includes('AGROCORE_INVALID_INPUT')) {
    return new DocumentDomainError('INVALID_INPUT', 'As informações enviadas são inválidas.');
  }
  if (message.includes('AGROCORE_INVALID_STATE')) {
    return new DocumentDomainError('INVALID_STATE', 'O registro não permite esta operação.');
  }
  if (error?.code === '23505') {
    return new DocumentDomainError('VERSION_CONFLICT', 'O registro recebeu outra atualização.');
  }
  return new DocumentDomainError('SERVICE_UNAVAILABLE', 'Não foi possível acessar as saídas documentais.');
}

function toPolicy(row: PolicyRow): DocumentAlertPolicy {
  return {
    organizationId: row.organization_id,
    warningDays: row.warning_days,
    criticalDays: row.critical_days,
    versionNumber: row.version_number,
    updatedByUserId: row.updated_by_user_id,
    updatedByDisplayName: row.updated_by_display_name,
    updatedAt: row.updated_at,
  };
}

function toShare(row: ShareRow): DocumentShareGrant {
  return {
    id: row.id,
    organizationId: row.organization_id,
    documentId: row.document_id,
    logicalDocumentId: row.logical_document_id,
    documentDisplayName: row.document_display_name,
    purpose: row.purpose,
    status: row.status,
    expiresAt: row.expires_at,
    maxAccesses: row.max_accesses,
    accessCount: row.access_count,
    createdByUserId: row.created_by_user_id,
    createdByDisplayName: row.created_by_display_name,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    revokedByUserId: row.revoked_by_user_id ?? undefined,
    revocationReason: row.revocation_reason ?? undefined,
  };
}

function toExport(row: ExportRow, items: readonly ExportItemRow[]): DocumentExportAudit {
  return {
    id: row.id,
    organizationId: row.organization_id,
    documentIds: items
      .filter((item) => item.export_id === row.id)
      .sort((left, right) => left.position - right.position)
      .map((item) => item.document_id),
    documentCount: row.document_count,
    purpose: row.purpose,
    status: row.status,
    requestedByUserId: row.requested_by_user_id,
    requestedByDisplayName: row.requested_by_display_name,
    requestedAt: row.requested_at,
    completedAt: row.completed_at ?? undefined,
    fileSizeBytes: row.file_size_bytes ?? undefined,
    checksumSha256: row.checksum_sha256 ?? undefined,
    failureReason: row.failure_reason ?? undefined,
  };
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T | null) ?? null;
}

export class SupabaseDocumentComplianceGateway implements DocumentComplianceGateway {
  constructor(private readonly client: SupabaseClient) {}

  async getAlertPolicy(organizationId: string, signal?: AbortSignal): Promise<DocumentAlertPolicy | null> {
    let request = this.client
      .from('document_alert_policies')
      .select(POLICY_COLUMNS)
      .eq('organization_id', organizationId);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request.maybeSingle();
    if (error) throw databaseError(error);
    return data ? toPolicy(data as unknown as PolicyRow) : null;
  }

  async configureAlertPolicy(input: ConfigureDocumentAlertPolicyRecord): Promise<DocumentAlertPolicy> {
    const { data, error } = await this.client.rpc('agrocore_configure_document_alert_policy', {
      p_policy: input.policy,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
      p_payload_hash: input.payloadHash,
    });
    if (error) throw databaseError(error);
    const row = firstRow<PolicyRow>(data);
    if (!row) throw databaseError(null);
    return toPolicy(row);
  }

  async listShares(organizationId: string, signal?: AbortSignal): Promise<readonly DocumentShareGrant[]> {
    let request = this.client
      .from('document_share_grants')
      .select(SHARE_COLUMNS)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw databaseError(error);
    return ((data ?? []) as unknown as ShareRow[]).map(toShare);
  }

  async createShare(input: CreateDocumentShareRecord): Promise<DocumentShareGrant> {
    const { data, error } = await this.client.rpc('agrocore_create_document_share', {
      p_grant: input.grant,
      p_token_hash: input.tokenHash,
      p_idempotency_key: input.idempotencyKey,
      p_payload_hash: input.payloadHash,
    });
    if (error) throw databaseError(error);
    const row = firstRow<ShareRow>(data);
    if (!row) throw databaseError(null);
    return toShare(row);
  }

  async revokeShare(input: RevokeDocumentShareRecord): Promise<DocumentShareGrant> {
    const { data, error } = await this.client.rpc('agrocore_revoke_document_share', {
      p_organization_id: input.organizationId,
      p_share_id: input.shareId,
      p_reason: input.reason,
      p_expected_access_count: input.expectedAccessCount,
      p_idempotency_key: input.idempotencyKey,
      p_payload_hash: input.payloadHash,
    });
    if (error) throw databaseError(error);
    const row = firstRow<ShareRow>(data);
    if (!row) throw databaseError(null);
    return toShare(row);
  }

  async redeemShareToken(token: string, signal?: AbortSignal): Promise<RedeemedDocumentShare> {
    const config = getSupabaseRuntimeConfig();
    if (!config) throw databaseError(null);
    const response = await fetch(`${config.url}/functions/v1/document-share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.publishableKey,
      },
      body: JSON.stringify({ token }),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !payload) {
      throw new DocumentDomainError('REFERENCE_NOT_FOUND', 'Este acesso não está disponível.');
    }
    if (
      typeof payload.downloadUrl !== 'string' ||
      typeof payload.displayName !== 'string' ||
      typeof payload.mimeType !== 'string'
    ) {
      throw new DocumentDomainError('INVALID_STATE', 'A resposta do compartilhamento é inválida.');
    }
    return {
      downloadUrl: payload.downloadUrl,
      displayName: payload.displayName,
      mimeType: payload.mimeType as RedeemedDocumentShare['mimeType'],
      urlExpiresAt: typeof payload.urlExpiresAt === 'string' ? payload.urlExpiresAt : undefined,
    };
  }

  private async exportsFromRows(rows: readonly ExportRow[]): Promise<readonly DocumentExportAudit[]> {
    if (rows.length === 0) return [];
    const { data, error } = await this.client
      .from('document_export_items')
      .select('export_id,document_id,position')
      .in('export_id', rows.map((row) => row.id))
      .order('position', { ascending: true });
    if (error) throw databaseError(error);
    const items = (data ?? []) as unknown as ExportItemRow[];
    return rows.map((row) => toExport(row, items));
  }

  async listExports(organizationId: string, signal?: AbortSignal): Promise<readonly DocumentExportAudit[]> {
    let request = this.client
      .from('document_export_audits')
      .select(EXPORT_COLUMNS)
      .eq('organization_id', organizationId)
      .order('requested_at', { ascending: false });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw databaseError(error);
    return this.exportsFromRows((data ?? []) as unknown as ExportRow[]);
  }

  async createExport(input: CreateDocumentExportRecord): Promise<DocumentExportAudit> {
    const { data, error } = await this.client.rpc('agrocore_create_document_export', {
      p_audit: input.audit,
      p_document_ids: input.audit.documentIds,
      p_idempotency_key: input.idempotencyKey,
      p_payload_hash: input.payloadHash,
    });
    if (error) throw databaseError(error);
    const row = firstRow<ExportRow>(data);
    if (!row) throw databaseError(null);
    return (await this.exportsFromRows([row]))[0]!;
  }

  async completeExport(input: CompleteDocumentExportRecord): Promise<DocumentExportAudit> {
    const { data, error } = await this.client.rpc('agrocore_complete_document_export', {
      p_organization_id: input.organizationId,
      p_export_id: input.exportId,
      p_file_size_bytes: input.fileSizeBytes,
      p_checksum_sha256: input.checksumSha256,
    });
    if (error) throw databaseError(error);
    const row = firstRow<ExportRow>(data);
    if (!row) throw databaseError(null);
    return (await this.exportsFromRows([row]))[0]!;
  }

  async failExport(input: FailDocumentExportRecord): Promise<DocumentExportAudit> {
    const { data, error } = await this.client.rpc('agrocore_fail_document_export', {
      p_organization_id: input.organizationId,
      p_export_id: input.exportId,
      p_failure_reason: input.failureReason,
    });
    if (error) throw databaseError(error);
    const row = firstRow<ExportRow>(data);
    if (!row) throw databaseError(null);
    return (await this.exportsFromRows([row]))[0]!;
  }
}
