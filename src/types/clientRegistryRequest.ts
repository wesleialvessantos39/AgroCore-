export type ClientRegistryRequestId = string;

export type ClientRegistryRequestScope =
  | 'property_registration'
  | 'geolocation'
  | 'photos'
  | 'photos_and_geolocation';

export type ClientRegistryRequestSourceType = 'appraisal' | 'visit';

export type ClientRegistryRequestStatus =
  | 'open'
  | 'in_progress'
  | 'fulfilled'
  | 'cancelled';

export interface ClientRegistryRequest {
  readonly id: ClientRegistryRequestId;
  readonly organizationId: string;
  readonly clientId: string;
  readonly propertyId?: string;
  readonly assignedCapturerUserId: string;
  readonly requestedByUserId: string;
  readonly sourceType: ClientRegistryRequestSourceType;
  readonly sourceId: string;
  readonly scope: ClientRegistryRequestScope;
  readonly status: ClientRegistryRequestStatus;
  readonly note?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fulfilledAt?: string;
}

export interface CreateClientRegistryRequestInput {
  readonly organizationId: string;
  readonly clientId: string;
  readonly propertyId?: string;
  readonly requestedByUserId: string;
  readonly sourceType: ClientRegistryRequestSourceType;
  readonly sourceId: string;
  readonly scope: ClientRegistryRequestScope;
  readonly note?: string;
}

export interface ClientRegistryRequestGateway {
  listAssigned(
    organizationId: string,
    capturerUserId: string,
    signal?: AbortSignal
  ): Promise<readonly ClientRegistryRequest[]>;

  listRequestedBy(
    organizationId: string,
    requesterUserId: string,
    signal?: AbortSignal
  ): Promise<readonly ClientRegistryRequest[]>;

  create(
    input: CreateClientRegistryRequestInput
  ): Promise<ClientRegistryRequest>;

  start(
    organizationId: string,
    requestId: string
  ): Promise<ClientRegistryRequest>;

  attachProperty(
    organizationId: string,
    requestId: string,
    propertyId: string
  ): Promise<ClientRegistryRequest>;

  fulfill(
    organizationId: string,
    requestId: string
  ): Promise<ClientRegistryRequest>;

  clearAllSessionData(): void;
}
