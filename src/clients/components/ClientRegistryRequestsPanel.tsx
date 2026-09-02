import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, MapPin, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useAuthorization } from '../../authorization/useAuthorization';
import { useClients } from '../useClients';
import { useOrganization } from '../../organization/useOrganization';
import { getClientRegistryRequestGateway } from '../clientRegistryRequestGatewayFactory';
import type { ClientRegistryRequest } from '../../types/clientRegistryRequest';
import { getClientEvidencePath } from '../../routes/paths';

const SCOPE_LABEL: Readonly<Record<ClientRegistryRequest['scope'], string>> = {
  property_registration: 'Cadastrar imóvel e completar cadastro territorial',
  geolocation: 'Cadastrar geolocalização do imóvel',
  photos: 'Cadastrar fotos do imóvel',
  photos_and_geolocation: 'Cadastrar fotos e geolocalização do imóvel',
};

export function ClientRegistryRequestsPanel() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { can } = useAuthorization();
  const { activeOrganization } = useOrganization();
  const clients = useClients();

  const gateway = useMemo(() => getClientRegistryRequestGateway(), []);
  const [requests, setRequests] = useState<readonly ClientRegistryRequest[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canView = can('client_registry_requests:view_assigned');
  const organizationId = activeOrganization?.id ?? null;
  const userId = session?.user?.id ?? null;

  const load = useCallback(async () => {
    if (!canView || !organizationId || !userId) {
      setRequests([]);
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const next = await gateway.listAssigned(organizationId, userId);
      setRequests(next);

      const ids = [...new Set(next.map((item) => item.clientId))];
      const entries = await Promise.all(
        ids.map(async (id) => {
          const client = await clients.getClientById(id);
          const name = !client
            ? 'Cliente'
            : client.personType === 'individual'
              ? client.name
              : client.tradeName?.trim() || client.companyName;
          return [id, name] as const;
        })
      );
      setClientNames(Object.fromEntries(entries));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar as solicitações cadastrais.'
      );
    } finally {
      setLoading(false);
    }
  }, [canView, clients, gateway, organizationId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) return null;

  return (
    <section
      id="client-registry-requests"
      className="rounded-2xl border border-[#0B3D2E]/15 bg-white p-4 shadow-xs sm:p-5"
      aria-labelledby="client-registry-requests-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id="client-registry-requests-title"
            className="flex items-center gap-2 font-bold text-[#0B3D2E]"
          >
            <ClipboardList className="h-5 w-5" aria-hidden="true" />
            Solicitações de cadastro
          </h2>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            Pendências de clientes atribuídas a você por projetistas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#0B3D2E]/20 bg-white px-4 py-2 text-sm font-semibold text-[#0B3D2E] focus:ring-2 focus:ring-[#78C89A]"
        >
          <RefreshCw
            className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')}
            aria-hidden="true"
          />
          Atualizar
        </button>
      </div>

      {message && (
        <p role="alert" className="mt-3 text-sm text-[#0B3D2E]">
          {message}
        </p>
      )}

      {!loading && requests.length === 0 ? (
        <p className="mt-4 text-sm text-[#0B3D2E]/60">
          Nenhuma solicitação de cadastro pendente.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {requests.map((request) => (
            <article
              key={request.id}
              className="rounded-xl border border-[#0B3D2E]/15 bg-[#78C89A]/10 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-[#0B3D2E]">
                    {clientNames[request.clientId] || 'Cliente'}
                  </p>
                  <p className="mt-1 text-sm text-[#0B3D2E]/70">
                    {SCOPE_LABEL[request.scope]}
                  </p>
                  <p className="mt-1 text-xs text-[#0B3D2E]/60">
                    {request.status === 'open' ? 'Nova solicitação' : 'Em andamento'}
                  </p>
                </div>

                <button
                  type="button"
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-2 text-sm font-semibold text-white focus:ring-2 focus:ring-[#78C89A]"
                  onClick={() =>
                    navigate(
                      getClientEvidencePath(
                        request.clientId,
                        request.propertyId,
                        request.id
                      )
                    )
                  }
                >
                  <MapPin className="h-4 w-4 text-[#78C89A]" aria-hidden="true" />
                  Abrir cadastro
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
