import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, User, Building2, Check, AlertCircle, Loader2, X } from 'lucide-react';
import { useOrganization } from '../../organization/useOrganization';
import { getClientGateway } from '../../clients/gatewayFactory';
import { Client, ClientSummary } from '../../types/client';
import { maskCpf, maskCnpj } from '../../clients/validators';
import { PROPERTY_THEME } from '../theme';

function mapClientToSummary(client: Client): ClientSummary {
  const isPF = client.personType === 'individual';
  const name = isPF ? client.name : client.companyName;
  const doc = isPF ? maskCpf(client.cpf) : maskCnpj(client.cnpj);
  const city = client.address?.city || '';
  const state = client.address?.state || '';
  return {
    id: client.id,
    organizationId: client.organizationId,
    personType: client.personType,
    name,
    tradeName: !isPF ? client.tradeName : undefined,
    documentMasked: doc,
    primaryContact: client.contact?.primaryPhone || '',
    city,
    state,
    status: client.status,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

export interface PropertyClientSelectorProps {
  onSelectClient: (client: ClientSummary) => void;
  selectedClientIds: readonly string[];
  disabled?: boolean;
}

export function PropertyClientSelector({
  onSelectClient,
  selectedClientIds,
  disabled = false,
}: PropertyClientSelectorProps) {
  const { activeOrganization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<readonly ClientSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [pendingInactiveClient, setPendingInactiveClient] = useState<ClientSummary | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeOrgId = activeOrganization?.id;

  const performSearch = useCallback(
    async (term: string) => {
      if (!activeOrgId) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setHasSearched(true);

      try {
        const gateway = getClientGateway();
        const response = await gateway.listClients(
          {
            organizationId: activeOrgId,
            searchTerm: term.trim() || undefined,
            status: 'all',
            page: 1,
            pageSize: 20,
          },
          controller.signal
        );

        if (!controller.signal.aborted) {
          setResults(response.items.map(mapClientToSummary));
          setIsLoading(false);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setResults([]);
          setIsLoading(false);
        }
      }
    },
    [activeOrgId]
  );

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
      return;
    }

    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      performSearch(searchTerm);
    }, 250);

    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, disabled, performSearch]);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectCandidate = (client: ClientSummary) => {
    if (client.status === 'inactive') {
      setPendingInactiveClient(client);
      return;
    }
    onSelectClient(client);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleConfirmInactiveSelection = () => {
    if (pendingInactiveClient) {
      onSelectClient(pendingInactiveClient);
      setPendingInactiveClient(null);
      setSearchTerm('');
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#0B3D2E]/40">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#0B3D2E]" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </div>
        <input
          id="property-client-search-input"
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            if (!hasSearched) {
              performSearch(searchTerm);
            }
          }}
          placeholder="Pesquisar cliente ou produtor por nome ou documento..."
          disabled={disabled}
          autoComplete="off"
          className="w-full pl-9.5 pr-8 py-2.5 text-sm bg-white border border-[#0B3D2E]/20 rounded-xl text-[#0B3D2E] placeholder-[#0B3D2E]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Pesquisar cliente para vincular ao imóvel"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setIsOpen(false);
            }}
            className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#0B3D2E]/40 hover:text-[#0B3D2E]"
            aria-label="Limpar pesquisa"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-[#0B3D2E]/20 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-[#0B3D2E]/10">
          {isLoading && results.length === 0 ? (
            <div className="p-4 text-center text-sm text-[#0B3D2E]/70 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#0B3D2E]" />
              <span>Consultando clientes da organização...</span>
            </div>
          ) : results.length === 0 && hasSearched ? (
            <div className="p-4 text-center">
              <p className="text-sm font-medium text-[#0B3D2E]">
                Nenhum cliente encontrado
              </p>
              <p className="text-xs text-[#0B3D2E]/70 mt-1">
                Cadastre clientes no módulo &ldquo;Clientes e Produtores&rdquo; para vinculá-los a este imóvel.
              </p>
            </div>
          ) : (
            results.map((client) => {
              const isAlreadySelected = selectedClientIds.includes(client.id);
              const isPF = client.personType === 'individual';
              const isInactive = client.status === 'inactive';

              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => !isAlreadySelected && handleSelectCandidate(client)}
                  disabled={isAlreadySelected}
                  className={`w-full text-left px-3.5 py-3 flex items-center justify-between text-sm transition-colors ${
                    isAlreadySelected
                      ? 'bg-[#0B3D2E]/5 opacity-60 cursor-not-allowed'
                      : 'hover:bg-[#78C89A]/15 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[#0B3D2E]/10 text-[#0B3D2E] shrink-0">
                      {isPF ? <User className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#0B3D2E] truncate">
                          {client.name}
                        </span>
                        {isInactive && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded">
                            Inativo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#0B3D2E]/70 flex items-center gap-2 mt-0.5">
                        <span>{isPF ? 'Pessoa Física' : 'Pessoa Jurídica'}</span>
                        <span>•</span>
                        <span>{client.documentMasked}</span>
                        {client.city && (
                          <>
                            <span>•</span>
                            <span>{client.city}/{client.state}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div>
                    {isAlreadySelected ? (
                      <span className="text-xs font-medium text-[#0B3D2E]/40 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Vinculado
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-[#0B3D2E] bg-[#78C89A]/20 px-2.5 py-1 rounded-md border border-[#78C89A]/40">
                        Vincular
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Modal de Confirmação para Cliente Inativo */}
      {pendingInactiveClient && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="inactive-client-title"
          className={PROPERTY_THEME.modalOverlay}
        >
          <div className={PROPERTY_THEME.modalContent}>
            <div className="flex items-start gap-3 text-amber-700">
              <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
              <div>
                <h3 id="inactive-client-title" className="text-base font-bold text-[#0B3D2E]">
                  Vincular cliente com cadastro inativo
                </h3>
                <p className="text-sm text-[#0B3D2E]/80 mt-1">
                  O cliente <strong>{pendingInactiveClient.name}</strong> ({pendingInactiveClient.documentMasked}) está marcado como <strong>inativo</strong> na organização.
                </p>
                <p className="text-xs text-[#0B3D2E]/60 mt-2">
                  Deseja realmente incluí-lo como vínculo deste imóvel?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingInactiveClient(null)}
                className={PROPERTY_THEME.btnSecondary}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmInactiveSelection}
                className="px-4 py-2 text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-xl transition-colors min-h-[44px] cursor-pointer"
              >
                Sim, vincular cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
