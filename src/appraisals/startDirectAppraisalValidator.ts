import { OrganizationRole } from '../types/auth';
import { Permission } from '../types/authorization';
import { Client } from '../types/client';
import { Property } from '../types/property';
import { StartDirectAppraisalCommand } from '../types/appraisal';
import { TechnicalProfessionalProfile } from '../types/technicalProfessional';
import { evaluateAppraisalAccess } from './appraisalAccessPolicy';
import { evaluateTechnicalEligibility } from './technicalEligibilityEvaluator';

export interface StartDirectAppraisalValidationContext {
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly actorRole: OrganizationRole;
  readonly actorPermissions: readonly Permission[];
  readonly isMembershipActive: boolean;
  readonly resolveClient: (clientId: string) => Promise<Client | null>;
  readonly resolveProperty: (propertyId: string) => Promise<Property | null>;
  readonly resolveTechnicalProfile: (
    organizationId: string,
    userId: string
  ) => Promise<TechnicalProfessionalProfile | null>;
}

export interface ValidatedDirectAppraisalSources {
  readonly propertyType: 'rural' | 'urban';
  readonly technicalProfessionalProfileId: string;
}

export async function validateStartDirectAppraisalCommand(
  command: StartDirectAppraisalCommand,
  context: StartDirectAppraisalValidationContext
): Promise<ValidatedDirectAppraisalSources> {
  const access = evaluateAppraisalAccess({
    operation: 'create_appraisal',
    actorUserId: context.actorUserId,
    actorRole: context.actorRole,
    actorPermissions: context.actorPermissions,
    activeOrganizationId: context.organizationId,
    targetOrganizationId: context.organizationId,
    isMembershipActive: context.isMembershipActive,
  });
  if (!access.granted) {
    throw new Error(access.reason);
  }

  const [client, property, technicalProfile] = await Promise.all([
    context.resolveClient(command.clientId),
    context.resolveProperty(command.propertyId),
    context.resolveTechnicalProfile(context.organizationId, context.actorUserId),
  ]);

  if (!client || client.organizationId !== context.organizationId) {
    throw new Error('Cliente selecionado não pertence à organização ativa.');
  }
  if (!property || property.organizationId !== context.organizationId) {
    throw new Error('Imóvel selecionado não pertence à organização ativa.');
  }
  if (!property.clientLinks?.some((link) => link.clientId === client.id)) {
    throw new Error('O imóvel selecionado não possui vínculo canônico com o cliente informado.');
  }

  const eligibility = evaluateTechnicalEligibility({
    userId: context.actorUserId,
    userPermissions: context.actorPermissions,
    activeOrganizationId: context.organizationId,
    targetOrganizationId: context.organizationId,
    isMembershipActive: context.isMembershipActive,
    profile: technicalProfile,
    propertyType: property.propertyType,
    intent: 'draft_and_edit',
  });
  if (!technicalProfile || !eligibility.allowed || !eligibility.eligible) {
    throw new Error(
      `Elegibilidade técnica negada: ${eligibility.reasons[0] || 'perfil técnico incompatível.'}`
    );
  }

  return Object.freeze({
    propertyType: property.propertyType,
    technicalProfessionalProfileId: technicalProfile.id,
  });
}
