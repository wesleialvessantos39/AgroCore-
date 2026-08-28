import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Building2, AlertCircle, RefreshCw, Sparkles, Compass } from 'lucide-react';
import { ROUTES, getPropertyGeometryPath } from '../routes/paths';
import { usePropertiesContext } from '../properties/PropertiesContext';
import { useOrganization } from '../organization/useOrganization';
import { useAuthorization } from '../authorization/useAuthorization';
import { PropertyForm } from '../properties/components/PropertyForm';
import { PROPERTY_THEME } from '../properties/theme';
import { Property, PropertyFormValues } from '../types/property';
import { propertyToFormValues, formValuesToUpdateInput } from '../properties/validators';

export function PropertyEditPage() {
  const { id: routeId, propertyId: paramPropertyId } = useParams<{ id?: string; propertyId?: string }>();
  const id = paramPropertyId || routeId;
  const navigate = useNavigate();
  const {
    getPropertyById,
    updateProperty,
  } = usePropertiesContext();

  const { activeOrganization } = useOrganization();
  const { can } = useAuthorization();
  const canViewGeometry = can('properties:geospatial:view');

  const [currentProperty, setCurrentProperty] = useState<Property | null>(null);
  const [isLoadingProperty, setIsLoadingProperty] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchProperty = async (propertyId: string) => {
    setIsLoadingProperty(true);
    setLoadError(null);
    try {
      const prop = await getPropertyById(propertyId);
      if (prop) {
        setCurrentProperty(prop);
      } else {
        setCurrentProperty(null);
        setLoadError('Imóvel não encontrado.');
      }
    } catch {
      setLoadError('Ocorreu um erro ao carregar as informações do imóvel.');
    } finally {
      setIsLoadingProperty(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchProperty(id);
    }
  }, [id]);

  const handleEditSubmit = async (values: PropertyFormValues) => {
    if (!id) {
      return { success: false, error: 'Identificador do imóvel inválido.' };
    }
    const input = formValuesToUpdateInput(values);
    const result = await updateProperty(id, input);
    if (result.success) {
      navigate(ROUTES.PROPERTIES);
    }
    return result;
  };

  if (isLoadingProperty) {
    return (
      <div className="bg-white rounded-2xl border border-[#0B3D2E]/15 p-12 text-center shadow-xs flex flex-col items-center justify-center min-h-[300px] max-w-5xl mx-auto">
        <div className="w-10 h-10 border-3 border-[#0B3D2E]/20 border-t-[#0B3D2E] rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-[#0B3D2E]">
          Carregando informações do imóvel...
        </p>
      </div>
    );
  }

  if (!currentProperty || loadError) {
    return (
      <div className="bg-white rounded-2xl border border-rose-300 p-8 md:p-12 text-center shadow-xs max-w-2xl mx-auto space-y-4">
        <div className="w-12 h-12 bg-rose-50 text-rose-700 rounded-xl flex items-center justify-center mx-auto border border-rose-200">
          <AlertCircle className="w-6 h-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-[#0B3D2E]">
          Imóvel não encontrado
        </h2>
        <p className="text-sm text-[#0B3D2E]/70">
          {loadError || 'O imóvel solicitado não foi localizado nesta organização ou pode ter sido removido.'}
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => id && fetchProperty(id)}
            className={PROPERTY_THEME.btnSecondary}
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => navigate(ROUTES.PROPERTIES)}
            className={PROPERTY_THEME.btnPrimary}
          >
            Voltar para lista
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="property-edit-page"
      className="space-y-6 max-w-5xl mx-auto pb-12"
      style={{
        paddingTop: 'var(--sat, 0px)',
        paddingLeft: 'var(--sal, 0px)',
        paddingRight: 'var(--sar, 0px)',
      }}
    >
      {/* Aviso de Desenvolvimento em DEV */}
      {import.meta.env.DEV && (
        <div className="p-3.5 bg-white border border-[#78C89A]/40 rounded-xl flex items-center gap-3 text-xs text-[#0B3D2E] shadow-2xs">
          <Sparkles className="w-4 h-4 text-[#0B3D2E] shrink-0" />
          <p>
            <strong className="font-semibold text-[#0B3D2E]">Ambiente de acompanhamento:</strong> As alterações cadastrais serão atualizadas na memória desta sessão.
          </p>
        </div>
      )}

      {/* Cabeçalho da Edição */}
      <header className="bg-white rounded-2xl border border-[#0B3D2E]/15 p-6 md:p-8 shadow-xs">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <button
              type="button"
              onClick={() => navigate(ROUTES.PROPERTIES)}
              className={PROPERTY_THEME.btnSecondarySmall}
              aria-label="Voltar para listagem de imóveis"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para Imóveis</span>
            </button>

            {activeOrganization && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#78C89A]/15 text-[#0B3D2E] border border-[#78C89A]/30">
                <Building2 className="w-3.5 h-3.5 text-[#0B3D2E]" aria-hidden="true" />
                <span className="truncate max-w-[240px]">{activeOrganization.name}</span>
              </span>
            )}
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-[#0B3D2E]/10 text-[#0B3D2E] border border-[#0B3D2E]/20 mb-2">
                <MapPin className="w-3.5 h-3.5" />
                Módulo 003 • Edição Territorial
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#0B3D2E] tracking-tight">
                Editar: {currentProperty.name}
              </h1>
              <p className="text-sm sm:text-base text-[#0B3D2E]/70 max-w-2xl">
                Atualize as informações territoriais, dados cadastrais (SNCR/CIB), matrículas e vínculos com clientes.
              </p>
            </div>

            {canViewGeometry && id && (
              <div className="shrink-0">
                <Link
                  to={getPropertyGeometryPath(id)}
                  className={PROPERTY_THEME.btnSecondary}
                >
                  <Compass className="w-4 h-4 text-[#0B3D2E]" />
                  <span>Georreferenciamento</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Formulário Principal de Edição */}
      <main>
        <PropertyForm
          mode="edit"
          initialData={propertyToFormValues(currentProperty)}
          onSubmit={handleEditSubmit}
          onCancel={() => navigate(ROUTES.PROPERTIES)}
        />
      </main>
    </div>
  );
}

export default PropertyEditPage;
