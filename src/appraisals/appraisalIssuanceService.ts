/**
 * Serviço Canônico de Aplicação para Emissão Oficial de Laudos Periciais
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos (NBR 14653)
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 * 
 * Regras Obrigatórias de Governança Pericial e Deny-By-Default:
 * 1. Recarrega o laudo pelo ID e organização ativa;
 * 2. Recarrega cliente e imóvel canônicos a partir dos gateways de domínio;
 * 3. Recarrega o perfil técnico do responsável cadastrado;
 * 4. Recarrega dossiê, amostras, estatísticas, cálculos e enquadramento normativo;
 * 5. Valida organização ativa e integridade multitenant;
 * 6. Valida permissão RBAC 'appraisals:issue' (ou 'appraisals:edit'/'appraisals:create' para o responsável);
 * 7. Exige que o ator seja o projetista responsável técnico cadastrado no laudo;
 * 8. Exige perfil verificado ('manually_verified') com capacidade rural/urbana compatível;
 * 9. Exige ART, RRT ou TRT compatível e comprovada;
 * 10. Exige prontidão integral (evaluateAppraisalReadiness sem impeditivos);
 * 11. Bloqueia administradores e gestores de emitir laudo no lugar do responsável técnico;
 * 12. Idempotência e controle de concorrência determinístico;
 * 13. Cria exatamente uma versão imutável com Checksum SHA-256;
 * 14. Atualiza o status do laudo atomicamente para 'issued';
 * 15. Registra evento de auditoria sanitizado.
 */

import { Appraisal, AppraisalId } from '../types/appraisal';
import { AppraisalIssuedVersion } from '../types/appraisalVersioning';
import { getAppraisalGateway } from './gatewayFactory';
import { getClientGateway } from '../clients/gatewayFactory';
import { getPropertyGateway } from '../properties/gatewayFactory';
import { getTechnicalProfessionalGateway } from '../technicalProfessionals/gatewayFactory';
import { getOrganizationMembersGateway } from '../auth/organizationMembersGatewayFactory';
import { evaluateTechnicalEligibility } from './technicalEligibilityEvaluator';
import { evaluateAppraisalReadiness } from './readinessEvaluator';
import {
  buildAppraisalCanonicalSnapshot,
  computeDeterministicChecksum,
} from './snapshotEngine';
import { calculateSampleHomogenization } from './homogenizationEngine';
import { createAppraisalDomainEvent } from './domainEvents';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { Permission } from '../types/authorization';
import { OrganizationRole } from '../types/auth';

export interface IssueAppraisalVersionCommand {
  readonly appraisalId: AppraisalId;
  readonly activeOrganizationId: string;
  readonly actor: {
    readonly userId: string;
    readonly userName: string;
    readonly organizationRole: OrganizationRole;
    readonly permissions: readonly Permission[];
  };
  readonly idempotencyKey?: string;
}

export interface IssueAppraisalVersionResult {
  readonly issuedVersion: AppraisalIssuedVersion;
  readonly updatedAppraisal: Appraisal;
}

export class AppraisalIssuanceService {
  private static readonly issuanceLocks = new Map<string, Promise<unknown>>();
  private static readonly idempotencyStore = new Map<
    string,
    { payloadHash: string; result: IssueAppraisalVersionResult }
  >();
  private static readonly inFlightIssuances = new Map<string, Promise<IssueAppraisalVersionResult>>();

  private async acquireLock(lockKey: string): Promise<() => void> {
    while (AppraisalIssuanceService.issuanceLocks.has(lockKey)) {
      try {
        await AppraisalIssuanceService.issuanceLocks.get(lockKey);
      } catch {
        // Ignora erros de execuções anteriores na fila
      }
    }

    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    AppraisalIssuanceService.issuanceLocks.set(lockKey, lockPromise);

    return () => {
      AppraisalIssuanceService.issuanceLocks.delete(lockKey);
      releaseLock();
    };
  }

  async issueVersion(
    command: IssueAppraisalVersionCommand
  ): Promise<IssueAppraisalVersionResult> {
    const { appraisalId, activeOrganizationId, actor, idempotencyKey } = command;

    if (!activeOrganizationId || activeOrganizationId.trim() === '') {
      throw new Error('Organização ativa não informada na sessão.');
    }

    if (!actor || !actor.userId) {
      throw new Error('Usuário não autenticado.');
    }

    // Exigir a permissão explícita "appraisals:issue"
    if (!actor.permissions || !actor.permissions.includes('appraisals:issue')) {
      throw new Error('Acesso negado: permissão "appraisals:issue" é estritamente requerida para emissão formal de laudos.');
    }

    const lockKey = `${activeOrganizationId}:${appraisalId}`;
    const idempKey = idempotencyKey || `${activeOrganizationId}:${appraisalId}:issue`;

    // Checar se já foi emitida com sucesso com esta chave de idempotência
    const cachedResult = AppraisalIssuanceService.idempotencyStore.get(idempKey);
    if (cachedResult) {
      return cachedResult.result;
    }

    // Checar se já existe operação em andamento com mesma chave de idempotência
    const existingInFlight = AppraisalIssuanceService.inFlightIssuances.get(idempKey);
    if (existingInFlight) {
      return existingInFlight;
    }

    const executionPromise = (async () => {
      const release = await this.acquireLock(lockKey);
      try {
        const membersGateway = getOrganizationMembersGateway();
        const activeMember = await membersGateway.getMemberByUserId(activeOrganizationId, actor.userId);
        if (!activeMember || !activeMember.isActive) {
          throw new Error('Vínculo do responsável técnico inativo ou inexistente na organização ativa.');
        }

        const appraisalGateway = getAppraisalGateway();
        const clientGateway = getClientGateway();
        const propertyGateway = getPropertyGateway();
        const technicalGateway = getTechnicalProfessionalGateway();

        // 1. Recarregar Laudo
        const appraisal = await appraisalGateway.getAppraisalById(activeOrganizationId, appraisalId);
        if (!appraisal) {
          throw new Error(`Laudo com ID "${appraisalId}" não encontrado na organização ativa.`);
        }

        if (appraisal.organizationId !== activeOrganizationId) {
          throw new Error('Tentativa de acesso entre organizações distintas bloqueada.');
        }

        if (appraisal.status === 'cancelled') {
          throw new Error('Não é possível emitir versão de um laudo cancelado.');
        }

        // 2. Exigir que o ator seja o projetista responsável técnico cadastrado
        if (!appraisal.responsibleUserId) {
          throw new Error('O laudo não possui um Responsável Técnico designado.');
        }

        if (appraisal.responsibleUserId !== actor.userId) {
          throw new Error(
            'Apenas o Responsável Técnico formalmente designado no laudo possui a atribuição legal e intransferível de emitir e assinar a versão pericial.'
          );
        }

        // 3. Recarregar Cliente Canônico
        const client = await clientGateway.getClientById(activeOrganizationId, appraisal.clientId);
        if (!client) {
          throw new Error(`Cliente contratante (ID: ${appraisal.clientId}) não encontrado no cadastro.`);
        }
        if (client.status !== 'active') {
          throw new Error('O cliente contratante encontra-se inativo no cadastro.');
        }

        // 4. Recarregar Imóvel Canônico
        const property = await propertyGateway.getPropertyById(activeOrganizationId, appraisal.propertyId);
        if (!property) {
          throw new Error(`Imóvel avaliando (ID: ${appraisal.propertyId}) não encontrado no cadastro.`);
        }
        if (property.status !== 'active') {
          throw new Error('O imóvel avaliando encontra-se inativo no cadastro.');
        }

        // 5. Recarregar Perfil Técnico do Responsável
        const technicalProfile = await technicalGateway.getProfileByUserId(
          activeOrganizationId,
          appraisal.responsibleUserId
        );
        if (!technicalProfile) {
          throw new Error('Perfil profissional técnico do responsável não cadastrado na organização.');
        }

        if (technicalProfile.status !== 'manually_verified') {
          throw new Error('Perfil profissional técnico deve estar formalmente verificado ("manually_verified").');
        }

        // Impedir autoverificação (segregação de funções)
        if (technicalProfile.verifiedByUserId && technicalProfile.verifiedByUserId === actor.userId) {
          throw new Error('Violação de segregação de funções: o profissional técnico não pode autoverificar o próprio perfil.');
        }

        // 6. Validar Elegibilidade Técnica Estrita
        const eligibility = evaluateTechnicalEligibility({
          userId: actor.userId,
          userPermissions: actor.permissions,
          activeOrganizationId,
          targetOrganizationId: appraisal.organizationId,
          isMembershipActive: activeMember.isActive,
          profile: technicalProfile,
          propertyType: appraisal.propertyType,
          appraisalStatus: appraisal.status,
          intent: 'issue',
        });

        if (!eligibility.canIssue || !eligibility.allowed) {
          const reasonsStr = eligibility.reasons.join(' ');
          throw new Error(`Inaptidão técnica para emissão de laudo: ${reasonsStr}`);
        }

        // 7. Recarregar Dossiê, Amostras, Cálculo e Enquadramento Normativo
        const dossier = await appraisalGateway.getTechnicalDossier(activeOrganizationId, appraisalId);
        const samples = await appraisalGateway.listMarketSamples(activeOrganizationId, appraisalId);
        const calculations = await appraisalGateway.getCalculationSection(activeOrganizationId, appraisalId);
        const normative = await appraisalGateway.getNormativeSection(activeOrganizationId, appraisalId);

        // 8. Calcular Homogeneização OBRIGATORIAMENTE antes da Prontidão Técnica
        const { homogenizedResults, stats: statisticalAnalysis } = calculateSampleHomogenization(samples);

        // 9. Avaliar Prontidão Técnica NBR 14653
        const readiness = evaluateAppraisalReadiness({
          appraisal,
          dossier,
          calculations,
          statistics: statisticalAnalysis,
          normative,
          technicalProfile,
        });

        if (!readiness.isReadyToIssue) {
          const impeditiveReasons = readiness.items
            .filter((item) => item.severity === 'impeditive' && !item.isResolved)
            .map((item) => `${item.title}: ${item.description}`)
            .join('; ');
          throw new Error(`Pendências impeditivas impedem a emissão pericial formal: ${impeditiveReasons}`);
        }

        // 10. Listar Versões Anteriores para Versionamento Atômico
        const previousVersions = await appraisalGateway.listIssuedVersions(activeOrganizationId, appraisalId);
        const nextVersionNumber = previousVersions.length + 1;
        const now = new Date().toISOString();

        // 11. Construir Snapshot Canônico com Dados Reais
        const isIndividual = client.personType === 'individual';
        const clientName = isIndividual ? client.name : (client.companyName || client.tradeName || client.cnpj);
        const documentType = isIndividual ? 'cpf' : 'cnpj';
        const documentNumber = isIndividual ? client.cpf : client.cnpj;
        const clientCity = client.address.city;
        const clientState = client.address.state;

        const isRural = property.propertyType === 'rural';
        const totalArea = isRural ? `${property.areas.totalDeclaredAreaHa} ha` : `${property.areas.landAreaM2} m²`;
        const carReceiptNumber = isRural ? property.identifiers.carReceiptNumber : undefined;
        const propertyCity = property.location.city;
        const propertyState = property.location.state;

        const snapshot = buildAppraisalCanonicalSnapshot({
          appraisal,
          client: {
            id: client.id,
            name: clientName,
            documentType,
            documentNumber,
            stateRegistration: isIndividual ? undefined : client.stateRegistration,
            city: clientCity,
            state: clientState,
          },
          property: {
            id: property.id,
            propertyType: property.propertyType,
            name: property.name,
            city: propertyCity,
            state: propertyState,
            totalArea,
            carReceiptNumber,
            registrations: property.registrations.map((reg) => ({
              id: reg.id,
              registrationNumber: reg.registrationNumber,
              registryOffice: reg.registryOffice,
              state: reg.state,
            })),
          },
          technicalProfile,
          dossier,
          calculations,
          marketSamples: samples,
          homogenizedResults,
          statisticalAnalysis,
          normative,
          versionNumber: nextVersionNumber,
        });

        // 12. Calcular Checksum SHA-256 Canônico
        const checksumSha256 = computeDeterministicChecksum(snapshot);

        // Conferência de idempotência por payload hash
        const cachedIdemp = AppraisalIssuanceService.idempotencyStore.get(idempKey);
        if (cachedIdemp) {
          if (cachedIdemp.payloadHash === checksumSha256) {
            return cachedIdemp.result;
          }
          throw new Error('IDEMPOTENCY_CONFLICT: Tentativa de emissão com chave reutilizada e conteúdo divergente.');
        }

        const newIssuedVersion: AppraisalIssuedVersion = {
          id: `ver_${appraisal.id}_v${nextVersionNumber}`,
          appraisalId: appraisal.id,
          organizationId: activeOrganizationId,
          versionNumber: nextVersionNumber,
          issuedAt: now,
          issuedByUserId: actor.userId,
          issuedByUserName: actor.userName,
          checksumSha256,
          isSuperseded: false,
          snapshot,
        };

        // 13. Salvar Versão no Gateway
        const savedVersion = await appraisalGateway.saveIssuedVersion(activeOrganizationId, newIssuedVersion);

        // 14. Atualizar Status do Laudo para 'issued'
        const updatedAppraisal = await appraisalGateway.updateAppraisalStatus({
          organizationId: activeOrganizationId,
          appraisalId: appraisal.id,
          newStatus: 'issued',
          actorUserId: actor.userId,
        });

        // 15. Emitir Evento de Domínio
        createAppraisalDomainEvent({
          organizationId: activeOrganizationId,
          eventType: 'appraisal_status_changed',
          entityType: 'appraisal',
          entityId: appraisal.id,
          actorUserId: actor.userId,
          payload: {
            appraisalId: appraisal.id,
            previousStatus: appraisal.status,
            newStatus: 'issued',
            versionNumber: nextVersionNumber,
            checksumSha256,
          },
        });

        const finalResult: IssueAppraisalVersionResult = {
          issuedVersion: savedVersion,
          updatedAppraisal,
        };

        AppraisalIssuanceService.idempotencyStore.set(idempKey, {
          payloadHash: checksumSha256,
          result: finalResult,
        });

        return finalResult;
      } finally {
        release();
      }
    })();

    AppraisalIssuanceService.inFlightIssuances.set(idempKey, executionPromise);

    try {
      return await executionPromise;
    } finally {
      AppraisalIssuanceService.inFlightIssuances.delete(idempKey);
    }
  }

  clearAllSessionData(): void {
    AppraisalIssuanceService.issuanceLocks.clear();
    AppraisalIssuanceService.idempotencyStore.clear();
    AppraisalIssuanceService.inFlightIssuances.clear();
  }
}

export const appraisalIssuanceService = new AppraisalIssuanceService();

registerDomainCleanup(() => {
  appraisalIssuanceService.clearAllSessionData();
});
