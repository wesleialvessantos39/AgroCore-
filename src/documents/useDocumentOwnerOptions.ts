import { useEffect, useMemo, useState } from 'react';
import { useAppraisals } from '../appraisals/useAppraisals';
import { useAuth } from '../auth/useAuth';
import { getClientCapturerAssignmentGateway } from '../clients/capturerAssignmentGatewayFactory';
import { useClients } from '../clients/useClients';
import { useOrganization } from '../organization/useOrganization';
import { useProperties } from '../properties/useProperties';
import { useProposals } from '../proposals/useProposals';
import type { DocumentLogicalOwnerType } from '../types/documents';

export interface DocumentOwnerOption {
  readonly id: string;
  readonly label: string;
}

export interface DocumentOwnerOptionsResult {
  readonly allowedOwnerTypes: readonly DocumentLogicalOwnerType[];
  readonly ownerOptions: readonly DocumentOwnerOption[];
  readonly isManagement: boolean;
}

export function useDocumentOwnerOptions(
  ownerType: DocumentLogicalOwnerType
): DocumentOwnerOptionsResult {
  const { session } = useAuth();
  const { activeOrganization, activeMembership } = useOrganization();
  const { clients } = useClients();
  const { properties } = useProperties();
  const { appraisals, requests } = useAppraisals();
  const { proposals } = useProposals();
  const [capturerClientIds, setCapturerClientIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const role = activeMembership?.organizationRole ?? 'none';
  const isManagement = role === 'owner' || role === 'company_admin' || role === 'manager';

  useEffect(() => {
    let active = true;
    async function loadCapturerScope() {
      if (role !== 'capturer' || !session?.user.id || !activeOrganization?.id) {
        if (active) setCapturerClientIds(new Set());
        return;
      }
      try {
        const ids = await getClientCapturerAssignmentGateway().listClientsByCapturer(
          activeOrganization.id,
          session.user.id
        );
        if (active) setCapturerClientIds(new Set(ids));
      } catch {
        if (active) setCapturerClientIds(new Set());
      }
    }
    void loadCapturerScope();
    return () => {
      active = false;
    };
  }, [activeOrganization?.id, role, session?.user.id]);

  const allowedOwnerTypes = useMemo<readonly DocumentLogicalOwnerType[]>(() => {
    if (isManagement) return ['client', 'property', 'appraisal_request', 'appraisal', 'proposal'];
    if (role === 'project_designer') return ['appraisal_request', 'appraisal', 'proposal'];
    if (role === 'capturer') return ['client', 'property', 'appraisal_request', 'proposal'];
    return [];
  }, [isManagement, role]);

  const ownerOptions = useMemo<readonly DocumentOwnerOption[]>(() => {
    if (ownerType === 'client') {
      return clients
        .filter((client) => role !== 'capturer' || capturerClientIds.has(client.id))
        .map((client) => ({
          id: client.id,
          label: client.personType === 'individual' ? client.name : client.companyName,
        }));
    }
    if (ownerType === 'property') {
      return properties
        .filter(
          (property) =>
            role !== 'capturer' ||
            property.clientLinks.some((link) => capturerClientIds.has(link.clientId))
        )
        .map((property) => ({ id: property.id, label: property.name }));
    }
    if (ownerType === 'appraisal_request') {
      return requests.map((request) => ({ id: request.id, label: request.purpose }));
    }
    if (ownerType === 'appraisal') {
      return appraisals.map((appraisal) => ({ id: appraisal.id, label: appraisal.title }));
    }
    return proposals.map((proposal) => ({
      id: proposal.id,
      label: `${proposal.proposalNumber} — ${proposal.title}`,
    }));
  }, [appraisals, capturerClientIds, clients, ownerType, properties, proposals, requests, role]);

  return { allowedOwnerTypes, ownerOptions, isManagement };
}
