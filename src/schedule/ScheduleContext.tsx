import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/useAuth';
import { useAuthorization } from '../authorization/useAuthorization';
import { useOrganization } from '../organization/useOrganization';
import {
  ScheduleDomainError,
  type CreateCalendarAppointmentInput,
  type CreateCorporateTaskInput,
  type ScheduleApplicationContext,
  type ScheduleCollaborationRevision,
  type ScheduleItem,
  type ScheduleItemAuditEntry,
  type ScheduleItemListFilters,
  type ScheduleMemberOption,
  type ScheduleTransitionInput,
  type SetScheduleCollaborationInput,
  type UpdateScheduleItemInput,
} from '../types/schedule';
import { getScheduleGateway } from './gatewayFactory';
import { ScheduleService } from './scheduleService';

export type ScheduleContextStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'unavailable'
  | 'error';

export interface ScheduleContextValue {
  readonly status: ScheduleContextStatus;
  readonly items: readonly ScheduleItem[];
  readonly eligibleMembers: readonly ScheduleMemberOption[];
  readonly isMemberDirectoryAvailable: boolean;
  readonly currentUserId: string | null;
  readonly canManage: boolean;
  readonly filters: ScheduleItemListFilters;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly setFilters: (filters: Partial<ScheduleItemListFilters>) => void;
  readonly clearFilters: () => void;
  readonly refresh: () => Promise<void>;
  readonly getItemById: (scheduleItemId: string) => Promise<ScheduleItem | null>;
  readonly getAudit: (
    scheduleItemId: string
  ) => Promise<readonly ScheduleItemAuditEntry[]>;
  readonly getCollaborationRevisions: (
    scheduleItemId: string
  ) => Promise<readonly ScheduleCollaborationRevision[]>;
  readonly createTask: (
    input: Omit<CreateCorporateTaskInput, 'kind'>
  ) => Promise<ScheduleItem>;
  readonly createAppointment: (
    input: Omit<CreateCalendarAppointmentInput, 'kind'>
  ) => Promise<ScheduleItem>;
  readonly updateItem: (
    scheduleItemId: string,
    input: UpdateScheduleItemInput
  ) => Promise<ScheduleItem>;
  readonly setCollaboration: (
    scheduleItemId: string,
    input: SetScheduleCollaborationInput
  ) => Promise<ScheduleItem>;
  readonly completeItem: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
  readonly reopenItem: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
  readonly cancelItem: (
    scheduleItemId: string,
    input: ScheduleTransitionInput
  ) => Promise<ScheduleItem>;
}

export const ScheduleContext =
  createContext<ScheduleContextValue | null>(null);

const EMPTY_FILTERS: ScheduleItemListFilters = {
  kind: 'all',
  status: 'all',
  viewScope: 'personal',
};

export function ScheduleProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const { status: authStatus, session } = useAuth();
  const {
    status: organizationStatus,
    activeOrganization,
    activeMembership,
  } = useOrganization();
  const { can, activePermissions } = useAuthorization();

  const [status, setStatus] =
    useState<ScheduleContextStatus>('idle');
  const [items, setItems] = useState<readonly ScheduleItem[]>([]);
  const [eligibleMembers, setEligibleMembers] =
    useState<readonly ScheduleMemberOption[]>([]);
  const [isMemberDirectoryAvailable, setMemberDirectoryAvailable] =
    useState(false);
  const [filters, setFiltersState] =
    useState<ScheduleItemListFilters>(EMPTY_FILTERS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sequenceRef = useRef(0);
  const organizationRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const organizationId = activeOrganization?.id ?? null;
  const userId = session?.user?.id ?? null;
  const canView = can('schedule:view');
  const canManage = can('schedule:manage');

  const gateway = useMemo(() => getScheduleGateway(), []);
  const service = useMemo(() => new ScheduleService(gateway), [gateway]);

  const applicationContext =
    useMemo<ScheduleApplicationContext | null>(() => {
      if (
        !organizationId ||
        !userId ||
        !activeMembership ||
        activeMembership.status !== 'active' ||
        !activeMembership.organizationRole
      ) {
        return null;
      }

      return {
        organizationId,
        actor: {
          userId,
          role: activeMembership.organizationRole,
          isActive: true,
          permissions: Array.from(activePermissions),
        },
      };
    }, [
      activeMembership,
      activePermissions,
      organizationId,
      userId,
    ]);

  const reset = useCallback(() => {
    sequenceRef.current += 1;
    organizationRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setItems([]);
    setEligibleMembers([]);
    setMemberDirectoryAvailable(false);
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  const refresh = useCallback(async () => {
    if (!applicationContext || !canView || !organizationId) {
      reset();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++sequenceRef.current;
    organizationRef.current = organizationId;
    setStatus('loading');
    setErrorMessage(null);

    try {
      const [nextItems, memberResult] = await Promise.all([
        service.listItems(
          applicationContext,
          filters,
          controller.signal
        ),
        service
          .listEligibleMembers(applicationContext, controller.signal)
          .then((members) => ({
            available: true as const,
            members,
          }))
          .catch(() => ({
            available: false as const,
            members: [] as readonly ScheduleMemberOption[],
          })),
      ]);

      const currentMember: ScheduleMemberOption | null =
        memberResult.available &&
        applicationContext.actor.role !== 'none'
          ? {
              userId: applicationContext.actor.userId,
              organizationRole: applicationContext.actor.role,
              displayName:
                session?.user?.name?.trim() ||
                'Integrante da organização',
            }
          : null;

      const nextMembers = currentMember
        ? [
            currentMember,
            ...memberResult.members.filter(
              (member) => member.userId !== currentMember.userId
            ),
          ]
        : memberResult.members;
      if (
        controller.signal.aborted ||
        requestId !== sequenceRef.current ||
        organizationRef.current !== organizationId
      ) {
        return;
      }
      setItems(nextItems);
      setEligibleMembers(nextMembers);
      setMemberDirectoryAvailable(memberResult.available);
      setStatus(nextItems.length === 0 ? 'empty' : 'ready');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (
        requestId !== sequenceRef.current ||
        organizationRef.current !== organizationId
      ) {
        return;
      }
      setItems([]);
      const unavailable =
        error instanceof ScheduleDomainError &&
        error.code === 'SERVICE_UNAVAILABLE';
      setErrorMessage(
        unavailable
          ? 'O serviço de agenda está indisponível neste ambiente.'
          : 'Não foi possível carregar a agenda no momento.'
      );
      setStatus(unavailable ? 'unavailable' : 'error');
    }
  }, [
    applicationContext,
    canView,
    filters,
    organizationId,
    reset,
    service,
    session?.user?.name,
  ]);

  useEffect(() => {
    if (
      authStatus !== 'authenticated' ||
      organizationStatus !== 'active' ||
      !applicationContext ||
      !canView
    ) {
      reset();
      return;
    }

    void refresh();
    return () => abortRef.current?.abort();
  }, [
    applicationContext,
    authStatus,
    canView,
    organizationStatus,
    refresh,
    reset,
  ]);

  const ensureContext = useCallback((): ScheduleApplicationContext => {
    if (!applicationContext) {
      throw new ScheduleDomainError(
        'ORGANIZATION_REQUIRED',
        'É necessário possuir vínculo ativo com uma organização.'
      );
    }
    return applicationContext;
  }, [applicationContext]);

  const createTask = useCallback(
    async (input: Omit<CreateCorporateTaskInput, 'kind'>) => {
      const created = await service.createTask(ensureContext(), input);
      await refresh();
      return created;
    },
    [ensureContext, refresh, service]
  );

  const createAppointment = useCallback(
    async (input: Omit<CreateCalendarAppointmentInput, 'kind'>) => {
      const created = await service.createAppointment(
        ensureContext(),
        input
      );
      await refresh();
      return created;
    },
    [ensureContext, refresh, service]
  );

  const updateItem = useCallback(
    async (
      scheduleItemId: string,
      input: UpdateScheduleItemInput
    ) => {
      const updated = await service.updateItem(
        ensureContext(),
        scheduleItemId,
        input
      );
      await refresh();
      return updated;
    },
    [ensureContext, refresh, service]
  );

  const getItemById = useCallback(
    (scheduleItemId: string) =>
      service.getItemById(ensureContext(), scheduleItemId),
    [ensureContext, service]
  );

  const getAudit = useCallback(
    (scheduleItemId: string) =>
      service.listAudit(ensureContext(), scheduleItemId),
    [ensureContext, service]
  );

  const getCollaborationRevisions = useCallback(
    (scheduleItemId: string) =>
      service.listCollaborationRevisions(
        ensureContext(),
        scheduleItemId
      ),
    [ensureContext, service]
  );

  const setCollaboration = useCallback(
    async (
      scheduleItemId: string,
      input: SetScheduleCollaborationInput
    ) => {
      const updated = await service.setCollaboration(
        ensureContext(),
        scheduleItemId,
        input
      );
      await refresh();
      return updated;
    },
    [ensureContext, refresh, service]
  );

  const completeItem = useCallback(
    async (
      scheduleItemId: string,
      input: ScheduleTransitionInput
    ) => {
      const updated = await service.completeItem(
        ensureContext(),
        scheduleItemId,
        input
      );
      await refresh();
      return updated;
    },
    [ensureContext, refresh, service]
  );

  const reopenItem = useCallback(
    async (
      scheduleItemId: string,
      input: ScheduleTransitionInput
    ) => {
      const updated = await service.reopenItem(
        ensureContext(),
        scheduleItemId,
        input
      );
      await refresh();
      return updated;
    },
    [ensureContext, refresh, service]
  );

  const cancelItem = useCallback(
    async (
      scheduleItemId: string,
      input: ScheduleTransitionInput
    ) => {
      const updated = await service.cancelItem(
        ensureContext(),
        scheduleItemId,
        input
      );
      await refresh();
      return updated;
    },
    [ensureContext, refresh, service]
  );

  const setFilters = useCallback(
    (next: Partial<ScheduleItemListFilters>) => {
      setFiltersState((current) => ({ ...current, ...next }));
    },
    []
  );

  const clearFilters = useCallback(() => {
    setFiltersState(EMPTY_FILTERS);
  }, []);

  const value = useMemo<ScheduleContextValue>(
    () => ({
      status,
      items,
      eligibleMembers,
      isMemberDirectoryAvailable,
      currentUserId: userId,
      canManage,
      filters,
      isLoading: status === 'loading',
      errorMessage,
      setFilters,
      clearFilters,
      refresh,
      getItemById,
      getAudit,
      getCollaborationRevisions,
      createTask,
      createAppointment,
      updateItem,
      setCollaboration,
      completeItem,
      reopenItem,
      cancelItem,
    }),
    [
      clearFilters,
      canManage,
      cancelItem,
      completeItem,
      createAppointment,
      createTask,
      eligibleMembers,
      errorMessage,
      isMemberDirectoryAvailable,
      filters,
      getAudit,
      getCollaborationRevisions,
      getItemById,
      items,
      refresh,
      reopenItem,
      setCollaboration,
      setFilters,
      status,
      updateItem,
      userId,
    ]
  );

  return (
    <ScheduleContext.Provider value={value}>
      {children}
    </ScheduleContext.Provider>
  );
}
