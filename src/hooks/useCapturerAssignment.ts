/**
 * Hook para Gestão de Vínculos Cliente-Captador
 * Módulo 002 & Módulo 004 — AgroCore
 */

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import { useAuthorization } from '../authorization/useAuthorization';
import { clientCapturerService, CapturerOrchestrationContext } from '../clients/clientCapturerService';
import { getClientGateway } from '../clients/gatewayFactory';
import { getOrganizationMembersGateway } from '../auth/organizationMembersGatewayFactory';
import {
  ClientCapturerAssignment,
  CreateCapturerAssignmentInput,
  TerminateCapturerAssignmentInput,
  TransferCapturerAssignmentInput,
} from '../types/clientCapturerAssignment';

export function useCapturerAssignment() {
  const { session } = useAuth();
  const { activeOrganization, activeMembership } = useOrganization();
  const { activePermissions } = useAuthorization();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgId = activeOrganization?.id;
  const userId = session?.user?.id;

  const orchestrationContext = useMemo<CapturerOrchestrationContext | null>(() => {
    if (
      !orgId ||
      !userId ||
      !activeMembership ||
      activeMembership.status !== 'active' ||
      !activeMembership.organizationRole
    ) {
      return null;
    }

    return {
      organizationId: orgId,
      actor: {
        userId,
        organizationRole: activeMembership.organizationRole,
        isActive: activeMembership.status === 'active',
        permissions: Array.from(activePermissions),
      },
      clientResolver: (clientId: string) =>
        getClientGateway().getClientById(orgId, clientId),
      memberResolver: (memberUserId: string) =>
        getOrganizationMembersGateway().getMemberByUserId(orgId, memberUserId),
    };
  }, [orgId, userId, activeMembership, activePermissions]);

  const getActiveAssignment = useCallback(
    async (clientId: string): Promise<ClientCapturerAssignment | null> => {
      if (!orchestrationContext || !clientId) return null;
      try {
        setLoading(true);
        return await clientCapturerService.getActiveAssignment(clientId, orchestrationContext);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao buscar vínculo do captador.';
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [orchestrationContext]
  );

  const listAssignmentsByClient = useCallback(
    async (clientId: string): Promise<readonly ClientCapturerAssignment[]> => {
      if (!orchestrationContext || !clientId) return [];
      try {
        setLoading(true);
        return await clientCapturerService.listAssignmentsByClient(clientId, orchestrationContext);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao listar histórico de vínculos.';
        setError(msg);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [orchestrationContext]
  );

  const listClientsByCapturer = useCallback(
    async (capturerUserId: string): Promise<readonly string[]> => {
      if (!orchestrationContext || !capturerUserId) return [];
      try {
        setLoading(true);
        return await clientCapturerService.listClientsByCapturer(capturerUserId, orchestrationContext);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao listar clientes vinculados ao captador.';
        setError(msg);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [orchestrationContext]
  );

  const assignCapturer = useCallback(
    async (input: Omit<CreateCapturerAssignmentInput, 'assignedByUserId'>): Promise<ClientCapturerAssignment> => {
      if (!orchestrationContext) {
        throw new Error('Sessão ou organização não disponível.');
      }
      setLoading(true);
      setError(null);
      try {
        return await clientCapturerService.assignCapturer(
          {
            ...input,
            assignedByUserId: orchestrationContext.actor.userId,
          },
          orchestrationContext
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao atribuir captador.';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [orchestrationContext]
  );

  const transferCapturer = useCallback(
    async (input: Omit<TransferCapturerAssignmentInput, 'assignedByUserId'>): Promise<ClientCapturerAssignment> => {
      if (!orchestrationContext) {
        throw new Error('Sessão ou organização não disponível.');
      }
      setLoading(true);
      setError(null);
      try {
        return await clientCapturerService.transferCapturer(
          {
            ...input,
            assignedByUserId: orchestrationContext.actor.userId,
          },
          orchestrationContext
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao transferir captador.';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [orchestrationContext]
  );

  const terminateAssignment = useCallback(
    async (input: Omit<TerminateCapturerAssignmentInput, 'terminatedByUserId'>): Promise<ClientCapturerAssignment> => {
      if (!orchestrationContext) {
        throw new Error('Sessão ou organização não disponível.');
      }
      setLoading(true);
      setError(null);
      try {
        return await clientCapturerService.terminateAssignment(
          {
            ...input,
            terminatedByUserId: orchestrationContext.actor.userId,
          },
          orchestrationContext
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao encerrar vínculo do captador.';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [orchestrationContext]
  );

  return {
    loading,
    error,
    getActiveAssignment,
    listAssignmentsByClient,
    listClientsByCapturer,
    assignCapturer,
    transferCapturer,
    terminateAssignment,
  };
}
