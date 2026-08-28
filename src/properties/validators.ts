/**
 * Validadores e Normalizadores Puros — Módulo 003: Imóveis Rurais e Urbanos
 * OE-003.002: Validação Sintática, Estrutural e Regras de Negócio
 */

import {
  PropertyFormValues,
  RuralPropertyFormValues,
  UrbanPropertyFormValues,
  PropertyValidationErrors,
  CreatePropertyInput,
  UpdatePropertyInput,
  Property,
  RuralProperty,
  UrbanProperty,
  PropertySummary,
} from '../types/property';

/**
 * Normaliza termos e textos para comparação sem acento e sem espaços redundantes
 */
export function normalizeText(value?: string | null): string {
  if (!value) return '';
  return value
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Normaliza apenas dígitos numéricos
 */
export function normalizeDigits(value?: string | null): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

/**
 * Normaliza o CIB (Cadastro Imobiliário Brasileiro):
 * - Converte para maiúsculas
 * - Remove espaços e caracteres redundantes
 * - Padroniza prefixo CIB quando presente
 */
export function normalizeCib(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim().toUpperCase();
  const withoutPrefix = trimmed.replace(/^CIB\s*/i, '').replace(/[^A-Z0-9-]/g, '');
  if (!withoutPrefix) return '';
  return `CIB ${withoutPrefix}`;
}

/**
 * Validação sintática do CIB:
 * Suporta identificadores vigentes (alfanumérico de 7 a 14 caracteres).
 */
export function isValidCib(cib?: string | null): boolean {
  if (!cib) return true; // Opcional
  const clean = normalizeCib(cib).replace(/^CIB\s*/, '');
  if (clean.length < 6 || clean.length > 15) return false;
  return /^[A-Z0-9]+(-[A-Z0-9]+)?$/.test(clean);
}

/**
 * Mascara o CIB para exibição segura em listagens (ex: "CIB 789****-*")
 */
export function maskCib(cib?: string | null): string {
  if (!cib) return '';
  const clean = normalizeCib(cib);
  const withoutPrefix = clean.replace(/^CIB\s*/, '');
  if (withoutPrefix.length <= 4) return clean;
  const start = withoutPrefix.substring(0, 3);
  const end = withoutPrefix.substring(withoutPrefix.length - 2);
  const middle = '*'.repeat(Math.max(3, withoutPrefix.length - 5));
  return `CIB ${start}${middle}${end}`;
}

/**
 * Normaliza o NIRF legado (8 dígitos numéricos)
 */
export function normalizeNirf(value?: string | null): string {
  return normalizeDigits(value);
}

/**
 * Validação do NIRF legado
 */
export function isValidNirf(nirf?: string | null): boolean {
  if (!nirf) return true; // Opcional
  const clean = normalizeNirf(nirf);
  return clean.length === 8;
}

/**
 * Normaliza o Código CNS (Código Nacional de Serventia / Cartório):
 * Composto por 6 dígitos numéricos.
 */
export function normalizeCns(value?: string | null): string {
  return normalizeDigits(value);
}

/**
 * Validação do Código CNS: se informado, deve conter exatamente 6 dígitos.
 */
export function isValidCns(cns?: string | null): boolean {
  if (!cns) return true; // Opcional
  const clean = normalizeCns(cns);
  return clean.length === 6;
}

/**
 * Normaliza o Código Nacional de Matrícula (CNM):
 * Composto por 15 dígitos numéricos (6 CNS + 1 Livro + 6 Matrícula + 2 DV).
 */
export function normalizeCnm(value?: string | null): string {
  return normalizeDigits(value);
}

/**
 * Validação do Código Nacional de Matrícula (CNM):
 * Se informado, deve conter entre 14 e 16 dígitos numéricos (canônico: 15 dígitos).
 */
export function isValidCnm(cnm?: string | null): boolean {
  if (!cnm) return true; // Opcional
  const clean = normalizeCnm(cnm);
  return clean.length >= 14 && clean.length <= 16;
}

/**
 * Normaliza o Código SNCR / Incra (13 dígitos numéricos)
 */
export function normalizeSncr(value?: string | null): string {
  return normalizeDigits(value);
}

/**
 * Validação do Código SNCR / Incra: exige exatamente 13 dígitos
 */
export function isValidSncr(sncr?: string | null): boolean {
  if (!sncr) return true; // Opcional
  const clean = normalizeSncr(sncr);
  return clean.length === 13;
}

/**
 * Mascara o SNCR para exibição segura (ex: "999.***.***-99")
 */
export function maskSncr(sncr?: string | null): string {
  if (!sncr) return '';
  const clean = normalizeSncr(sncr);
  if (clean.length !== 13) return clean;
  return `${clean.substring(0, 3)}.***.***-${clean.substring(11)}`;
}

/**
 * Validação sintática do CAR (número do recibo/inscrição)
 */
export function isValidCar(car?: string | null): boolean {
  if (!car) return true; // Opcional
  const clean = car.trim().toUpperCase();
  if (clean.length < 10 || clean.length > 70) return false;
  // Padrão típico do SICAR: UF-XXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  return /^[A-Z]{2}-[\w.-]+$/.test(clean) || clean.length >= 10;
}

/**
 * Normaliza valores decimais para armazenamento seguro (ex: "1.250,50" -> "1250.50", "520.5" -> "520.5")
 */
export function parseDecimalInput(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  // Se contém vírgula, assume formato brasileiro com separador de milhar '.' e decimal ','
  if (trimmed.includes(',')) {
    const normalized = trimmed.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    if (isNaN(num)) return '';
    return normalized;
  }

  // Se não contém vírgula, já é formato decimal com ponto
  const num = parseFloat(trimmed);
  if (isNaN(num)) return '';
  return trimmed;
}

export const normalizeDecimalString = parseDecimalInput;

/**
 * Normaliza coordenadas geográficas (latitude/longitude) preservando ponto decimal
 */
export function normalizeCoordinateInput(value?: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // Se contiver vírgula, substitui por ponto
  return trimmed.replace(',', '.');
}

/**
 * Valida se uma string é um número decimal estritamente positivo (> 0)
 */
export function isPositiveDecimal(value?: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  return !isNaN(num) && num > 0;
}

/**
 * Valida se uma string é um número decimal não-negativo (>= 0)
 */
export function isNonNegativeDecimal(value?: string | null): boolean {
  if (!value) return true;
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  return !isNaN(num) && num >= 0;
}

/**
 * Formata área para apresentação em pt-BR com unidade
 */
export function formatArea(value?: string | null, unit: 'ha' | 'm²' = 'ha'): string {
  if (!value) return `0,00 ${unit}`;
  const normalized = value.trim().replace(',', '.');
  const num = parseFloat(normalized);
  if (isNaN(num)) return `0,00 ${unit}`;

  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(num);

  return `${formatted} ${unit}`;
}

/**
 * Validação de latitude em graus decimais (-90 a +90)
 */
export function isValidLatitude(lat?: string | null): boolean {
  if (!lat) return false;
  const normalized = lat.trim().replace(',', '.');
  const num = parseFloat(normalized);
  return !isNaN(num) && num >= -90 && num <= 90;
}

/**
 * Validação de longitude em graus decimais (-180 a +180)
 */
export function isValidLongitude(lng?: string | null): boolean {
  if (!lng) return false;
  const normalized = lng.trim().replace(',', '.');
  const num = parseFloat(normalized);
  return !isNaN(num) && num >= -180 && num <= 180;
}

/**
 * Validação completa do formulário de Imóvel (Rural ou Urbano)
 */
export function validatePropertyForm(values: PropertyFormValues): {
  isValid: boolean;
  errors: PropertyValidationErrors;
} {
  const errors: PropertyValidationErrors = {};
  const registrationErrors: Record<string, Record<string, string>> = {};
  const clientLinkErrors: Record<string, Record<string, string>> = {};
  const boundaryErrors: Record<string, Record<string, string>> = {};

  // 1. Identificação Geral
  if (!values.name || values.name.trim().length === 0) {
    errors.name = values.propertyType === 'rural'
      ? 'A denominação do imóvel rural é obrigatória.'
      : 'A identificação do imóvel urbano é obrigatória.';
  } else if (values.name.trim().length < 2) {
    errors.name = 'O nome de identificação deve conter ao menos 2 caracteres.';
  }

  // 2. Validações Específicas por Tipo
  if (values.propertyType === 'rural') {
    const rural = values as RuralPropertyFormValues;

    // Município e UF
    if (!rural.city || rural.city.trim().length === 0) {
      errors.city = 'O município do imóvel rural é obrigatório.';
    }
    if (!rural.state || rural.state.trim().length !== 2) {
      errors.state = 'A UF do imóvel rural é obrigatória.';
    }

    // CEP rural (opcional)
    if (rural.postalCode && rural.postalCode.trim().length > 0) {
      const cleanCep = normalizeDigits(rural.postalCode);
      if (cleanCep.length !== 8) {
        errors.postalCode = 'O CEP rural deve conter exatamente 8 dígitos.';
      }
    }

    // Área Total Declarada (Hectares)
    if (!rural.totalDeclaredAreaHa || rural.totalDeclaredAreaHa.trim().length === 0) {
      errors.totalDeclaredAreaHa = 'A área total declarada em hectares é obrigatória.';
    } else if (!isPositiveDecimal(rural.totalDeclaredAreaHa)) {
      errors.totalDeclaredAreaHa = 'A área total declarada deve ser um número maior que zero.';
    }

    // Áreas opcionais
    if (rural.registeredAreaHa && !isPositiveDecimal(rural.registeredAreaHa)) {
      errors.registeredAreaHa = 'A área registrada deve ser um número maior que zero.';
    }
    if (rural.carReportedAreaHa && !isPositiveDecimal(rural.carReportedAreaHa)) {
      errors.carReportedAreaHa = 'A área do CAR deve ser um número maior que zero.';
    }
    if (rural.sncrReportedAreaHa && !isPositiveDecimal(rural.sncrReportedAreaHa)) {
      errors.sncrReportedAreaHa = 'A área do SNCR deve ser um número maior que zero.';
    }

    // Identificadores Rurais
    if (rural.cib && !isValidCib(rural.cib)) {
      errors.cib = 'O CIB informado possui formato inválido.';
    }
    if (rural.nirfLegacy && !isValidNirf(rural.nirfLegacy)) {
      errors.nirfLegacy = 'O NIRF legado deve conter exatamente 8 dígitos numéricos.';
    }
    if (rural.sncrIncraCode && !isValidSncr(rural.sncrIncraCode)) {
      errors.sncrIncraCode = 'O código do imóvel no SNCR/Incra deve conter exatamente 13 dígitos.';
    }
    if (rural.ccirExerciseYear) {
      const year = parseInt(rural.ccirExerciseYear.trim(), 10);
      if (isNaN(year) || year < 1970 || year > 2100) {
        errors.ccirExerciseYear = 'Informe um ano de exercício do CCIR válido (ex: 2024).';
      }
    }
    if (rural.carReceiptNumber && !isValidCar(rural.carReceiptNumber)) {
      errors.carReceiptNumber = 'O número do recibo do CAR informado possui formato inválido.';
    }
  } else {
    const urban = values as UrbanPropertyFormValues;

    // Tipo Urbano
    if (!urban.urbanType) {
      errors.urbanType = 'Selecione a tipologia do imóvel urbano.';
    } else if (urban.urbanType === 'other' && (!urban.otherUrbanTypeDescription || urban.otherUrbanTypeDescription.trim().length === 0)) {
      errors.otherUrbanTypeDescription = 'Descreva a tipologia do imóvel urbano.';
    }

    // Endereço Urbano
    const cleanCep = normalizeDigits(urban.zipCode);
    if (!cleanCep || cleanCep.length !== 8) {
      errors.zipCode = 'Informe um CEP válido com 8 dígitos.';
    }
    if (!urban.street || urban.street.trim().length === 0) {
      errors.street = 'O logradouro é obrigatório.';
    }
    if (!urban.noNumber && (!urban.number || urban.number.trim().length === 0)) {
      errors.number = 'Informe o número ou selecione "Sem número".';
    }
    if (!urban.neighborhood || urban.neighborhood.trim().length === 0) {
      errors.neighborhood = 'O bairro é obrigatório.';
    }
    if (!urban.city || urban.city.trim().length === 0) {
      errors.city = 'O município é obrigatório.';
    }
    if (!urban.state || urban.state.trim().length !== 2) {
      errors.state = 'A UF é obrigatória.';
    }

    // Área do Terreno (m²)
    if (!urban.landAreaM2 || urban.landAreaM2.trim().length === 0) {
      errors.landAreaM2 = 'A área do terreno em m² é obrigatória.';
    } else if (!isPositiveDecimal(urban.landAreaM2)) {
      errors.landAreaM2 = 'A área do terreno deve ser um número maior que zero.';
    }

    // Áreas opcionais
    if (urban.builtAreaM2 && !isPositiveDecimal(urban.builtAreaM2)) {
      errors.builtAreaM2 = 'A área construída deve ser um número maior que zero.';
    }
    if (urban.privateAreaM2 && !isPositiveDecimal(urban.privateAreaM2)) {
      errors.privateAreaM2 = 'A área privativa deve ser um número maior que zero.';
    }
    if (urban.commonAreaM2 && !isPositiveDecimal(urban.commonAreaM2)) {
      errors.commonAreaM2 = 'A área comum deve ser um número maior que zero.';
    }

    // Identificadores Urbanos
    if (urban.cib && !isValidCib(urban.cib)) {
      errors.cib = 'O CIB informado possui formato inválido.';
    }
  }

  // 3. Matrículas e Registros
  const seenRegistrations = new Set<string>();
  if (values.registrations && values.registrations.length > 0) {
    values.registrations.forEach((reg, index) => {
      const regErrors: Record<string, string> = {};

      const num = normalizeText(reg.registrationNumber);
      const office = normalizeText(reg.registryOffice);
      const district = normalizeText(reg.district);
      const state = normalizeText(reg.state).toUpperCase();

      if (!num) {
        regErrors.registrationNumber = 'O número da matrícula é obrigatório.';
      }
      if (!office) {
        regErrors.registryOffice = 'O cartório/serventia é obrigatório.';
      }
      if (!district) {
        regErrors.district = 'A comarca é obrigatória.';
      }
      if (!state || state.length !== 2) {
        regErrors.state = 'A UF é obrigatória.';
      }

      if (num && office && district) {
        const key = `${num.toLowerCase()}|${office.toLowerCase()}|${district.toLowerCase()}`;
        if (seenRegistrations.has(key)) {
          regErrors.registrationNumber = 'Esta matrícula já foi incluída neste imóvel.';
        } else {
          seenRegistrations.add(key);
        }
      }

      if (reg.registeredArea && !isPositiveDecimal(reg.registeredArea)) {
        regErrors.registeredArea = 'A área deve ser maior que zero.';
      }

      if (reg.registryOfficeCode && !isValidCns(reg.registryOfficeCode)) {
        regErrors.registryOfficeCode = 'O código CNS do cartório deve conter exatamente 6 dígitos numéricos.';
      }

      if (reg.cnmCode && !isValidCnm(reg.cnmCode)) {
        regErrors.cnmCode = 'O Código Nacional de Matrícula (CNM) deve conter 15 dígitos numéricos.';
      }

      if (Object.keys(regErrors).length > 0) {
        registrationErrors[reg.id || `index_${index}`] = regErrors;
      }
    });
  }

  // 4. Clientes Vinculados (Obrigatório ao menos 1 com 1 principal)
  if (!values.clientLinks || values.clientLinks.length === 0) {
    errors.clientLinks = 'Vincule ao menos um cliente ou produtor a este imóvel.';
  } else {
    let primaryCount = 0;
    let totalParticipation = 0;
    const seenClientIds = new Set<string>();

    values.clientLinks.forEach((link, index) => {
      const linkErrors: Record<string, string> = {};

      if (!link.clientId || link.clientId.trim().length === 0) {
        linkErrors.clientId = 'Selecione um cliente.';
      } else {
        if (seenClientIds.has(link.clientId)) {
          linkErrors.clientId = 'Este cliente já está vinculado a este imóvel.';
        } else {
          seenClientIds.add(link.clientId);
        }
      }

      if (!link.relationship) {
        linkErrors.relationship = 'Selecione a relação jurídica.';
      } else if (
        link.relationship === 'other' &&
        (!link.otherRelationshipDescription || link.otherRelationshipDescription.trim().length === 0)
      ) {
        linkErrors.otherRelationshipDescription = 'Descreva a relação jurídica.';
      }

      if (link.isPrimaryHolder) {
        primaryCount++;
      }

      if (link.declaredParticipationPercentage && link.declaredParticipationPercentage.trim().length > 0) {
        const part = parseFloat(link.declaredParticipationPercentage.trim().replace(',', '.'));
        if (isNaN(part) || part <= 0 || part > 100) {
          linkErrors.declaredParticipationPercentage = 'A participação deve ser entre 0,01% e 100%.';
        } else {
          totalParticipation += part;
        }
      }

      if (Object.keys(linkErrors).length > 0) {
        clientLinkErrors[link.clientId || `index_${index}`] = linkErrors;
      }
    });

    if (primaryCount === 0) {
      errors.clientLinks = 'Defina exatamente um cliente como titular principal do imóvel.';
    } else if (primaryCount > 1) {
      errors.clientLinks = 'Apenas um cliente pode ser definido como titular principal.';
    }

    if (totalParticipation > 100.001) {
      errors.clientLinks = `A soma das participações informadas (${totalParticipation.toFixed(2)}%) não pode ultrapassar 100%.`;
    }
  }

  // 5. Coordenada de Referência
  if (values.hasCoordinate) {
    const hasLat = values.latitude && values.latitude.trim().length > 0;
    const hasLng = values.longitude && values.longitude.trim().length > 0;

    if (!hasLat && !hasLng) {
      errors.coordinate = 'Informe a latitude e a longitude ou desmarque a coordenada de referência.';
    } else if (!hasLat || !hasLng) {
      errors.coordinate = 'Ambos os campos de latitude e longitude devem ser preenchidos.';
    } else {
      if (!isValidLatitude(values.latitude)) {
        errors.latitude = 'A latitude deve ser um valor decimal entre -90 e +90.';
      }
      if (!isValidLongitude(values.longitude)) {
        errors.longitude = 'A longitude deve ser um valor decimal entre -180 e +180.';
      }
    }

    if (values.geodeticSystem === 'other' && (!values.otherGeodeticSystemDescription || values.otherGeodeticSystemDescription.trim().length === 0)) {
      errors.geodeticSystem = 'Descreva o referencial geodésico.';
    }
  }

  // 6. Confrontações Textuais
  if (values.boundaries && values.boundaries.length > 0) {
    values.boundaries.forEach((b, index) => {
      const bErrors: Record<string, string> = {};

      const dir = normalizeText(b.direction);
      const adj = normalizeText(b.adjoiningDescription);

      if (!dir && !adj && !b.observation) {
        bErrors.direction = 'Preencha a confrontação ou remova a linha.';
      } else {
        if (!dir) {
          bErrors.direction = 'Informe a direção ou trecho (ex: Norte).';
        }
        if (!adj) {
          bErrors.adjoiningDescription = 'Informe o confrontante ou divisa.';
        }
        if (b.boundaryType === 'other' && (!b.otherBoundaryTypeDescription || b.otherBoundaryTypeDescription.trim().length === 0)) {
          bErrors.otherBoundaryTypeDescription = 'Descreva o tipo de divisa.';
        }
      }

      if (Object.keys(bErrors).length > 0) {
        boundaryErrors[b.id || `index_${index}`] = bErrors;
      }
    });
  }

  if (Object.keys(registrationErrors).length > 0) {
    errors.registrationErrors = registrationErrors;
  }
  if (Object.keys(clientLinkErrors).length > 0) {
    errors.clientLinkErrors = clientLinkErrors;
  }
  if (Object.keys(boundaryErrors).length > 0) {
    errors.boundaryErrors = boundaryErrors;
  }

  const hasErrors =
    Object.keys(errors).length > 0 ||
    Object.keys(registrationErrors).length > 0 ||
    Object.keys(clientLinkErrors).length > 0 ||
    Object.keys(boundaryErrors).length > 0;

  return {
    isValid: !hasErrors,
    errors,
  };
}

/**
 * Converte os valores do formulário para CreatePropertyInput
 */
export function formValuesToCreateInput(
  values: PropertyFormValues,
  organizationId: string
): CreatePropertyInput {
  const registrations = values.registrations.map((r) => ({
    id: r.id || `reg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    registrationNumber: normalizeText(r.registrationNumber),
    cnmCode: normalizeCnm(r.cnmCode) || undefined,
    registryOffice: normalizeText(r.registryOffice),
    registryOfficeCode: normalizeCns(r.registryOfficeCode) || undefined,
    district: normalizeText(r.district),
    state: normalizeText(r.state).toUpperCase(),
    bookAndPage: normalizeText(r.bookAndPage) || undefined,
    certificateIssuedAt: normalizeText(r.certificateIssuedAt) || undefined,
    registrationStatus: r.registrationStatus || 'active',
    isPrimary: !!r.isPrimary,
    registeredArea: parseDecimalInput(r.registeredArea) || undefined,
    areaUnit: r.areaUnit || (values.propertyType === 'rural' ? 'ha' : 'm²'),
    observation: normalizeText(r.observation) || undefined,
  }));

  const clientLinks = values.clientLinks.map((l) => ({
    clientId: l.clientId,
    relationship: l.relationship,
    otherRelationshipDescription:
      l.relationship === 'other' ? normalizeText(l.otherRelationshipDescription) : undefined,
    isPrimaryHolder: !!l.isPrimaryHolder,
    declaredParticipationPercentage: parseDecimalInput(l.declaredParticipationPercentage) || undefined,
    observation: normalizeText(l.observation) || undefined,
    linkedAt: new Date().toISOString(),
  }));

  const boundaries = values.boundaries.map((b) => ({
    id: b.id || `bnd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    direction: normalizeText(b.direction),
    adjoiningDescription: normalizeText(b.adjoiningDescription),
    boundaryType: b.boundaryType,
    otherBoundaryTypeDescription:
      b.boundaryType === 'other' ? normalizeText(b.otherBoundaryTypeDescription) : undefined,
    source: b.source || 'unknown',
    observation: normalizeText(b.observation) || undefined,
  }));

  const referenceCoordinate =
    values.hasCoordinate && values.latitude && values.longitude
      ? {
          latitude: normalizeCoordinateInput(values.latitude),
          longitude: normalizeCoordinateInput(values.longitude),
          datum: normalizeText(values.datum) || undefined,
          format: values.format || 'decimal_degrees',
          origin: values.origin || 'unknown',
          altitude: parseDecimalInput(values.altitude) || undefined,
          altitudeType: values.altitudeType || 'unknown',
          geodeticSystem: values.geodeticSystem || 'SIRGAS2000',
          otherGeodeticSystemDescription:
            values.geodeticSystem === 'other'
              ? normalizeText(values.otherGeodeticSystemDescription)
              : undefined,
          pointDescription: normalizeText(values.pointDescription) || undefined,
          observation: normalizeText(values.observation) || undefined,
        }
      : undefined;

  const notes = normalizeText(values.notes) || undefined;

  if (values.propertyType === 'rural') {
    const rural = values as RuralPropertyFormValues;
    return {
      organizationId,
      propertyType: 'rural',
      name: normalizeText(rural.name),
      status: rural.status || 'active',
      location: {
        postalCode: normalizeDigits(rural.postalCode) || undefined,
        district: normalizeText(rural.district) || undefined,
        complement: normalizeText(rural.complement) || undefined,
        city: normalizeText(rural.city),
        state: normalizeText(rural.state).toUpperCase(),
        ruralRegionOrCommunity: normalizeText(rural.ruralRegionOrCommunity) || undefined,
        accessRouteDescription: normalizeText(rural.accessRouteDescription) || undefined,
      },
      areas: {
        totalDeclaredAreaHa: parseDecimalInput(rural.totalDeclaredAreaHa),
        registeredAreaHa: parseDecimalInput(rural.registeredAreaHa) || undefined,
        carReportedAreaHa: parseDecimalInput(rural.carReportedAreaHa) || undefined,
        sncrReportedAreaHa: parseDecimalInput(rural.sncrReportedAreaHa) || undefined,
      },
      identifiers: {
        cib: normalizeCib(rural.cib) || undefined,
        nirfLegacy: normalizeNirf(rural.nirfLegacy) || undefined,
        sncrIncraCode: normalizeSncr(rural.sncrIncraCode) || undefined,
        ccirReference: normalizeText(rural.ccirReference) || undefined,
        ccirExerciseYear: normalizeDigits(rural.ccirExerciseYear) || undefined,
        carReceiptNumber: normalizeText(rural.carReceiptNumber) || undefined,
      },
      registrations,
      clientLinks,
      referenceCoordinate,
      boundaries,
      notes,
    };
  } else {
    const urban = values as UrbanPropertyFormValues;
    return {
      organizationId,
      propertyType: 'urban',
      urbanType: urban.urbanType,
      otherUrbanTypeDescription:
        urban.urbanType === 'other' ? normalizeText(urban.otherUrbanTypeDescription) : undefined,
      name: normalizeText(urban.name),
      status: urban.status || 'active',
      location: {
        zipCode: normalizeDigits(urban.zipCode),
        street: normalizeText(urban.street),
        number: urban.noNumber ? undefined : normalizeText(urban.number) || undefined,
        noNumber: !!urban.noNumber,
        neighborhood: normalizeText(urban.neighborhood),
        complement: normalizeText(urban.complement) || undefined,
        city: normalizeText(urban.city),
        state: normalizeText(urban.state).toUpperCase(),
        lot: normalizeText(urban.lot) || undefined,
        block: normalizeText(urban.block) || undefined,
        unit: normalizeText(urban.unit) || undefined,
        referencePoint: normalizeText(urban.referencePoint) || undefined,
      },
      areas: {
        landAreaM2: parseDecimalInput(urban.landAreaM2),
        builtAreaM2: parseDecimalInput(urban.builtAreaM2) || undefined,
        privateAreaM2: parseDecimalInput(urban.privateAreaM2) || undefined,
        commonAreaM2: parseDecimalInput(urban.commonAreaM2) || undefined,
      },
      identifiers: {
        cib: normalizeCib(urban.cib) || undefined,
        municipalRegistration: normalizeText(urban.municipalRegistration) || undefined,
        condominiumIdentification: normalizeText(urban.condominiumIdentification) || undefined,
      },
      registrations,
      clientLinks,
      referenceCoordinate,
      boundaries,
      notes,
    };
  }
}

/**
 * Converte os valores do formulário para UpdatePropertyInput
 */
export function formValuesToUpdateInput(values: PropertyFormValues): UpdatePropertyInput {
  const registrations = values.registrations.map((r) => ({
    id: r.id || `reg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    registrationNumber: normalizeText(r.registrationNumber),
    cnmCode: normalizeCnm(r.cnmCode) || undefined,
    registryOffice: normalizeText(r.registryOffice),
    registryOfficeCode: normalizeCns(r.registryOfficeCode) || undefined,
    district: normalizeText(r.district),
    state: normalizeText(r.state).toUpperCase(),
    bookAndPage: normalizeText(r.bookAndPage) || undefined,
    certificateIssuedAt: normalizeText(r.certificateIssuedAt) || undefined,
    registrationStatus: r.registrationStatus || 'active',
    isPrimary: !!r.isPrimary,
    registeredArea: parseDecimalInput(r.registeredArea) || undefined,
    areaUnit: r.areaUnit || (values.propertyType === 'rural' ? 'ha' : 'm²'),
    observation: normalizeText(r.observation) || undefined,
  }));

  const clientLinks = values.clientLinks.map((l) => ({
    clientId: l.clientId,
    relationship: l.relationship,
    otherRelationshipDescription:
      l.relationship === 'other' ? normalizeText(l.otherRelationshipDescription) : undefined,
    isPrimaryHolder: !!l.isPrimaryHolder,
    declaredParticipationPercentage: parseDecimalInput(l.declaredParticipationPercentage) || undefined,
    observation: normalizeText(l.observation) || undefined,
    linkedAt: new Date().toISOString(),
  }));

  const boundaries = values.boundaries.map((b) => ({
    id: b.id || `bnd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    direction: normalizeText(b.direction),
    adjoiningDescription: normalizeText(b.adjoiningDescription),
    boundaryType: b.boundaryType,
    otherBoundaryTypeDescription:
      b.boundaryType === 'other' ? normalizeText(b.otherBoundaryTypeDescription) : undefined,
    source: b.source || 'unknown',
    observation: normalizeText(b.observation) || undefined,
  }));

  const referenceCoordinate =
    values.hasCoordinate && values.latitude && values.longitude
      ? {
          latitude: normalizeCoordinateInput(values.latitude),
          longitude: normalizeCoordinateInput(values.longitude),
          datum: normalizeText(values.datum) || undefined,
          format: values.format || 'decimal_degrees',
          origin: values.origin || 'unknown',
          altitude: parseDecimalInput(values.altitude) || undefined,
          altitudeType: values.altitudeType || 'unknown',
          geodeticSystem: values.geodeticSystem || 'SIRGAS2000',
          otherGeodeticSystemDescription:
            values.geodeticSystem === 'other'
              ? normalizeText(values.otherGeodeticSystemDescription)
              : undefined,
          pointDescription: normalizeText(values.pointDescription) || undefined,
          observation: normalizeText(values.observation) || undefined,
        }
      : undefined;

  const notes = normalizeText(values.notes) || undefined;

  if (values.propertyType === 'rural') {
    const rural = values as RuralPropertyFormValues;
    return {
      name: normalizeText(rural.name),
      status: rural.status || 'active',
      location: {
        postalCode: normalizeDigits(rural.postalCode) || undefined,
        district: normalizeText(rural.district) || undefined,
        complement: normalizeText(rural.complement) || undefined,
        city: normalizeText(rural.city),
        state: normalizeText(rural.state).toUpperCase(),
        ruralRegionOrCommunity: normalizeText(rural.ruralRegionOrCommunity) || undefined,
        accessRouteDescription: normalizeText(rural.accessRouteDescription) || undefined,
      },
      areas: {
        totalDeclaredAreaHa: parseDecimalInput(rural.totalDeclaredAreaHa),
        registeredAreaHa: parseDecimalInput(rural.registeredAreaHa) || undefined,
        carReportedAreaHa: parseDecimalInput(rural.carReportedAreaHa) || undefined,
        sncrReportedAreaHa: parseDecimalInput(rural.sncrReportedAreaHa) || undefined,
      },
      identifiers: {
        cib: normalizeCib(rural.cib) || undefined,
        nirfLegacy: normalizeNirf(rural.nirfLegacy) || undefined,
        sncrIncraCode: normalizeSncr(rural.sncrIncraCode) || undefined,
        ccirReference: normalizeText(rural.ccirReference) || undefined,
        ccirExerciseYear: normalizeDigits(rural.ccirExerciseYear) || undefined,
        carReceiptNumber: normalizeText(rural.carReceiptNumber) || undefined,
      },
      registrations,
      clientLinks,
      referenceCoordinate,
      boundaries,
      notes,
    };
  } else {
    const urban = values as UrbanPropertyFormValues;
    return {
      urbanType: urban.urbanType,
      otherUrbanTypeDescription:
        urban.urbanType === 'other' ? normalizeText(urban.otherUrbanTypeDescription) : undefined,
      name: normalizeText(urban.name),
      status: urban.status || 'active',
      location: {
        zipCode: normalizeDigits(urban.zipCode),
        street: normalizeText(urban.street),
        number: urban.noNumber ? undefined : normalizeText(urban.number) || undefined,
        noNumber: !!urban.noNumber,
        neighborhood: normalizeText(urban.neighborhood),
        complement: normalizeText(urban.complement) || undefined,
        city: normalizeText(urban.city),
        state: normalizeText(urban.state).toUpperCase(),
        lot: normalizeText(urban.lot) || undefined,
        block: normalizeText(urban.block) || undefined,
        unit: normalizeText(urban.unit) || undefined,
        referencePoint: normalizeText(urban.referencePoint) || undefined,
      },
      areas: {
        landAreaM2: parseDecimalInput(urban.landAreaM2),
        builtAreaM2: parseDecimalInput(urban.builtAreaM2) || undefined,
        privateAreaM2: parseDecimalInput(urban.privateAreaM2) || undefined,
        commonAreaM2: parseDecimalInput(urban.commonAreaM2) || undefined,
      },
      identifiers: {
        cib: normalizeCib(urban.cib) || undefined,
        municipalRegistration: normalizeText(urban.municipalRegistration) || undefined,
        condominiumIdentification: normalizeText(urban.condominiumIdentification) || undefined,
      },
      registrations,
      clientLinks,
      referenceCoordinate,
      boundaries,
      notes,
    };
  }
}

/**
 * Converte a entidade Property de volta para PropertyFormValues na edição
 */
export function propertyToFormValues(property: Property): PropertyFormValues {
  const commonRegistrations = property.registrations.map((r) => ({
    id: r.id,
    registrationNumber: r.registrationNumber,
    cnmCode: r.cnmCode || '',
    registryOffice: r.registryOffice,
    registryOfficeCode: r.registryOfficeCode || '',
    district: r.district,
    state: r.state,
    bookAndPage: r.bookAndPage || '',
    certificateIssuedAt: r.certificateIssuedAt || '',
    registrationStatus: r.registrationStatus || 'active',
    isPrimary: !!r.isPrimary,
    registeredArea: r.registeredArea || '',
    areaUnit: r.areaUnit || (property.propertyType === 'rural' ? 'ha' : 'm²'),
    observation: r.observation || '',
  }));

  const commonClientLinks = property.clientLinks.map((l) => ({
    clientId: l.clientId,
    relationship: l.relationship,
    otherRelationshipDescription: l.otherRelationshipDescription || '',
    isPrimaryHolder: !!l.isPrimaryHolder,
    declaredParticipationPercentage: l.declaredParticipationPercentage || '',
    observation: l.observation || '',
  }));

  const commonBoundaries = property.boundaries.map((b) => ({
    id: b.id,
    direction: b.direction,
    adjoiningDescription: b.adjoiningDescription,
    boundaryType: b.boundaryType,
    otherBoundaryTypeDescription: b.otherBoundaryTypeDescription || '',
    source: b.source || 'unknown',
    observation: b.observation || '',
  }));

  const hasCoord = !!property.referenceCoordinate;

  if (property.propertyType === 'rural') {
    const r = property as RuralProperty;
    return {
      propertyType: 'rural',
      name: r.name,
      status: r.status,
      notes: r.notes || '',
      postalCode: r.location.postalCode || '',
      district: r.location.district || '',
      complement: r.location.complement || '',
      city: r.location.city,
      state: r.location.state,
      ruralRegionOrCommunity: r.location.ruralRegionOrCommunity || '',
      accessRouteDescription: r.location.accessRouteDescription || '',
      totalDeclaredAreaHa: r.areas.totalDeclaredAreaHa,
      registeredAreaHa: r.areas.registeredAreaHa || '',
      carReportedAreaHa: r.areas.carReportedAreaHa || '',
      sncrReportedAreaHa: r.areas.sncrReportedAreaHa || '',
      cib: r.identifiers.cib || '',
      nirfLegacy: r.identifiers.nirfLegacy || '',
      sncrIncraCode: r.identifiers.sncrIncraCode || '',
      ccirReference: r.identifiers.ccirReference || '',
      ccirExerciseYear: r.identifiers.ccirExerciseYear || '',
      carReceiptNumber: r.identifiers.carReceiptNumber || '',
      registrations: commonRegistrations,
      clientLinks: commonClientLinks,
      hasCoordinate: hasCoord,
      latitude: r.referenceCoordinate?.latitude || '',
      longitude: r.referenceCoordinate?.longitude || '',
      datum: r.referenceCoordinate?.datum || '',
      format: r.referenceCoordinate?.format || 'decimal_degrees',
      origin: r.referenceCoordinate?.origin || 'unknown',
      altitude: r.referenceCoordinate?.altitude || '',
      altitudeType: r.referenceCoordinate?.altitudeType || 'unknown',
      geodeticSystem: r.referenceCoordinate?.geodeticSystem || 'SIRGAS2000',
      otherGeodeticSystemDescription: r.referenceCoordinate?.otherGeodeticSystemDescription || '',
      pointDescription: r.referenceCoordinate?.pointDescription || '',
      observation: r.referenceCoordinate?.observation || '',
      boundaries: commonBoundaries,
    };
  } else {
    const u = property as UrbanProperty;
    return {
      propertyType: 'urban',
      urbanType: u.urbanType,
      otherUrbanTypeDescription: u.otherUrbanTypeDescription || '',
      name: u.name,
      status: u.status,
      notes: u.notes || '',
      zipCode: u.location.zipCode,
      street: u.location.street,
      number: u.location.number || '',
      noNumber: u.location.noNumber,
      neighborhood: u.location.neighborhood,
      complement: u.location.complement || '',
      city: u.location.city,
      state: u.location.state,
      lot: u.location.lot || '',
      block: u.location.block || '',
      unit: u.location.unit || '',
      referencePoint: u.location.referencePoint || '',
      landAreaM2: u.areas.landAreaM2,
      builtAreaM2: u.areas.builtAreaM2 || '',
      privateAreaM2: u.areas.privateAreaM2 || '',
      commonAreaM2: u.areas.commonAreaM2 || '',
      cib: u.identifiers.cib || '',
      municipalRegistration: u.identifiers.municipalRegistration || '',
      condominiumIdentification: u.identifiers.condominiumIdentification || '',
      registrations: commonRegistrations,
      clientLinks: commonClientLinks,
      hasCoordinate: hasCoord,
      latitude: u.referenceCoordinate?.latitude || '',
      longitude: u.referenceCoordinate?.longitude || '',
      datum: u.referenceCoordinate?.datum || '',
      format: u.referenceCoordinate?.format || 'decimal_degrees',
      origin: u.referenceCoordinate?.origin || 'unknown',
      altitude: u.referenceCoordinate?.altitude || '',
      altitudeType: u.referenceCoordinate?.altitudeType || 'unknown',
      geodeticSystem: u.referenceCoordinate?.geodeticSystem || 'SIRGAS2000',
      otherGeodeticSystemDescription: u.referenceCoordinate?.otherGeodeticSystemDescription || '',
      pointDescription: u.referenceCoordinate?.pointDescription || '',
      observation: u.referenceCoordinate?.observation || '',
      boundaries: commonBoundaries,
    };
  }
}

/**
 * Cria valores padrão iniciais para novo imóvel
 */
export function getDefaultPropertyFormValues(type: 'rural' | 'urban' = 'rural'): PropertyFormValues {
  if (type === 'rural') {
    return {
      propertyType: 'rural',
      name: '',
      status: 'active',
      notes: '',
      postalCode: '',
      district: '',
      complement: '',
      city: '',
      state: '',
      ruralRegionOrCommunity: '',
      accessRouteDescription: '',
      totalDeclaredAreaHa: '',
      registeredAreaHa: '',
      carReportedAreaHa: '',
      sncrReportedAreaHa: '',
      cib: '',
      nirfLegacy: '',
      sncrIncraCode: '',
      ccirReference: '',
      ccirExerciseYear: '',
      carReceiptNumber: '',
      registrations: [],
      clientLinks: [],
      hasCoordinate: false,
      latitude: '',
      longitude: '',
      datum: '',
      format: 'decimal_degrees',
      origin: 'unknown',
      altitude: '',
      altitudeType: 'unknown',
      geodeticSystem: 'SIRGAS2000',
      otherGeodeticSystemDescription: '',
      pointDescription: '',
      observation: '',
      boundaries: [],
    };
  } else {
    return {
      propertyType: 'urban',
      urbanType: 'house',
      otherUrbanTypeDescription: '',
      name: '',
      status: 'active',
      notes: '',
      zipCode: '',
      street: '',
      number: '',
      noNumber: false,
      neighborhood: '',
      complement: '',
      city: '',
      state: '',
      lot: '',
      block: '',
      unit: '',
      referencePoint: '',
      landAreaM2: '',
      builtAreaM2: '',
      privateAreaM2: '',
      commonAreaM2: '',
      cib: '',
      municipalRegistration: '',
      condominiumIdentification: '',
      registrations: [],
      clientLinks: [],
      hasCoordinate: false,
      latitude: '',
      longitude: '',
      datum: '',
      format: 'decimal_degrees',
      origin: 'unknown',
      altitude: '',
      altitudeType: 'unknown',
      geodeticSystem: 'SIRGAS2000',
      otherGeodeticSystemDescription: '',
      pointDescription: '',
      observation: '',
      boundaries: [],
    };
  }
}
