import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, Loader2, MapPin, Plus } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useAuthorization } from '../authorization/useAuthorization';
import { useClients } from '../clients/useClients';
import { getClientRegistryRequestGateway } from '../clients/clientRegistryRequestGatewayFactory';
import { FieldEvidencePanel } from '../fieldVisits/FieldEvidencePanel';
import { useOrganization } from '../organization/useOrganization';
import { getPropertyGateway } from '../properties/gatewayFactory';
import type { Client } from '../types/client';
import type { PropertySummary } from '../types/property';
import { getClientEvidencePath, ROUTES } from '../routes/paths';
import { FIELD_VISIT_THEME } from '../fieldVisits/theme';

function clientName(client: Client): string {
  return client.personType === 'individual'
    ? client.name
    : client.tradeName?.trim() || client.companyName;
}

export function ClientEvidencePage() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const { can } = useAuthorization();
  const { activeOrganization } = useOrganization();
  const clients = useClients();

  const requestGateway = useMemo(() => getClientRegistryRequestGateway(), []);
  const [client, setClient] = useState<Client | null>(null);
  const [properties, setProperties] = useState<readonly PropertySummary[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    searchParams.get('propertyId') || ''
  );
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const requestId = searchParams.get('requestId') || undefined;
  const organizationId = activeOrganization?.id ?? null;
  const canEditEvidence =
    can('properties:edit') ||
    can('client_registry_requests:fulfill');

  const load = useCallback(async () => {
    if (!organizationId || !clientId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const [foundClient, propertyPage] = await Promise.all([
        clients.getClientById(clientId),
        getPropertyGateway().listProperties({
          organizationId,
          clientId,
          propertyType: 'all',
          status: 'all',
          searchTerm: '',
          page: 1,
          pageSize: 100,
        }),
      ]);

      if (!foundClient) {
        throw new Error('Cliente não encontrado nesta organização.');
      }

      setClient(foundClient);
      setProperties(propertyPage.items);

      const requestedPropertyId = searchParams.get('propertyId');
      const nextPropertyId =
        requestedPropertyId &&
        propertyPage.items.some((item) => item.id === requestedPropertyId)
          ? requestedPropertyId
          : propertyPage.items[0]?.id || '';

      setSelectedPropertyId(nextPropertyId);

      if (requestId) {
        try {
          await requestGateway.start(organizationId, requestId);
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Não foi possível iniciar a solicitação cadastral.'
          );
        }
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar fotos e geolocalização.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    clientId,
    clients,
    organizationId,
    requestGateway,
    requestId,
    searchParams,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const createPropertyPath = useMemo(() => {
    if (!clientId) return ROUTES.PROPERTIES_NEW;

    const params = new URLSearchParams();
    params.set('clientId', clientId);
    params.set(
      'returnTo',
      getClientEvidencePath(clientId, undefined, requestId)
    );
    if (requestId) params.set('registryRequestId', requestId);
    return ROUTES.PROPERTIES_NEW + '?' + params.toString();
  }, [clientId, requestId]);

  if (loading) {
    return (
      <div
        className="min-h-[320px] flex items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-7 w-7 animate-spin text-[#0B3D2E]" aria-hidden="true" />
        <span className="ml-2 text-sm text-[#0B3D2E]">
          Carregando cadastro territorial...
        </span>
      </div>
    );
  }

  if (!client || !clientId) {
    return (
      <div className="rounded-2xl border border-[#0B3D2E]/20 bg-white p-6">
        <p role="alert" className="text-sm text-[#0B3D2E]">
          {message || 'Cliente não localizado.'}
        </p>
        <button
          type="button"
          className={FIELD_VISIT_THEME.buttonSecondary + ' mt-4'}
          onClick={() => navigate(ROUTES.CLIENTS)}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para clientes
        </button>
      </div>
    );
  }

  const selectedProperty = properties.find(
    (item) => item.id === selectedPropertyId
  );

  return (
    <div id="client-property-evidence-page" className="mx-auto max-w-6xl space-y-5 pb-12">
      <header className="rounded-2xl border border-[#0B3D2E]/15 bg-white p-5 sm:p-6">
        <button
          type="button"
          className={FIELD_VISIT_THEME.buttonSecondary}
          onClick={() => navigate(ROUTES.CLIENTS)}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para clientes
        </button>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0B3D2E]/70">
            Cadastro do cliente
          </p>
          <h1 className="mt-1 text-xl font-bold text-[#0B3D2E] sm:text-2xl">
            Fotos e geolocalização dos imóveis
          </h1>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            {clientName(client)}
          </p>
        </div>
      </header>

      {message && (
        <div role="alert" className={FIELD_VISIT_THEME.surfaceSoft + ' p-4 text-sm'}>
          {message}
        </div>
      )}

      {properties.length === 0 ? (
        <section className={FIELD_VISIT_THEME.surface + ' p-5'}>
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 text-[#0B3D2E]" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-semibold text-[#0B3D2E]">
                Nenhum imóvel cadastrado para este cliente
              </h2>
              <p className="mt-1 text-sm text-[#0B3D2E]/70">
                Cadastre primeiro o imóvel. Depois as fotografias e coordenadas
                ficarão vinculadas a ele e serão reutilizadas pelo laudo e pela vistoria.
              </p>
              {can('properties:create') && (
                <button
                  type="button"
                  className={FIELD_VISIT_THEME.buttonPrimary + ' mt-4'}
                  onClick={() => navigate(createPropertyPath)}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Cadastrar imóvel deste cliente
                </button>
              )}
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className={FIELD_VISIT_THEME.surface + ' p-4 sm:p-5'}>
            <label className="block text-sm font-semibold text-[#0B3D2E]">
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Imóvel do cliente
              </span>
              <select
                value={selectedPropertyId}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedPropertyId(value);
                  navigate(
                    getClientEvidencePath(clientId, value, requestId),
                    { replace: true }
                  );
                }}
                className={FIELD_VISIT_THEME.input + ' mt-2'}
              >
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name} — {property.city}/{property.state}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {selectedProperty && (
            <FieldEvidencePanel
              mode="registry"
              clientId={clientId}
              propertyId={selectedProperty.id}
              registryRequestId={requestId}
              canEdit={canEditEvidence}
            />
          )}
        </>
      )}

      {session?.organizationRole === 'capturer' && requestId && (
        <p className="text-xs text-[#0B3D2E]/60">
          Esta tela foi aberta a partir de uma solicitação de cadastro atribuída a você.
        </p>
      )}
    </div>
  );
}
