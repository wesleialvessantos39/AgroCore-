import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Building2,
  TreePine,
  Building,
  AlertCircle,
  CloudOff,
  RefreshCw,
  Plus,
  Search,
  Users,
  FileText,
  Edit3,
  X,
  Sparkles,
  Compass,
} from 'lucide-react';
import { usePropertiesContext } from '../properties/PropertiesContext';
import { useOrganization } from '../organization/useOrganization';
import { useAuthorization } from '../authorization/useAuthorization';
import { ROUTES, getPropertyEditPath, getPropertyGeometryPath } from '../routes/paths';
import { PROPERTY_RELATIONSHIP_LABELS } from '../types/property';
import { PROPERTY_THEME } from '../properties/theme';

export function PropertiesPage() {
  const navigate = useNavigate();
  const {
    status,
    properties,
    totalCount,
    page,
    totalPages,
    filters,
    isLoading,
    errorMessage,
    reload,
    setFilters,
    setPage,
  } = usePropertiesContext();

  const { activeOrganization } = useOrganization();
  const { can } = useAuthorization();

  const canCreate = can('properties:create');
  const canEdit = can('properties:edit');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ search: e.target.value });
  };

  const handleTypeFilter = (propertyType: 'all' | 'rural' | 'urban') => {
    setFilters({ propertyType });
  };

  const handleStatusFilter = (propertyStatus: 'all' | 'active' | 'inactive') => {
    setFilters({ status: propertyStatus });
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      propertyType: 'all',
      status: 'all',
    });
  };

  const isFiltered =
    !!filters.search || filters.propertyType !== 'all' || filters.status !== 'all';

  return (
    <div
      id="agrocore-properties-page"
      className="space-y-6 max-w-7xl mx-auto pb-12"
      style={{
        paddingTop: 'var(--sat, 0px)',
        paddingLeft: 'var(--sal, 0px)',
        paddingRight: 'var(--sar, 0px)',
      }}
    >
      {/* Aviso de Desenvolvimento (visível estritamente em DEV com paleta institucional) */}
      {import.meta.env.DEV && (
        <div className="p-3.5 bg-white border border-[#78C89A]/40 rounded-xl flex items-center gap-3 text-xs text-[#0B3D2E] shadow-2xs">
          <Sparkles className="w-4 h-4 text-[#0B3D2E] shrink-0" />
          <p>
            <strong className="font-semibold text-[#0B3D2E]">Ambiente de acompanhamento:</strong> Não insira dados pessoais, cadastrais ou fundiários reais. Os registros de imóveis são temporários e mantidos em memória.
          </p>
        </div>
      )}

      {/* 1. Cabeçalho Contextual da Página */}
      <header
        id="properties-page-header"
        className="bg-white rounded-2xl border border-[#0B3D2E]/15 p-6 md:p-8 shadow-xs transition-all"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#0B3D2E]/10 text-[#0B3D2E] border border-[#0B3D2E]/20">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                Módulo 003 • Gestão de Imóveis
              </span>

              {activeOrganization && (
                <span
                  id="properties-header-org-badge"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#78C89A]/15 text-[#0B3D2E] border border-[#78C89A]/30"
                >
                  <Building2 className="w-3.5 h-3.5 text-[#0B3D2E]" aria-hidden="true" />
                  <span className="truncate max-w-[200px] sm:max-w-[320px]">{activeOrganization.name}</span>
                </span>
              )}
            </div>

            <h1
              id="properties-page-title"
              className="text-2xl sm:text-3xl font-bold text-[#0B3D2E] tracking-tight"
            >
              Imóveis Rurais e Urbanos
            </h1>

            <p
              id="properties-page-subtitle"
              className="text-sm sm:text-base text-[#0B3D2E]/70 max-w-3xl"
            >
              Organização territorial, cadastral e fundiária dos imóveis vinculados aos clientes e produtores.
            </p>
          </div>

          {canCreate && (
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => navigate(ROUTES.PROPERTIES_NEW)}
                className={PROPERTY_THEME.btnPrimary}
                aria-label="Cadastrar novo imóvel rural ou urbano"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Imóvel</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. Filtros e Pesquisa */}
      <section className="bg-white rounded-2xl border border-[#0B3D2E]/15 p-4 md:p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Busca por termo */}
          <div className="md:col-span-6 relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#0B3D2E]/40">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={filters.search}
              onChange={handleSearchChange}
              placeholder="Pesquisar por nome, município, UF ou CIB..."
              className="w-full pl-9.5 pr-8 py-2.5 text-sm bg-white border border-[#0B3D2E]/20 rounded-xl text-[#0B3D2E] placeholder-[#0B3D2E]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => setFilters({ search: '' })}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#0B3D2E]/50 hover:text-[#0B3D2E]"
                aria-label="Limpar busca de imóveis"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filtro por Tipo */}
          <div className="md:col-span-3">
            <select
              value={filters.propertyType}
              onChange={(e) => handleTypeFilter(e.target.value as 'all' | 'rural' | 'urban')}
              className="w-full px-3 py-2.5 text-sm bg-white border border-[#0B3D2E]/20 rounded-xl text-[#0B3D2E] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors cursor-pointer"
              aria-label="Filtrar por classificação territorial"
            >
              <option value="all">Todos os tipos (Rural/Urbano)</option>
              <option value="rural">Apenas Imóveis Rurais</option>
              <option value="urban">Apenas Imóveis Urbanos</option>
            </select>
          </div>

          {/* Filtro por Situação */}
          <div className="md:col-span-3">
            <select
              value={filters.status}
              onChange={(e) => handleStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="w-full px-3 py-2.5 text-sm bg-white border border-[#0B3D2E]/20 rounded-xl text-[#0B3D2E] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors cursor-pointer"
              aria-label="Filtrar por situação cadastral"
            >
              <option value="all">Todas as situações</option>
              <option value="active">Apenas Ativos</option>
              <option value="inactive">Apenas Inativos</option>
            </select>
          </div>
        </div>

        {isFiltered && (
          <div className="flex items-center justify-between pt-2 border-t border-[#0B3D2E]/10 text-xs text-[#0B3D2E]/70">
            <span>
              Filtros ativos • {totalCount} {totalCount === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}
            </span>
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-[#0B3D2E] hover:underline font-semibold cursor-pointer"
            >
              Limpar todos os filtros
            </button>
          </div>
        )}
      </section>

      {/* 3. Área Central de Resultados e Estados */}
      <main id="properties-main-content" className="relative" aria-live="polite">
        {/* ESTADO: Carregando */}
        {isLoading && (
          <div
            id="properties-loading-state"
            aria-busy="true"
            className="bg-white rounded-2xl border border-[#0B3D2E]/15 p-12 text-center shadow-xs flex flex-col items-center justify-center min-h-[300px]"
          >
            <div className="w-10 h-10 border-3 border-[#0B3D2E]/20 border-t-[#0B3D2E] rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-[#0B3D2E]">
              Consultando imóveis da organização...
            </p>
          </div>
        )}

        {/* ESTADO: Indisponível */}
        {!isLoading && status === 'unavailable' && (
          <div
            id="properties-unavailable-state"
            className="bg-white rounded-2xl border border-amber-300 p-8 md:p-12 text-center shadow-xs max-w-2xl mx-auto space-y-4"
          >
            <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-xl flex items-center justify-center mx-auto border border-amber-200">
              <CloudOff className="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-[#0B3D2E]">
              Serviço temporariamente indisponível
            </h2>
            <p className="text-sm text-[#0B3D2E]/70">
              {errorMessage || 'Não foi possível estabelecer conexão com o serviço de imóveis no momento.'}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => reload()}
                className={PROPERTY_THEME.btnSecondary}
              >
                <RefreshCw className="w-4 h-4" />
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {/* ESTADO: Erro de Carregamento */}
        {!isLoading && status === 'error' && (
          <div
            id="properties-error-state"
            className="bg-white rounded-2xl border border-rose-300 p-8 md:p-12 text-center shadow-xs max-w-2xl mx-auto space-y-4"
          >
            <div className="w-12 h-12 bg-rose-50 text-rose-700 rounded-xl flex items-center justify-center mx-auto border border-rose-200">
              <AlertCircle className="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-[#0B3D2E]">
              Não foi possível carregar os imóveis
            </h2>
            <p className="text-sm text-[#0B3D2E]/70">
              {errorMessage || 'Ocorreu um problema ao consultar as informações territoriais da empresa.'}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => reload()}
                className={PROPERTY_THEME.btnSecondary}
              >
                <RefreshCw className="w-4 h-4" />
                Recarregar informações
              </button>
            </div>
          </div>
        )}

        {/* ESTADO: Lista Vazia Real (Nenhum imóvel ou nenhum resultado de filtro) */}
        {!isLoading && (status === 'empty' || (status === 'ready' && properties.length === 0)) && (
          <div
            id="properties-empty-state"
            className="bg-white rounded-2xl border border-[#0B3D2E]/15 p-12 text-center shadow-xs space-y-4"
          >
            <div className="w-14 h-14 bg-[#78C89A]/15 text-[#0B3D2E] rounded-2xl flex items-center justify-center mx-auto border border-[#78C89A]/30">
              <MapPin className="w-7 h-7 text-[#0B3D2E]" aria-hidden="true" />
            </div>
            <div>
              <h2 id="properties-empty-title" className="text-lg font-semibold text-[#0B3D2E] mb-1">
                {isFiltered ? 'Nenhum imóvel encontrado' : 'Nenhum imóvel cadastrado'}
              </h2>
              <p id="properties-empty-desc" className="text-sm text-[#0B3D2E]/70 max-w-md mx-auto">
                {isFiltered
                  ? 'Nenhum imóvel corresponde aos critérios de pesquisa aplicados.'
                  : 'Os imóveis rurais e urbanos vinculados aos clientes desta organização serão apresentados aqui.'}
              </p>
            </div>

            <div className="pt-2">
              {isFiltered ? (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className={PROPERTY_THEME.btnSecondary}
                >
                  Limpar filtros de busca
                </button>
              ) : (
                canCreate && (
                  <button
                    type="button"
                    onClick={() => navigate(ROUTES.PROPERTIES_NEW)}
                    className={PROPERTY_THEME.btnPrimary}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Cadastrar Primeiro Imóvel</span>
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* ESTADO: Lista com Imóveis Cadastrados */}
        {!isLoading && status === 'ready' && properties.length > 0 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {properties.map((property) => {
                const isRural = property.propertyType === 'rural';

                return (
                  <div
                    key={property.id}
                    className="bg-white rounded-2xl border border-[#0B3D2E]/15 p-5 shadow-xs hover:shadow-md hover:border-[#0B3D2E]/40 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3.5">
                      {/* Cabeçalho do Cartão: Badges e Situação */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#78C89A]/15 text-[#0B3D2E] border border-[#78C89A]/30">
                          {isRural ? <TreePine className="w-3.5 h-3.5 text-[#0B3D2E]" /> : <Building className="w-3.5 h-3.5 text-[#0B3D2E]" />}
                          <span>{isRural ? 'Rural' : 'Urbano'}</span>
                        </span>

                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            property.status === 'active'
                              ? 'bg-[#78C89A]/20 text-[#0B3D2E] border border-[#78C89A]/40'
                              : 'bg-[#0B3D2E]/10 text-[#0B3D2E]/70 border border-[#0B3D2E]/15'
                          }`}
                        >
                          {property.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>

                      {/* Nome e Município */}
                      <div>
                        <h3 className="text-base font-bold text-[#0B3D2E] line-clamp-1">
                          {property.name}
                        </h3>
                        <p className="text-xs text-[#0B3D2E]/70 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-[#0B3D2E] shrink-0" />
                          <span>
                            {property.city}/{property.state}
                          </span>
                        </p>
                      </div>

                      {/* Indicadores: Área e Cadastros */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#0B3D2E]/10 text-xs">
                        <div className="bg-[#78C89A]/10 p-2.5 rounded-xl border border-[#78C89A]/20">
                          <span className="text-[10px] uppercase font-semibold text-[#0B3D2E]/60 block">
                            Área Total
                          </span>
                          <span className="font-bold text-[#0B3D2E]">
                            {property.totalAreaFormatted || '—'}
                          </span>
                        </div>

                        <div className="bg-[#78C89A]/10 p-2.5 rounded-xl border border-[#78C89A]/20">
                          <span className="text-[10px] uppercase font-semibold text-[#0B3D2E]/60 block">
                            CIB
                          </span>
                          <span className="font-bold text-[#0B3D2E]">
                            {property.cibMasked || 'Não informado'}
                          </span>
                        </div>
                      </div>

                      {/* Vínculos com Clientes e Matrículas */}
                      <div className="space-y-1.5 pt-2 border-t border-[#0B3D2E]/10 text-xs text-[#0B3D2E]/70">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-[#0B3D2E]" />
                            <span>Vínculos: {property.clientLinksCount}</span>
                          </span>
                          {property.mainRelationship && (
                            <span className="text-[11px] text-[#0B3D2E]/60 font-medium">
                              {PROPERTY_RELATIONSHIP_LABELS[property.mainRelationship]}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-[#0B3D2E]" />
                            <span>Matrículas: {property.registrationsCount}</span>
                          </span>
                          {property.sncrMasked && (
                            <span className="text-[11px] text-[#0B3D2E]/60 font-medium">
                              SNCR: {property.sncrMasked}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Rodapé do Cartão: Ações */}
                    <div className="pt-4 mt-4 border-t border-[#0B3D2E]/10 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] text-[#0B3D2E]/60">
                        {property.updatedAt ? `Atualizado em ${new Date(property.updatedAt).toLocaleDateString('pt-BR')}` : ''}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => navigate(getPropertyGeometryPath(property.id))}
                          className={PROPERTY_THEME.btnSecondarySmall}
                          title="Ver e editar glebas e georreferenciamento interno"
                        >
                          <Compass className="w-3.5 h-3.5 text-[#0B3D2E]" />
                          <span>Glebas</span>
                        </button>

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => navigate(getPropertyEditPath(property.id))}
                            className={PROPERTY_THEME.btnSecondarySmall}
                            aria-label={`Editar imóvel ${property.name}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-[#0B3D2E]/15">
                <span className="text-xs text-[#0B3D2E]/70">
                  Página {page} de {totalPages} • Total de {totalCount} imóveis
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className={PROPERTY_THEME.btnSecondarySmall}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className={PROPERTY_THEME.btnSecondarySmall}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default PropertiesPage;
