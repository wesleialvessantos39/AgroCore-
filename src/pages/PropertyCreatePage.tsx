import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Building2, Sparkles } from 'lucide-react';
import { ROUTES, getClientEvidencePath } from '../routes/paths';
import { usePropertiesContext } from '../properties/PropertiesContext';
import { useOrganization } from '../organization/useOrganization';
import { PropertyForm } from '../properties/components/PropertyForm';
import { PROPERTY_THEME } from '../properties/theme';
import { PropertyFormValues } from '../types/property';
import {
  formValuesToCreateInput,
  getDefaultPropertyFormValues,
} from '../properties/validators';
import { getClientRegistryRequestGateway } from '../clients/clientRegistryRequestGatewayFactory';
import { useFieldVisits } from '../fieldVisits/useFieldVisits';

export function PropertyCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { createProperty } = usePropertiesContext();
  const { activeOrganization } = useOrganization();
  const fieldVisits = useFieldVisits();

  const clientId = searchParams.get('clientId') || '';
  const registryRequestId = searchParams.get('registryRequestId') || '';
  const returnTo = searchParams.get('returnTo') || '';
  const sourceType = searchParams.get('sourceType') || '';
  const sourceId = searchParams.get('sourceId') || '';

  const initialValues = useMemo<PropertyFormValues | undefined>(() => {
    if (!clientId) return undefined;
    const values = getDefaultPropertyFormValues('rural');
    values.clientLinks = [
      {
        clientId,
        relationship: 'owner',
        otherRelationshipDescription: '',
        isPrimaryHolder: true,
        declaredParticipationPercentage: '100',
        observation: '',
      },
    ];
    return values;
  }, [clientId]);

  const handleCreateSubmit = async (values: PropertyFormValues) => {
    if (!activeOrganization?.id) {
      return { success: false, error: 'Nenhuma organização ativa selecionada.' };
    }
    const input = formValuesToCreateInput(values, activeOrganization.id);
    const result = await createProperty(input);
    if (result.success) {
      if (registryRequestId && clientId) {
        try {
          await getClientRegistryRequestGateway().attachProperty(
            activeOrganization.id,
            registryRequestId,
            result.property.id
          );
          navigate(
            getClientEvidencePath(
              clientId,
              result.property.id,
              registryRequestId
            )
          );
          return result;
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'O imóvel foi cadastrado, mas não foi possível vinculá-lo à solicitação.',
          };
        }
      }

      if (sourceType === 'visit' && sourceId) {
        try {
          const visit = await fieldVisits.getVisitById(sourceId);
          if (visit) {
            await fieldVisits.updateVisit(sourceId, {
              propertyId: result.property.id,
              expectedVersion: visit.version,
              changeReason:
                'Imóvel cadastrado a partir da pendência de fotos e geolocalização.',
            });
          }
        } catch {
          // O imóvel permanece corretamente vinculado ao cliente; o retorno
          // permitirá ao projetista revisar o vínculo da visita.
        }
      }

      navigate(returnTo || ROUTES.PROPERTIES);
    }
    return result;
  };

  return (
    <div
      id="property-create-page"
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
            <strong className="font-semibold text-[#0B3D2E]">Ambiente de acompanhamento:</strong> Os novos dados territoriais serão salvos na memória desta sessão de desenvolvimento.
          </p>
        </div>
      )}

      {/* Cabeçalho da Criação */}
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

          <div className="pt-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-[#0B3D2E]/10 text-[#0B3D2E] border border-[#0B3D2E]/20 mb-2">
              <MapPin className="w-3.5 h-3.5" />
              Módulo 003 • Novo Cadastro
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0B3D2E] tracking-tight">
              Cadastrar Imóvel
            </h1>
            <p className="text-sm sm:text-base text-[#0B3D2E]/70 max-w-2xl">
              Informe a identificação territorial, dados cadastrais (SNCR/CIB), matrículas cartorárias e vincule clientes responsáveis.
            </p>
          </div>
        </div>
      </header>

      {/* Formulário Principal de Cadastro */}
      <main>
        <PropertyForm
          mode="create"
          initialValues={initialValues}
          onSubmit={handleCreateSubmit}
          onCancel={() => navigate(ROUTES.PROPERTIES)}
        />
      </main>
    </div>
  );
}

export default PropertyCreatePage;
