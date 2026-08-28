import {
  PropertyGateway,
  PropertyListPage,
  PropertyListQuery,
  PropertySummary,
  Property,
  RuralProperty,
  UrbanProperty,
  CreatePropertyInput,
  UpdatePropertyInput,
  UpdateRuralPropertyInput,
  UpdateUrbanPropertyInput,
  PropertyMutationResult,
} from '../../types/property';
import {
  formatArea,
  maskCib,
  maskSncr,
  normalizeCib,
  normalizeDigits,
  normalizeSncr,
  normalizeText,
} from '../validators';

/**
 * PreviewPropertyGateway
 *
 * Implementação volátil em memória para desenvolvimento e testes funcionais (DEV).
 * Não carrega nenhum dado fictício (inicia estritamente vazio).
 * Garante isolamento rigoroso por organização e é excluído do bundle de produção.
 */
export class PreviewPropertyGateway implements PropertyGateway {
  private readonly storageByOrg = new Map<string, Property[]>();

  /**
   * Limpa integralmente a memória volátil (utilizado no logout ou reinício de sessão).
   * Implementa o contrato canônico clearAllSessionData().
   */
  clearAllSessionData(): void {
    this.storageByOrg.clear();
  }

  /**
   * Alias de compatibilidade para clearAllSessionData.
   */
  clearTemporaryData(): void {
    this.clearAllSessionData();
  }

  private getOrgList(organizationId: string): Property[] {
    let list = this.storageByOrg.get(organizationId);
    if (!list) {
      list = [];
      this.storageByOrg.set(organizationId, list);
    }
    return list;
  }

  /**
   * Converte a entidade completa em resumo tipado para listagens e cartões
   */
  private toSummary(property: Property): PropertySummary {
    const primaryLink = property.clientLinks.find((l) => l.isPrimaryHolder) || property.clientLinks[0];
    const mainRelationship = primaryLink?.relationship || 'owner';

    let totalAreaFormatted = '';
    let cib: string | undefined;
    let sncr: string | undefined;

    if (property.propertyType === 'rural') {
      const r = property as RuralProperty;
      totalAreaFormatted = formatArea(r.areas.totalDeclaredAreaHa, 'ha');
      cib = r.identifiers.cib;
      sncr = r.identifiers.sncrIncraCode;
    } else {
      const u = property as UrbanProperty;
      totalAreaFormatted = formatArea(u.areas.landAreaM2, 'm²');
      cib = u.identifiers.cib;
    }

    return {
      id: property.id,
      organizationId: property.organizationId,
      propertyType: property.propertyType,
      urbanType: property.propertyType === 'urban' ? (property as UrbanProperty).urbanType : undefined,
      name: property.name,
      city: property.location.city,
      state: property.location.state,
      status: property.status,
      totalAreaFormatted,
      primaryClientId: primaryLink?.clientId,
      clientLinksCount: property.clientLinks.length,
      clientLinks: property.clientLinks,
      mainRelationship,
      cibMasked: cib ? maskCib(cib) : undefined,
      sncrMasked: sncr ? maskSncr(sncr) : undefined,
      registrationsCount: property.registrations.length,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
    };
  }

  /**
   * Verifica conflitos de duplicidade dentro da mesma organização
   */
  private checkConflict(
    organizationId: string,
    propertyType: 'rural' | 'urban',
    input: CreatePropertyInput | (UpdatePropertyInput & { organizationId?: string }),
    currentPropertyId?: string
  ): { hasConflict: boolean; field?: 'cib' | 'sncr' | 'registration' | 'municipalRegistration' } {
    const list = this.getOrgList(organizationId);

    const inputCib = input.identifiers?.cib ? normalizeCib(input.identifiers.cib) : '';
    const inputSncr =
      propertyType === 'rural' && 'sncrIncraCode' in (input.identifiers || {})
        ? normalizeSncr((input.identifiers as { sncrIncraCode?: string }).sncrIncraCode)
        : '';
    const inputMunicipal =
      propertyType === 'urban' && 'municipalRegistration' in (input.identifiers || {})
        ? normalizeText((input.identifiers as { municipalRegistration?: string }).municipalRegistration).toLowerCase()
        : '';

    // Novos registros cartorarios normalizados
    const inputRegKeys = (input.registrations || []).map((r) =>
      `${normalizeText(r.registrationNumber).toLowerCase()}|${normalizeText(r.registryOffice).toLowerCase()}|${normalizeText(r.district).toLowerCase()}`
    );

    for (const item of list) {
      if (currentPropertyId && item.id === currentPropertyId) {
        continue; // Ignora o proprio imovel na edicao
      }

      // 1. Conflito por CIB
      if (inputCib && item.identifiers?.cib && normalizeCib(item.identifiers.cib) === inputCib) {
        return { hasConflict: true, field: 'cib' };
      }

      // 2. Conflito por SNCR (Rural)
      if (
        propertyType === 'rural' &&
        inputSncr &&
        item.propertyType === 'rural' &&
        item.identifiers?.sncrIncraCode &&
        normalizeSncr(item.identifiers.sncrIncraCode) === inputSncr
      ) {
        return { hasConflict: true, field: 'sncr' };
      }

      // 3. Conflito por Inscricao Municipal (Urbano)
      if (
        propertyType === 'urban' &&
        inputMunicipal &&
        item.propertyType === 'urban' &&
        item.identifiers?.municipalRegistration &&
        normalizeText(item.identifiers.municipalRegistration).toLowerCase() === inputMunicipal
      ) {
        return { hasConflict: true, field: 'municipalRegistration' };
      }

      // 4. Conflito por Registro Cartorario + Cartorio + Comarca
      for (const reg of item.registrations) {
        const itemKey = `${normalizeText(reg.registrationNumber).toLowerCase()}|${normalizeText(reg.registryOffice).toLowerCase()}|${normalizeText(reg.district).toLowerCase()}`;
        if (inputRegKeys.includes(itemKey)) {
          return { hasConflict: true, field: 'registration' };
        }
      }
    }

    return { hasConflict: false };
  }

  async listProperties(
    query: PropertyListQuery,
    signal?: AbortSignal
  ): Promise<PropertyListPage> {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const { organizationId, searchTerm, propertyType, status, clientId, page, pageSize } = query;

    if (!organizationId) {
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: pageSize || 10,
        totalPages: 1,
      };
    }

    const list = this.getOrgList(organizationId);

    const filtered = list.filter((prop) => {
      if (propertyType && propertyType !== 'all' && prop.propertyType !== propertyType) {
        return false;
      }
      if (status && status !== 'all' && prop.status !== status) {
        return false;
      }
      if (clientId && !prop.clientLinks.some((l) => l.clientId === clientId)) {
        return false;
      }
      if (searchTerm && searchTerm.trim().length > 0) {
        const term = searchTerm.trim().toLowerCase();
        const matchesName = prop.name.toLowerCase().includes(term);
        const matchesCity = prop.location.city.toLowerCase().includes(term);
        const matchesState = prop.location.state.toLowerCase().includes(term);
        const matchesCib = prop.identifiers.cib
          ? normalizeCib(prop.identifiers.cib).toLowerCase().includes(term)
          : false;
        if (!matchesName && !matchesCity && !matchesState && !matchesCib) {
          return false;
        }
      }
      return true;
    });

    const total = filtered.length;
    const safePageSize = Math.max(1, pageSize || 10);
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const safePage = Math.min(Math.max(1, page || 1), totalPages);

    const startIndex = (safePage - 1) * safePageSize;
    const pageItems = filtered.slice(startIndex, startIndex + safePageSize);
    const items = pageItems.map((p) => this.toSummary(p));

    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
    };
  }

  async getPropertyById(
    organizationId: string,
    propertyId: string
  ): Promise<Property | null> {
    if (!organizationId || !propertyId) {
      return null;
    }
    const list = this.getOrgList(organizationId);
    const item = list.find((p) => p.id === propertyId && p.organizationId === organizationId);
    return item || null;
  }

  async createProperty(
    input: CreatePropertyInput
  ): Promise<PropertyMutationResult> {
    const { organizationId, propertyType } = input;

    if (!organizationId) {
      return {
        success: false,
        error: 'Organização não informada.',
      };
    }

    // Validação de duplicidade
    const conflict = this.checkConflict(organizationId, propertyType, input);
    if (conflict.hasConflict && conflict.field) {
      return {
        success: false,
        error: 'Já existe um imóvel com esta identificação nesta organização.',
        conflict: {
          field: conflict.field,
          message: 'Já existe um imóvel com esta identificação nesta organização.',
        },
      };
    }

    const now = new Date().toISOString();
    const id = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    let newProperty: Property;

    if (propertyType === 'rural') {
      newProperty = {
        id,
        organizationId,
        propertyType: 'rural',
        name: input.name,
        status: input.status || 'active',
        location: input.location,
        areas: input.areas,
        identifiers: input.identifiers,
        registrations: input.registrations || [],
        clientLinks: input.clientLinks || [],
        referenceCoordinate: input.referenceCoordinate,
        boundaries: input.boundaries || [],
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      newProperty = {
        id,
        organizationId,
        propertyType: 'urban',
        urbanType: input.urbanType,
        otherUrbanTypeDescription: input.otherUrbanTypeDescription,
        name: input.name,
        status: input.status || 'active',
        location: input.location,
        areas: input.areas,
        identifiers: input.identifiers,
        registrations: input.registrations || [],
        clientLinks: input.clientLinks || [],
        referenceCoordinate: input.referenceCoordinate,
        boundaries: input.boundaries || [],
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
    }

    const list = this.getOrgList(organizationId);
    list.unshift(newProperty);

    return {
      success: true,
      property: newProperty,
    };
  }

  async updateProperty(
    propertyId: string,
    input: UpdatePropertyInput
  ): Promise<PropertyMutationResult> {
    if (!propertyId) {
      return {
        success: false,
        error: 'Identificador do imóvel não informado.',
      };
    }

    // Localiza o imóvel pelo ID em todas as organizações para garantir integridade
    let targetOrgId: string | null = null;
    let existingProperty: Property | null = null;
    let targetIndex = -1;

    for (const [orgId, orgProperties] of this.storageByOrg.entries()) {
      const idx = orgProperties.findIndex((p) => p.id === propertyId);
      if (idx !== -1) {
        targetOrgId = orgId;
        existingProperty = orgProperties[idx];
        targetIndex = idx;
        break;
      }
    }

    if (!targetOrgId || !existingProperty || targetIndex === -1) {
      return {
        success: false,
        error: 'Imóvel não encontrado.',
      };
    }

    // O tipo de imóvel e o organizationId são estritamente imutáveis
    const propertyType = existingProperty.propertyType;

    // Validação de duplicidade ignorando o próprio ID
    const conflict = this.checkConflict(targetOrgId, propertyType, input, propertyId);
    if (conflict.hasConflict && conflict.field) {
      return {
        success: false,
        error: 'Já existe um imóvel com esta identificação nesta organização.',
        conflict: {
          field: conflict.field,
          message: 'Já existe um imóvel com esta identificação nesta organização.',
        },
      };
    }

    const now = new Date().toISOString();
    let updatedProperty: Property;

    if (propertyType === 'rural') {
      const ruralInput = input as UpdateRuralPropertyInput;
      updatedProperty = {
        id: existingProperty.id,
        organizationId: existingProperty.organizationId,
        propertyType: 'rural',
        name: ruralInput.name,
        status: ruralInput.status || existingProperty.status,
        location: ruralInput.location,
        areas: ruralInput.areas,
        identifiers: ruralInput.identifiers,
        registrations: ruralInput.registrations || [],
        clientLinks: ruralInput.clientLinks || [],
        referenceCoordinate: ruralInput.referenceCoordinate,
        boundaries: ruralInput.boundaries || [],
        notes: ruralInput.notes,
        createdAt: existingProperty.createdAt, // Preservado
        updatedAt: now, // Atualizado
      };
    } else {
      const urbanInput = input as UpdateUrbanPropertyInput;
      updatedProperty = {
        id: existingProperty.id,
        organizationId: existingProperty.organizationId,
        propertyType: 'urban',
        urbanType: urbanInput.urbanType,
        otherUrbanTypeDescription: urbanInput.otherUrbanTypeDescription,
        name: urbanInput.name,
        status: urbanInput.status || existingProperty.status,
        location: urbanInput.location,
        areas: urbanInput.areas,
        identifiers: urbanInput.identifiers,
        registrations: urbanInput.registrations || [],
        clientLinks: urbanInput.clientLinks || [],
        referenceCoordinate: urbanInput.referenceCoordinate,
        boundaries: urbanInput.boundaries || [],
        notes: urbanInput.notes,
        createdAt: existingProperty.createdAt, // Preservado
        updatedAt: now, // Atualizado
      };
    }

    const list = this.getOrgList(targetOrgId);
    list[targetIndex] = updatedProperty;

    return {
      success: true,
      property: updatedProperty,
    };
  }
}
