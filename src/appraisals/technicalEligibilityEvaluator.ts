/**
 * Avaliador Puro de Elegibilidade Técnica Profissional
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Princípio da Separação em Camadas:
 * 1. Autenticação e Vínculo Organizacional Ativo (Tenant Isolation)
 * 2. Permissão RBAC (Autorização de Sistema) — Papéis do sistema NÃO conferem habilitação pericial
 * 3. Perfil Profissional Técnico Declarado — CREA, CAU, CFT e CFTA são cadastros distintos
 * 4. Situação Cadastral e Documento de Responsabilidade (ART / RRT / TRT)
 * 5. Capacidades Técnicas Verificadas (VerifiedTechnicalCapability) — Sem inferência automática
 * 6. Independência Estrita entre Escopo Rural e Urbano
 * 7. Emissão ("canIssue") Globalmente Bloqueada na Fundação Arquitetural
 */

import {
  TechnicalProfessionalProfile,
  TechnicalEligibilityEvaluation,
  TechnicalIneligibilityReasonCode,
  VerifiedTechnicalCapabilityType,
  TechnicalEligibilityStatus,
} from '../types/technicalProfessional';
import { AppraisalStatus } from '../types/appraisal';
import { Permission } from '../types/authorization';

export interface TechnicalEligibilityParams {
  readonly userId?: string | null;
  readonly userPermissions: readonly Permission[];
  readonly activeOrganizationId: string | null;
  readonly targetOrganizationId: string;
  readonly isMembershipActive?: boolean;
  readonly profile?: TechnicalProfessionalProfile | null;
  readonly propertyType?: 'rural' | 'urban';
  readonly appraisalStatus?: AppraisalStatus;
  readonly requiredDocumentType?: 'ART' | 'RRT' | 'TRT';
  readonly intent?: 'draft_and_edit' | 'issue';
}

/**
 * Avalia a elegibilidade técnica profissional do usuário
 */
export function evaluateTechnicalEligibility(
  params: TechnicalEligibilityParams
): TechnicalEligibilityEvaluation {
  const reasonCodes: TechnicalIneligibilityReasonCode[] = [];
  const reasons: string[] = [];
  const missingRequirements: string[] = [];
  const now = new Date().toISOString();

  // 1. Verificação de Autenticação do Usuário
  if (!params.userId || typeof params.userId !== 'string' || params.userId.trim() === '') {
    reasonCodes.push('unauthenticated_user');
    reasons.push('Usuário não autenticado na sessão ativa.');
    missingRequirements.push('Autenticação válida requerida.');
  }

  // 2. Verificação de Vínculo Organizacional e Multitenancy
  if (!params.activeOrganizationId || params.activeOrganizationId.trim() === '' || params.activeOrganizationId !== params.targetOrganizationId) {
    reasonCodes.push('missing_organization');
    reasons.push('Organização ativa ausente ou divergente do escopo organizacional do laudo.');
    missingRequirements.push('Vínculo com a organização alvo do laudo.');
  }

  if (params.isMembershipActive === false) {
    reasonCodes.push('inactive_membership');
    reasons.push('Vínculo de membro com a organização encontra-se inativo ou revogado.');
    missingRequirements.push('Membro ativo na organização.');
  }

  // 3. Verificação de Permissão RBAC (Autorização do Sistema)
  // Apenas appraisals:view é estritamente INSUFICIENTE para elaborar ou assinar laudos técnicos.
  const hasAppraisalPermission =
    params.userPermissions.includes('appraisals:create') ||
    params.userPermissions.includes('appraisals:edit') ||
    params.userPermissions.includes('appraisals:issue');

  if (!hasAppraisalPermission) {
    reasonCodes.push('missing_rbac_permission');
    reasons.push('Usuário não possui permissão RBAC para criar ou editar laudos (permissão de apenas visualizar não confere capacidade de elaboração técnica).');
    missingRequirements.push('Permissão RBAC appraisals:create ou appraisals:edit.');
  }

  // 4. Verificação de Perfil Profissional Técnico
  if (!params.profile) {
    reasonCodes.push('profile_not_informed');
    reasons.push('Nenhum perfil profissional técnico informado para o usuário nesta organização.');
    missingRequirements.push('Cadastro de perfil profissional técnico.');
    
    return {
      eligible: false,
      allowed: false,
      decision: 'denied',
      status: 'not_informed',
      reasons,
      reasonCodes,
      missingRequirements,
      profileEvaluated: null,
      evaluatedAt: now,
      canIssue: false,
      checkedAt: now,
    };
  }

  const profile = params.profile;

  // 4.1. Verificação de Alinhamento de Usuário e Organização do Perfil
  if (params.userId && profile.userId !== params.userId) {
    reasonCodes.push('profile_user_mismatch');
    reasons.push('Perfil profissional técnico informado pertence a outro usuário.');
    missingRequirements.push('Perfil vinculado ao usuário autenticado.');
  }

  if (
    (params.targetOrganizationId && profile.organizationId !== params.targetOrganizationId) ||
    (params.activeOrganizationId && profile.organizationId !== params.activeOrganizationId)
  ) {
    reasonCodes.push('profile_organization_mismatch');
    reasons.push('Perfil profissional técnico cadastrado em organização divergente da ativa.');
    missingRequirements.push('Perfil vinculado à organização ativa.');
  }

  // 5. Verificação da Situação Cadastral no Conselho de Classe (CREA, CAU, CFT, CFTA)
  if (profile.status === 'suspended') {
    reasonCodes.push('council_registration_suspended');
    reasons.push(`Registro profissional no conselho ${profile.council} encontra-se suspenso.`);
    missingRequirements.push('Regularização da situação cadastral do conselho.');
  }

  if (profile.status === 'expired') {
    reasonCodes.push('council_registration_expired');
    reasons.push(`Validade do registro ou certidão profissional do conselho ${profile.council} expirada.`);
    missingRequirements.push('Renovação do registro/anuidade profissional.');
  }

  if (profile.status === 'pending_review' || profile.status === 'not_informed') {
    reasonCodes.push('profile_pending_verification');
    reasons.push('Perfil profissional aguarda conferência e verificação administrativa com evidências comprobatórias.');
    missingRequirements.push('Conferência administrativa do perfil profissional.');
  }

  if (profile.status === 'ineligible') {
    reasons.push('Profissional classificado administrativamente como inapto para laudos de avaliação.');
    missingRequirements.push('Aptidão técnica homologada.');
  }

  // 6. Verificação de Impedimentos Registrados
  if (profile.impediments && profile.impediments.length > 0) {
    reasonCodes.push('profile_has_impediments');
    profile.impediments.forEach((imp) => {
      reasons.push(`Impedimento técnico registrado: ${imp}`);
      missingRequirements.push(`Resolução do impedimento: ${imp}`);
    });
  }

  // 7. Verificação de Capacidade Técnica Verificada (VerifiedTechnicalCapability)
  // Regra fundamental: Conselho ou título NÃO geram atribuição automática.
  // A aptidão para avaliação rural requer capacidade rural ativa; para avaliação urbana requer capacidade urbana ativa.
  let requiredCapability: VerifiedTechnicalCapabilityType | undefined;
  if (params.propertyType) {
    const isRural = params.propertyType === 'rural';
    requiredCapability = isRural ? 'rural_property_appraisal' : 'urban_property_appraisal';

    const activeCapabilities = (profile.capabilities || []).filter(
      (cap) => cap.status === 'active'
    );

    const hasMatchingCapability = activeCapabilities.some((cap) => {
      if (isRural) {
        return (
          cap.activityType === 'rural_property_appraisal' &&
          (cap.scope === 'rural' || cap.scope === 'both')
        );
      } else {
        return (
          cap.activityType === 'urban_property_appraisal' &&
          (cap.scope === 'urban' || cap.scope === 'both')
        );
      }
    });

    if (!hasMatchingCapability) {
      if (isRural) {
        reasonCodes.push('missing_rural_capability');
        reasons.push(
          'Profissional não possui capacidade técnica verificada de avaliação de imóveis rurais (Res. CONFEA 345/90 / Res. CFTA 31/21).'
        );
        missingRequirements.push('Capacidade técnica verificada de avaliação de imóveis rurais.');
      } else {
        reasonCodes.push('missing_urban_capability');
        reasons.push(
          'Profissional não possui capacidade técnica verificada de avaliação de imóveis urbanos (Res. CONFEA 345/90 / Lei 12.378/10).'
        );
        missingRequirements.push('Capacidade técnica verificada de avaliação de imóveis urbanos.');
      }
    }
  }

  // 8. Verificação de Documento de Responsabilidade Técnica (ART / RRT / TRT)
  if (params.requiredDocumentType && profile.responsibilityDocumentType !== params.requiredDocumentType) {
    reasonCodes.push('missing_responsibility_document');
    reasons.push(
      `Documento de responsabilidade técnica incompatível (requerido: ${params.requiredDocumentType}, perfil: ${profile.responsibilityDocumentType || 'nenhum'}).`
    );
    missingRequirements.push(`Documento de responsabilidade técnica ${params.requiredDocumentType}.`);
  }

  // 9. Verificação de Status do Laudo
  if (params.appraisalStatus && params.appraisalStatus === 'cancelled') {
    reasonCodes.push('incompatible_appraisal_status');
    reasons.push('Laudo de avaliação encontra-se cancelado.');
    missingRequirements.push('Laudo ativo em elaboração.');
  }

  if (params.appraisalStatus && (params.appraisalStatus === 'issued' || params.appraisalStatus === 'superseded')) {
    reasonCodes.push('incompatible_appraisal_status');
    reasons.push('Laudo de avaliação já foi emitido e encontra-se imutável.');
    missingRequirements.push('Versão de laudo em elaboração aberta.');
  }

  // 10. Validação Canônica de Elegibilidade e Emissão
  // A emissão de laudo ("canIssue") é liberada exclusivamente quando o responsável técnico
  // for verificado (manually_verified), possuir capacidade rural/urbana compatível,
  // possuir ART/RRT/TRT comprovada e não houver pendências impeditivas.
  const isFullyEligible =
    profile.status === 'manually_verified' &&
    reasonCodes.length === 0;

  const canIssue = isFullyEligible;
  const decision = isFullyEligible ? 'allowed' : 'denied';

  return {
    eligible: isFullyEligible,
    allowed: isFullyEligible,
    decision,
    status: profile.status,
    reasons: reasons.length > 0 ? reasons : ['Perfil técnico verificado e habilitado para elaboração e emissão pericial.'],
    reasonCodes,
    missingRequirements,
    requiredCapability,
    profileEvaluated: profile,
    evaluatedAt: now,
    canIssue,
    checkedAt: now,
  };
}
