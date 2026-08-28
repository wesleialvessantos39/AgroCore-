/**
 * Política Pura de Acesso e Governança a Laudos e Solicitações de Avaliação
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Princípio Arquitetural:
 * Função pura, determinística, sem efeitos colaterais e com tipagem estrita
 * para validar autorização, isolamento organizacional e papéis de negócio.
 */

import { Appraisal, AppraisalRequest } from '../types/appraisal';
import { PermissionCode } from '../types/authorization';
import { OrganizationRole, PlatformRole } from '../types/auth';

export type AppraisalOperation =
  | 'list_appraisals'
  | 'get_appraisal_by_id'
  | 'create_appraisal'
  | 'edit_appraisal'
  | 'edit_dossier'
  | 'update_appraisal_status'
  | 'review_appraisal'
  | 'issue_appraisal'
  | 'list_requests'
  | 'get_request_by_id'
  | 'create_request'
  | 'update_request_status'
  | 'assign_request'
  | 'accept_request'
  | 'convert_request'
  | 'decline_request'
  | 'cancel_request'
  | 'add_request_document';

export type AppraisalAccessDenialCode =
  | 'UNAUTHENTICATED'
  | 'SUPER_ADMIN_NO_TENANT'
  | 'ORGANIZATION_MISMATCH'
  | 'INACTIVE_MEMBERSHIP'
  | 'MISSING_PERMISSION'
  | 'FINANCE_BLOCKED_TECHNICAL'
  | 'CAPTURER_CANNOT_ACCESS_TECHNICAL_APPRAISAL'
  | 'CAPTURER_ONLY_OWN_REQUESTS'
  | 'CAPTURER_ASSIGNMENT_NOT_AVAILABLE'
  | 'CAPTURER_CANNOT_CHANGE_REQUEST_STATUS'
  | 'OPERATION_NOT_AVAILABLE_IN_FOUNDATION'
  | 'NOT_ASSIGNED_DESIGNER'
  | 'CANNOT_REVIEW_OWN_APPRAISAL'
  | 'ADMIN_CANNOT_EDIT_TECHNICAL_CONTENT'
  | 'MISSING_ASSIGN_PERMISSION'
  | 'ISSUANCE_GLOBALLY_DISABLED'
  | 'ENTITY_NOT_FOUND';

export interface AppraisalAccessEvaluationInput {
  readonly operation: AppraisalOperation;
  readonly actorUserId?: string | null;
  readonly actorRole?: PlatformRole | OrganizationRole | null;
  readonly actorPermissions: readonly (PermissionCode | string)[];
  readonly activeOrganizationId?: string | null;
  readonly targetOrganizationId?: string | null;
  readonly isMembershipActive?: boolean;
  readonly appraisalEntity?: Appraisal | null;
  readonly requestEntity?: AppraisalRequest | null;
}

export interface AppraisalAccessDecision {
  readonly granted: boolean;
  readonly denialCode?: AppraisalAccessDenialCode;
  readonly reason: string;
}

export function evaluateAppraisalAccess(input: AppraisalAccessEvaluationInput): AppraisalAccessDecision {
  const {
    operation,
    actorUserId,
    actorRole,
    actorPermissions,
    activeOrganizationId,
    targetOrganizationId,
    isMembershipActive = true,
    appraisalEntity,
    requestEntity,
  } = input;

  // 1. Verificação de Autenticação Básica
  if (!actorUserId || actorUserId.trim() === '') {
    return {
      granted: false,
      denialCode: 'UNAUTHENTICATED',
      reason: 'Operação rejeitada: Usuário não autenticado.',
    };
  }

  // 2. Superadministrador da Plataforma não possui acesso direto a tenant operacional
  if (actorRole === 'platform_super_admin') {
    return {
      granted: false,
      denialCode: 'SUPER_ADMIN_NO_TENANT',
      reason: 'Acesso negado: Superadministrador da plataforma não opera diretamente dados organizacionais.',
    };
  }

  // 3. Verificação de Organização Ativa e Isolamento Multitenant
  if (!activeOrganizationId || activeOrganizationId.trim() === '') {
    return {
      granted: false,
      denialCode: 'ORGANIZATION_MISMATCH',
      reason: 'Operação rejeitada: Nenhuma organização ativa selecionada.',
    };
  }

  if (targetOrganizationId && targetOrganizationId !== activeOrganizationId) {
    return {
      granted: false,
      denialCode: 'ORGANIZATION_MISMATCH',
      reason: 'Operação rejeitada: Tentativa de acesso a organização divergente da ativa.',
    };
  }

  if (appraisalEntity && appraisalEntity.organizationId !== activeOrganizationId) {
    return {
      granted: false,
      denialCode: 'ORGANIZATION_MISMATCH',
      reason: 'Operação rejeitada: Laudo pertence a organização distinta.',
    };
  }

  if (requestEntity && requestEntity.organizationId !== activeOrganizationId) {
    return {
      granted: false,
      denialCode: 'ORGANIZATION_MISMATCH',
      reason: 'Operação rejeitada: Solicitação pertence a organização distinta.',
    };
  }

  // 4. Verificação de Vínculo Organizacional Ativo
  if (isMembershipActive === false) {
    return {
      granted: false,
      denialCode: 'INACTIVE_MEMBERSHIP',
      reason: 'Acesso negado: Vínculo do usuário com a organização não está ativo.',
    };
  }

  const permissionsSet = new Set(actorPermissions);

  // 5. Regras Específicas por Operação (Deny by Default)
  switch (operation) {
    // --- Operações sobre Laudos Técnicos ---
    case 'issue_appraisal': {
      if (actorRole === 'finance' || actorRole === 'capturer') {
        return {
          granted: false,
          denialCode: 'CAPTURER_CANNOT_ACCESS_TECHNICAL_APPRAISAL',
          reason: 'Acesso negado: Perfil não autorizado a emitir laudos técnicos.',
        };
      }
      if (!permissionsSet.has('appraisals:issue')) {
        return {
          granted: false,
          denialCode: 'MISSING_PERMISSION',
          reason: 'Acesso negado: Usuário não possui a permissão appraisals:issue.',
        };
      }
      if (actorRole === 'project_designer' && appraisalEntity) {
        if (appraisalEntity.responsibleUserId !== actorUserId) {
          return {
            granted: false,
            denialCode: 'NOT_ASSIGNED_DESIGNER',
            reason: 'Acesso negado: Apenas o responsável técnico designado pode emitir o laudo.',
          };
        }
      }
      return {
        granted: true,
        reason: 'Emissão de laudo autorizada.',
      };
    }

    case 'review_appraisal': {
      if (!permissionsSet.has('appraisals:review')) {
        return {
          granted: false,
          denialCode: 'MISSING_PERMISSION',
          reason: 'Acesso negado: Usuário não possui a permissão appraisals:review.',
        };
      }
      if (appraisalEntity && appraisalEntity.responsibleUserId === actorUserId) {
        return {
          granted: false,
          denialCode: 'CANNOT_REVIEW_OWN_APPRAISAL',
          reason: 'Acesso negado: Princípio de paridade — o responsável técnico não pode revisar seu próprio laudo.',
        };
      }
      return {
        granted: true,
        reason: 'Revisão técnica autorizada.',
      };
    }

    case 'list_appraisals':
    case 'get_appraisal_by_id': {
      if (actorRole === 'finance') {
        return {
          granted: false,
          denialCode: 'FINANCE_BLOCKED_TECHNICAL',
          reason: 'Acesso negado: O perfil financeiro não possui acesso a peças técnicas de avaliação.',
        };
      }
      if (actorRole === 'capturer') {
        return {
          granted: false,
          denialCode: 'CAPTURER_CANNOT_ACCESS_TECHNICAL_APPRAISAL',
          reason: 'Acesso negado: O perfil captador não visualiza nem edita laudos técnicos.',
        };
      }
      if (!permissionsSet.has('appraisals:view') && !permissionsSet.has('appraisals:view_assigned')) {
        return {
          granted: false,
          denialCode: 'MISSING_PERMISSION',
          reason: 'Acesso negado: Usuário não possui permissão para visualizar laudos.',
        };
      }
      return {
        granted: true,
        reason: 'Consulta de laudos autorizada.',
      };
    }

    case 'create_appraisal': {
      if (actorRole === 'finance') {
        return {
          granted: false,
          denialCode: 'FINANCE_BLOCKED_TECHNICAL',
          reason: 'Acesso negado: O perfil financeiro não possui acesso a peças técnicas de avaliação.',
        };
      }
      if (actorRole === 'capturer') {
        return {
          granted: false,
          denialCode: 'CAPTURER_CANNOT_ACCESS_TECHNICAL_APPRAISAL',
          reason: 'Acesso negado: O perfil captador não elabora laudos técnicos.',
        };
      }
      if (!permissionsSet.has('appraisals:create')) {
        return {
          granted: false,
          denialCode: 'MISSING_PERMISSION',
          reason: 'Acesso negado: Usuário não possui a permissão appraisals:create.',
        };
      }
      return {
        granted: true,
        reason: 'Criação de laudo autorizada.',
      };
    }

    case 'edit_appraisal':
    case 'edit_dossier':
    case 'update_appraisal_status': {
      if (actorRole === 'finance') {
        return {
          granted: false,
          denialCode: 'FINANCE_BLOCKED_TECHNICAL',
          reason: 'Acesso negado: O perfil financeiro não possui acesso a peças técnicas de avaliação.',
        };
      }
      if (actorRole === 'capturer') {
        return {
          granted: false,
          denialCode: 'CAPTURER_CANNOT_ACCESS_TECHNICAL_APPRAISAL',
          reason: 'Acesso negado: O perfil captador não edita laudos técnicos.',
        };
      }
      if (!permissionsSet.has('appraisals:edit') && !permissionsSet.has('appraisals:edit_assigned')) {
        return {
          granted: false,
          denialCode: 'MISSING_PERMISSION',
          reason: 'Acesso negado: Usuário não possui permissão de edição de laudo.',
        };
      }
      if (actorRole === 'project_designer' && appraisalEntity) {
        if (appraisalEntity.responsibleUserId !== actorUserId) {
          return {
            granted: false,
            denialCode: 'NOT_ASSIGNED_DESIGNER',
            reason: 'Acesso negado: O projetista só pode alterar laudos sob sua responsabilidade técnica.',
          };
        }
      }
      if ((operation === 'edit_appraisal' || operation === 'edit_dossier') && (actorRole === 'owner' || actorRole === 'company_admin' || actorRole === 'manager')) {
        return {
          granted: false,
          denialCode: 'ADMIN_CANNOT_EDIT_TECHNICAL_CONTENT',
          reason: 'Acesso negado: Gestores não podem alterar conteúdo técnico de laudos de outros profissionais.',
        };
      }
      return {
        granted: true,
        reason: 'Edição de laudo autorizada.',
      };
    }

    // --- Operações sobre Solicitações de Laudo ---
    case 'create_request': {
      if (actorRole === 'capturer') {
        return {
          granted: false,
          denialCode: 'CAPTURER_ASSIGNMENT_NOT_AVAILABLE',
          reason: 'Operação pendente: A criação de solicitação por captador requer validação de vínculo canônico de atribuição com o cliente.',
        };
      }
      if (!permissionsSet.has('appraisal_requests:create')) {
        return {
          granted: false,
          denialCode: 'MISSING_PERMISSION',
          reason: 'Acesso negado: Usuário não possui a permissão appraisal_requests:create.',
        };
      }
      return {
        granted: true,
        reason: 'Criação de solicitação autorizada.',
      };
    }

    case 'list_requests':
    case 'get_request_by_id': {
      const hasQueuePerm = permissionsSet.has('appraisal_requests:view_queue');
      const hasRelatedPerm = permissionsSet.has('appraisal_requests:view_related');
      const hasAssignedPerm = permissionsSet.has('appraisal_requests:view_assigned');

      if (!hasQueuePerm && !hasRelatedPerm && !hasAssignedPerm) {
        return {
          granted: false,
          denialCode: 'MISSING_PERMISSION',
          reason: 'Acesso negado: Usuário não possui permissão para visualizar solicitações de laudo.',
        };
      }
      if (actorRole === 'capturer' && requestEntity && !hasQueuePerm) {
        if (requestEntity.requestedByUserId !== actorUserId) {
          return {
            granted: false,
            denialCode: 'CAPTURER_ONLY_OWN_REQUESTS',
            reason: 'Acesso negado: Captador só pode consultar solicitações de sua própria autoria.',
          };
        }
      }
      if (actorRole === 'project_designer' && requestEntity && !hasQueuePerm) {
        if (requestEntity.assignedToUserId !== actorUserId) {
          return {
            granted: false,
            denialCode: 'NOT_ASSIGNED_DESIGNER',
            reason: 'Acesso negado: O projetista só visualiza solicitações atribuídas a ele.',
          };
        }
      }
      return {
        granted: true,
        reason: 'Consulta de solicitações autorizada.',
      };
    }

    case 'assign_request': {
      if (actorRole === 'capturer') {
        return {
          granted: false,
          denialCode: 'CAPTURER_CANNOT_CHANGE_REQUEST_STATUS',
          reason: 'Acesso negado: O perfil captador não possui permissão para atribuir solicitações.',
        };
      }
      if (!permissionsSet.has('appraisal_requests:assign')) {
        return {
          granted: false,
          denialCode: 'MISSING_ASSIGN_PERMISSION',
          reason: 'Acesso negado: Usuário não possui permissão para atribuir solicitações de laudo.',
        };
      }
      return {
        granted: true,
        reason: 'Atribuição de solicitação autorizada.',
      };
    }

    case 'accept_request':
    case 'convert_request': {
      if (actorRole === 'capturer') {
        return {
          granted: false,
          denialCode: 'CAPTURER_CANNOT_CHANGE_REQUEST_STATUS',
          reason: 'Acesso negado: O captador não aceita ou converte solicitações.',
        };
      }
      if (actorRole === 'project_designer' && requestEntity) {
        if (requestEntity.assignedToUserId !== actorUserId) {
          return {
            granted: false,
            denialCode: 'NOT_ASSIGNED_DESIGNER',
            reason: 'Acesso negado: Apenas o projetista atribuído pode aceitar ou converter a solicitação.',
          };
        }
      }
      return {
        granted: true,
        reason: 'Operação sobre solicitação autorizada.',
      };
    }

    case 'update_request_status':
    case 'decline_request':
    case 'cancel_request': {
      if (actorRole === 'capturer' && operation !== 'cancel_request') {
        return {
          granted: false,
          denialCode: 'CAPTURER_CANNOT_CHANGE_REQUEST_STATUS',
          reason: 'Acesso negado: O perfil captador não possui permissão para alterar o estado de solicitações.',
        };
      }
      if (operation === 'cancel_request' && actorRole === 'capturer' && requestEntity) {
        if (requestEntity.requestedByUserId !== actorUserId) {
          return {
            granted: false,
            denialCode: 'CAPTURER_ONLY_OWN_REQUESTS',
            reason: 'Acesso negado: Captador só pode cancelar solicitações de sua própria autoria.',
          };
        }
      }
      return {
        granted: true,
        reason: 'Alteração de status de solicitação autorizada.',
      };
    }

    case 'add_request_document': {
      if (!permissionsSet.has('appraisal_requests:upload_documents')) {
        return {
          granted: false,
          denialCode: 'MISSING_PERMISSION',
          reason: 'Acesso negado: Usuário não possui a permissão appraisal_requests:upload_documents.',
        };
      }
      if (actorRole === 'capturer' && requestEntity) {
        if (requestEntity.requestedByUserId !== actorUserId) {
          return {
            granted: false,
            denialCode: 'CAPTURER_ONLY_OWN_REQUESTS',
            reason: 'Acesso negado: Captador só pode adicionar documentos a solicitações de sua autoria.',
          };
        }
      }
      return {
        granted: true,
        reason: 'Adição de documento autorizada.',
      };
    }

    default: {
      return {
        granted: false,
        denialCode: 'MISSING_PERMISSION',
        reason: 'Operação não reconhecida ou negada por padrão (deny-by-default).',
      };
    }
  }
}
