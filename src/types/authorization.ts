import { PlatformRole, OrganizationRole } from './auth';

export type PermissionCode = Permission;

export type PermissionScope =
  | 'platform'
  | 'organization'
  | 'personal_account'
  | 'clients'
  | 'properties'
  | 'appraisals'
  | 'appraisal_requests'
  | 'technical_professionals'
  | 'proposals'
  | 'documents'
  | 'surveys_and_visits'
  | 'schedule'
  | 'fleet'
  | 'finance'
  | 'users_and_access'
  | 'audit';

export type Permission =
  // Escopo: Plataforma (Superadministrador)
  | 'platform:view_overview'
  | 'platform:view_organizations'
  | 'platform:view_audit'
  | 'platform:manage_governance'

  // Escopo: Organização
  | 'organization:view_overview'
  | 'organization:view_settings'
  | 'organization:manage_settings'
  | 'organization:manage_governance'

  // Escopo: Conta Pessoal
  | 'personal_account:view_profile'
  | 'personal_account:manage_preferences'

  // Escopo: Clientes e Produtores
  | 'clients:view'
  | 'clients:create'
  | 'clients:edit'
  | 'client_capturer_assignments:view'
  | 'client_capturer_assignments:manage'

  // Escopo: Imóveis Rurais e Urbanos
  | 'properties:view'
  | 'properties:create'
  | 'properties:edit'
  | 'properties:geospatial:view'
  | 'properties:geospatial:edit'

  // Escopo: Laudos de Avaliação (Módulo 004)
  | 'appraisals:view'
  | 'appraisals:view_assigned'
  | 'appraisals:create'
  | 'appraisals:edit'
  | 'appraisals:edit_assigned'
  | 'appraisals:review'
  | 'appraisals:issue'
  | 'appraisals:view_status_related'

  // Escopo: Solicitações de Laudo (Módulo 004)
  | 'appraisal_requests:create'
  | 'appraisal_requests:view_related'
  | 'appraisal_requests:view_queue'
  | 'appraisal_requests:view_assigned'
  | 'appraisal_requests:assign'
  | 'appraisal_requests:upload_documents'

  // Escopo: Perfis Profissionais Técnicos (Módulo 004)
  | 'technical_professionals:view_self'
  | 'technical_professionals:update_self'
  | 'technical_professionals:verify'
  | 'technical_professionals:manage_capabilities'

  // Escopo: Propostas de Crédito e Serviços Técnicos (Módulo 005)
  | 'proposals:view'
  | 'proposals:view_related'
  | 'proposals:view_assigned'
  | 'proposals:view_financials'
  | 'proposals:create'
  | 'proposals:edit_draft'
  | 'proposals:submit'
  | 'proposals:assign_review'
  | 'proposals:review'
  | 'proposals:approve'
  | 'proposals:present'
  | 'proposals:record_decision'
  | 'proposals:cancel'
  | 'proposals:view_document'
  | 'proposals:issue_document'
  | 'proposals:view_commercial_tracking'
  | 'proposals:manage_follow_up'
  | 'proposals:view_handoff'
  | 'proposals:prepare_handoff'
  | 'proposals:view_handoff_queue'
  | 'proposals:acknowledge_handoff'
  | 'proposals:renew'

  // Escopo: Documentos
  | 'documents:view'
  | 'documents:upload'
  | 'documents:download'
  | 'documents:register_reference'
  | 'documents:manage'
  | 'documents:view_requirements'
  | 'documents:fulfill_requirements'
  | 'documents:manage_requirements'

  // Escopo: Vistorias e Visitas
  | 'surveys_and_visits:view'
  | 'surveys_and_visits:schedule'
  | 'surveys_and_visits:execute'

  // Escopo: Agenda
  | 'schedule:view'
  | 'schedule:manage'

  // Escopo: Frota
  | 'fleet:view'
  | 'fleet:manage'

  // Escopo: Financeiro
  | 'finance:view_overview'
  | 'finance:view_records'
  | 'finance:manage_operations'

  // Escopo: Usuários e Acessos
  | 'users_and_access:view'
  | 'users_and_access:manage'
  | 'users_and_access:manage_roles'

  // Escopo: Auditoria
  | 'audit:view_organization'
  | 'audit:view_platform';

export interface PermissionDefinition {
  id: Permission;
  scope: PermissionScope;
  targetScope: 'platform' | 'organization' | 'personal';
  name: string;
  description: string;
}

export interface PermissionScopeGroup {
  id: PermissionScope;
  name: string;
  description: string;
  targetScope: 'platform' | 'organization' | 'personal';
}

export interface AuthorizationDecision {
  granted: boolean;
  reason?: string;
}

export interface PermissionGroupSummary {
  scope: PermissionScope;
  groupName: string;
  groupDescription: string;
  capabilities: string[];
}

export interface UserRoleResolution {
  effectiveRole: PlatformRole | OrganizationRole;
  scope: 'platform' | 'organization' | 'none';
  isPlatformSuperAdmin: boolean;
}
