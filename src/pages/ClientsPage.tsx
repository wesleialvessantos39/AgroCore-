import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Building2,
  AlertCircle,
  CloudOff,
  RefreshCw,
  UserPlus,
  Edit2,
  MapPin,
  Phone,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FilterX,
  UserCheck,
} from 'lucide-react';
import { useClients } from '../clients/useClients';
import { useOrganization } from '../organization/useOrganization';
import { useAuthorization } from '../authorization/useAuthorization';
import { ROUTES, getClientEditPath, getClientEvidencePath } from '../routes/paths';
import { Button } from '../components/ui/Button';
import { maskCpf, maskCnpj, formatPhone } from '../clients/validators';
import { ClientCapturerAssignmentModal } from '../components/appraisals/ClientCapturerAssignmentModal';
import { ClientRegistryRequestsPanel } from '../clients/components/ClientRegistryRequestsPanel';
import {
  ClientPersonTypeFilter,
  ClientSortOption,
  ClientStatusFilter,
} from '../types/client';

export function ClientsPage() {
  const navigate = useNavigate();
  const {
    status,
    clients,
    totalCount,
    page,
    pageSize,
    totalPages,
    searchTerm,
    personType,
    statusFilter,
    sort,
    isFiltered,
    isLoading,
    errorMessage,
    setSearchTerm,
    setPersonTypeFilter,
    setStatusFilter,
    setSort,
    setPage,
    setPageSize,
    clearFilters,
    refresh,
    reload,
  } = useClients();

  const { activeOrganization } = useOrganization();
  const { can } = useAuthorization();

  const canCreate = can('clients:create');
  const canEdit = can('clients:edit');
  const canAccessEvidence = can('properties:edit') || can('client_registry_requests:fulfill');
  const canManageAssignments = can('client_capturer_assignments:manage') || can('client_capturer_assignments:view') || can('clients:edit');

  const [assignmentClient, setAssignmentClient] = useState<{ id: string; name: string } | null>(null);

  const handleCreateClick = () => {
    navigate(ROUTES.CLIENTS_NEW);
  };

  const handleEditClick = (clientId: string) => {
    navigate(getClientEditPath(clientId));
  };

  const startIndex = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, totalCount);

  return (
    <div
      id="clients-module-page"
      className="space-y-6 max-w-7xl mx-auto pb-12"
      style={{
        paddingTop: 'var(--sat, 0px)',
        paddingLeft: 'var(--sal, 0px)',
        paddingRight: 'var(--sar, 0px)',
      }}
    >
      {/* 1. Cabeçalho Contextual da Página */}
      <header
        id="clients-page-header"
        className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-8 shadow-xs transition-all"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#0B3D2E]/10 text-[#0B3D2E] border border-[#0B3D2E]/20">
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                Módulo de Produtores
              </span>

              {activeOrganization && (
                <span
                  id="clients-active-org-badge"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                >
                  <Building2 className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <span className="truncate max-w-[200px] sm:max-w-[320px]">
                    {activeOrganization.name}
                  </span>
                </span>
              )}
            </div>

            <h1
              id="clients-page-title"
              className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
            >
              Clientes e produtores rurais
            </h1>

            <p
              id="clients-page-subtitle"
              className="text-sm sm:text-base text-slate-600 max-w-3xl leading-relaxed"
            >
              Gestão cadastral, acompanhamento e visão integrada de produtores rurais,
              pessoas físicas e jurídicas vinculadas à organização.
            </p>
          </div>

          {canCreate && (
            <div className="shrink-0 pt-2 md:pt-0">
              <Button
                id="btn-new-client"
                type="button"
                variant="primary"
                size="md"
                onClick={handleCreateClick}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 font-bold cursor-pointer min-h-[44px]"
              >
                <UserPlus className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Novo produtor</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      <ClientRegistryRequestsPanel />

            {/* 2. Barra de Busca, Filtros e Ordenação */}
      <section
        id="clients-filter-bar"
        aria-label="Filtros e busca de clientes"
        className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Campo de Busca com debounce */}
          <div className="relative flex-1 min-w-[240px]">
            <label htmlFor="client-search-input" className="sr-only">
              Buscar por nome, razão social ou documento
            </label>
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" aria-hidden="true" />
            </div>
            <input
              id="client-search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              maxLength={100}
              placeholder="Buscar por nome, razão social ou CPF/CNPJ..."
              autoComplete="off"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B3D2E] focus:ring-2 focus:ring-[#0B3D2E]/20 outline-hidden transition-all"
            />
            {searchTerm.length > 0 && (
              <button
                id="btn-clear-search"
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Limpar termo de busca"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Grupo de Filtros e Ordenação */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Filtro: Tipo de Pessoa */}
            <div className="flex-1 sm:flex-initial">
              <label htmlFor="filter-person-type" className="sr-only">
                Tipo de pessoa
              </label>
              <select
                id="filter-person-type"
                value={personType}
                onChange={(e) =>
                  setPersonTypeFilter(e.target.value as ClientPersonTypeFilter)
                }
                className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-700 hover:border-slate-300 focus:border-[#0B3D2E] focus:ring-2 focus:ring-[#0B3D2E]/20 outline-hidden cursor-pointer"
              >
                <option value="all">Todos os tipos</option>
                <option value="individual">Pessoa física</option>
                <option value="legal_entity">Pessoa jurídica</option>
              </select>
            </div>

            {/* Filtro: Situação */}
            <div className="flex-1 sm:flex-initial">
              <label htmlFor="filter-status" className="sr-only">
                Situação
              </label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as ClientStatusFilter)
                }
                className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-700 hover:border-slate-300 focus:border-[#0B3D2E] focus:ring-2 focus:ring-[#0B3D2E]/20 outline-hidden cursor-pointer"
              >
                <option value="all">Todas as situações</option>
                <option value="active">Ativas</option>
                <option value="inactive">Inativas</option>
              </select>
            </div>

            {/* Ordenação */}
            <div className="flex-1 sm:flex-initial">
              <label htmlFor="sort-clients" className="sr-only">
                Ordenação
              </label>
              <select
                id="sort-clients"
                value={sort}
                onChange={(e) => setSort(e.target.value as ClientSortOption)}
                className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm font-medium text-slate-700 hover:border-slate-300 focus:border-[#0B3D2E] focus:ring-2 focus:ring-[#0B3D2E]/20 outline-hidden cursor-pointer"
              >
                <option value="name_asc">Nome (A-Z)</option>
                <option value="name_desc">Nome (Z-A)</option>
                <option value="created_at_desc">Mais recentes</option>
                <option value="created_at_asc">Mais antigos</option>
              </select>
            </div>

            {/* Botão de Limpeza Rápida de Filtros */}
            {isFiltered && (
              <button
                id="btn-clear-filters"
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer transition-colors"
                title="Limpar todos os filtros e busca"
              >
                <X className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span>Limpar filtros</span>
              </button>
            )}
          </div>
        </div>

        {/* Quantidade de resultados / Indicador */}
        <div className="flex items-center justify-between text-xs sm:text-sm text-slate-600 pt-1 border-t border-slate-100">
          <div>
            {isLoading ? (
              <span className="animate-pulse">Consultando registros...</span>
            ) : (
              <span>
                {totalCount === 0
                  ? 'Nenhum resultado'
                  : totalCount === 1
                  ? '1 produtor encontrado'
                  : `${totalCount} produtores encontrados`}
                {isFiltered && (
                  <span className="ml-1 text-slate-400 font-normal">
                    (filtros aplicados)
                  </span>
                )}
              </span>
            )}
          </div>

          {totalCount > 0 && (
            <div className="text-slate-500 font-medium">
              Exibindo {startIndex}–{endIndex} de {totalCount}
            </div>
          )}
        </div>
      </section>

      {/* 3. Área Central de Apresentação de Estado */}
      <main id="clients-content-area" className="transition-all">
        {/* ESTADO: Carregamento */}
        {isLoading && (
          <div
            id="clients-loading-state"
            role="status"
            aria-busy="true"
            aria-label="Carregando clientes da organização"
            className="bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-12 text-center shadow-xs space-y-4 animate-pulse"
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-[#0B3D2E]">
              <RefreshCw className="w-6 h-6 animate-spin text-[#0B3D2E]" aria-hidden="true" />
            </div>
            <div className="space-y-2 max-w-sm mx-auto">
              <div className="h-4 bg-slate-200 rounded-md w-3/4 mx-auto" />
              <div className="h-3 bg-slate-100 rounded-md w-1/2 mx-auto" />
            </div>
            <p className="text-xs text-slate-500 font-medium sr-only">
              Carregando registros de clientes...
            </p>
          </div>
        )}

        {/* ESTADO: Indisponível (Ambiente sem persistência real) */}
        {!isLoading && status === 'unavailable' && (
          <div
            id="clients-unavailable-state"
            role="region"
            aria-label="Aviso de indisponibilidade"
            className="bg-white rounded-2xl border border-amber-200/80 p-8 sm:p-12 text-center shadow-xs space-y-4"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-700">
              <CloudOff className="w-7 h-7" aria-hidden="true" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Serviço de clientes indisponível
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                O módulo de clientes não está disponível para consultas neste ambiente. Por favor, tente novamente mais tarde.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => reload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#0B3D2E] outline-hidden"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {/* ESTADO: Erro de Consulta */}
        {!isLoading && status === 'error' && (
          <div
            id="clients-error-state"
            role="alert"
            aria-live="assertive"
            className="bg-white rounded-2xl border border-red-200/80 p-8 sm:p-12 text-center shadow-xs space-y-4"
          >
            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto text-red-600">
              <AlertCircle className="w-7 h-7" aria-hidden="true" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Não foi possível carregar os clientes
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {errorMessage || 'Ocorreu um erro ao consultar os registros da organização.'}
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => reload()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#0B3D2E] outline-hidden"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Recarregar lista
              </button>
            </div>
          </div>
        )}

        {/* ESTADO: Vazio com Filtros Ativos */}
        {!isLoading && status === 'ready' && clients.length === 0 && isFiltered && (
          <div
            id="clients-no-results-state"
            role="region"
            aria-label="Nenhum cliente encontrado para os filtros selecionados"
            className="bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-14 text-center shadow-xs space-y-5"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto text-amber-700">
              <FilterX className="w-7 h-7" aria-hidden="true" />
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <h2
                id="clients-no-results-title"
                className="text-lg sm:text-xl font-bold text-slate-900"
              >
                Nenhum cliente encontrado
              </h2>
              <p
                id="clients-no-results-description"
                className="text-sm sm:text-base text-slate-600 leading-relaxed"
              >
                Não encontramos nenhum resultado com os termos e filtros selecionados. Tente ajustar a busca ou limpe os filtros.
              </p>
            </div>

            <div className="pt-2">
              <button
                id="btn-clear-filters-empty-state"
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#0B3D2E] outline-hidden"
              >
                <X className="w-4 h-4" aria-hidden="true" />
                <span>Limpar filtros</span>
              </button>
            </div>
          </div>
        )}

        {/* ESTADO: Vazio Verdadeiro (Coleção sem clientes cadastrados) */}
        {!isLoading && (status === 'empty' || (status === 'ready' && clients.length === 0 && !isFiltered)) && (
          <div
            id="clients-empty-state"
            role="region"
            aria-label="Lista de clientes vazia"
            className="bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-14 text-center shadow-xs space-y-5"
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto text-[#0B3D2E]">
              <Users className="w-7 h-7" aria-hidden="true" />
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <h2
                id="clients-empty-title"
                className="text-lg sm:text-xl font-bold text-slate-900"
              >
                Nenhum cliente cadastrado
              </h2>
              <p
                id="clients-empty-description"
                className="text-sm sm:text-base text-slate-600 leading-relaxed"
              >
                Os clientes e produtores rurais vinculados a esta organização serão apresentados aqui.
              </p>
            </div>

            {canCreate && (
              <div className="pt-2">
                <Button
                  id="btn-create-first-client"
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleCreateClick}
                  className="inline-flex items-center gap-2 font-semibold cursor-pointer min-h-[44px]"
                >
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  <span>Cadastrar primeiro produtor</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ESTADO: Pronto com Registros */}
        {!isLoading && status === 'ready' && clients.length > 0 && (
          <div
            id="clients-list-container"
            className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
          >
            <div className="divide-y divide-slate-100">
              {clients.map((client) => {
                const isIndividual = client.personType === 'individual';
                const clientName = isIndividual ? client.name : client.companyName;
                const tradeName = isIndividual ? undefined : client.tradeName;
                const documentMasked = isIndividual
                  ? maskCpf(client.cpf)
                  : maskCnpj(client.cnpj);
                const phoneFormatted = formatPhone(client.contact.primaryPhone);

                return (
                  <div
                    key={client.id}
                    id={`client-item-${client.id}`}
                    className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-slate-900 text-base truncate">
                          {clientName}
                        </span>
                        {tradeName && (
                          <span className="text-xs text-slate-500 font-medium truncate max-w-[200px]">
                            ({tradeName})
                          </span>
                        )}
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium border border-slate-200">
                          {isIndividual ? 'Pessoa Física' : 'Pessoa Jurídica'}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            client.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {client.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs sm:text-sm text-slate-600 flex-wrap">
                        <span className="font-mono text-slate-700">
                          Doc: {documentMasked}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                          <span>
                            {client.address.city} - {client.address.state}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                          <span>{phoneFormatted}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {canAccessEvidence && (
                        <Button
                          id={`btn-evidence-client-${client.id}`}
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(getClientEvidencePath(client.id))}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 cursor-pointer text-[#0B3D2E] hover:bg-[#78C89A]/15 border-[#0B3D2E]/20 min-h-[40px]"
                          title="Abrir fotos e geolocalização dos imóveis deste cliente"
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#0B3D2E]" aria-hidden="true" />
                          <span>Fotos e localização</span>
                        </Button>
                      )}

                      {canManageAssignments && (
                        <Button
                          id={`btn-capturer-client-${client.id}`}
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setAssignmentClient({
                              id: client.id,
                              name: isIndividual ? client.name : client.companyName,
                            })
                          }
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 cursor-pointer text-[#0B3D2E] hover:bg-[#0B3D2E]/10 border-[#0B3D2E]/20 min-h-[40px]"
                          title="Gerenciar Captador Vinculado"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-[#0B3D2E]" aria-hidden="true" />
                          <span>Captador</span>
                        </Button>
                      )}

                      {canEdit && (
                        <Button
                          id={`btn-edit-client-${client.id}`}
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleEditClick(client.id)}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900 min-h-[40px]"
                        >
                          <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Editar</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rodapé com Paginação e Seletor de Tamanho */}
            <div
              id="clients-pagination-footer"
              className="p-4 sm:p-6 bg-slate-50/70 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4"
            >
              {/* Seletor de itens por página */}
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600">
                <label
                  htmlFor="client-page-size-select"
                  className="shrink-0 font-medium"
                >
                  Itens por página:
                </label>
                <select
                  id="client-page-size-select"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-700 focus-visible:ring-2 focus-visible:ring-[#0B3D2E] outline-hidden cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>

              {/* Controles de Navegação de Página */}
              {totalPages > 1 ? (
                <div
                  id="clients-pagination-controls"
                  className="flex items-center gap-1.5 sm:gap-2"
                >
                  <button
                    id="btn-pagination-first"
                    type="button"
                    onClick={() => setPage(1)}
                    disabled={page <= 1 || isLoading}
                    className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#0B3D2E] outline-hidden"
                    title="Primeira página"
                    aria-label="Primeira página"
                  >
                    <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    id="btn-pagination-prev"
                    type="button"
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1 || isLoading}
                    className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#0B3D2E] outline-hidden"
                    title="Página anterior"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                  </button>

                  <span
                    id="pagination-page-indicator"
                    className="px-3 py-1 text-xs sm:text-sm font-semibold text-slate-800"
                  >
                    Página {page} de {totalPages}
                  </span>

                  <button
                    id="btn-pagination-next"
                    type="button"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages || isLoading}
                    className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#0B3D2E] outline-hidden"
                    title="Próxima página"
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    id="btn-pagination-last"
                    type="button"
                    onClick={() => setPage(totalPages)}
                    disabled={page >= totalPages || isLoading}
                    className="p-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#0B3D2E] outline-hidden"
                    title="Última página"
                    aria-label="Última página"
                  >
                    <ChevronsRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-500 font-medium">
                  Página 1 de 1
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {assignmentClient && (
        <ClientCapturerAssignmentModal
          isOpen={!!assignmentClient}
          onClose={() => setAssignmentClient(null)}
          clientId={assignmentClient.id}
          clientName={assignmentClient.name}
          onAssignmentChanged={() => refresh()}
        />
      )}
    </div>
  );
}

