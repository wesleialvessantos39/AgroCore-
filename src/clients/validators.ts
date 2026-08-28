/**
 * Validadores e Normalizadores Puros — Módulo 002: Clientes e Produtores Rurais
 * OE-002.002
 *
 * Funções puras, determinísticas e isoladas sem dependências externas.
 */

import {
  ClientFormValues,
  ClientValidationErrors,
  CreateClientInput,
  UpdateClientInput,
} from '../types/client';

/**
 * Todas as 27 Unidades Federativas do Brasil em ordem alfabética
 */
export const BRAZILIAN_STATES = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
] as const;

export type BrazilianUf = typeof BRAZILIAN_STATES[number]['uf'];

/**
 * Normaliza qualquer documento removendo caracteres não numéricos.
 */
export function normalizeDigits(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

/**
 * Normaliza strings de texto removendo espaços excedentes nas bordas.
 */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim();
}

/**
 * Normaliza e-mail para caixa baixa e sem espaços.
 */
export function normalizeEmail(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().toLowerCase();
}

/**
 * Normaliza termo de busca removendo acentos, convertendo para minúsculas e colapsando espaços.
 */
export function normalizeSearchTerm(term: string | null | undefined): string {
  if (!term) return '';
  return term
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Validação algorítmica real do CPF (Cálculo dos dígitos verificadores).
 */
export function isValidCpf(cpfInput: string | null | undefined): boolean {
  const cpf = normalizeDigits(cpfInput);

  if (cpf.length !== 11) {
    return false;
  }

  // Rejeita sequências com todos os dígitos iguais (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  // Cálculo do 1º Dígito Verificador (DV1)
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let dv1 = (sum * 10) % 11;
  if (dv1 === 10 || dv1 === 11) {
    dv1 = 0;
  }
  if (dv1 !== parseInt(cpf.charAt(9), 10)) {
    return false;
  }

  // Cálculo do 2º Dígito Verificador (DV2)
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  let dv2 = (sum * 10) % 11;
  if (dv2 === 10 || dv2 === 11) {
    dv2 = 0;
  }
  if (dv2 !== parseInt(cpf.charAt(10), 10)) {
    return false;
  }

  return true;
}

/**
 * Validação algorítmica real do CNPJ (Cálculo dos dígitos verificadores).
 */
export function isValidCnpj(cnpjInput: string | null | undefined): boolean {
  const cnpj = normalizeDigits(cnpjInput);

  if (cnpj.length !== 14) {
    return false;
  }

  // Rejeita sequências com todos os dígitos iguais
  if (/^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }

  // Cálculo do 1º Dígito Verificador (DV1)
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cnpj.charAt(i), 10) * weights1[i];
  }
  let mod = sum % 11;
  const dv1 = mod < 2 ? 0 : 11 - mod;
  if (dv1 !== parseInt(cnpj.charAt(12), 10)) {
    return false;
  }

  // Cálculo do 2º Dígito Verificador (DV2)
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cnpj.charAt(i), 10) * weights2[i];
  }
  mod = sum % 11;
  const dv2 = mod < 2 ? 0 : 11 - mod;
  if (dv2 !== parseInt(cnpj.charAt(13), 10)) {
    return false;
  }

  return true;
}

/**
 * Formata CPF para o padrão 000.000.000-00
 */
export function formatCpf(cpfInput: string | null | undefined): string {
  const digits = normalizeDigits(cpfInput);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Mascara CPF para exibição segura na listagem (ex: 123.***.***-45)
 */
export function maskCpf(cpfInput: string | null | undefined): string {
  const digits = normalizeDigits(cpfInput);
  if (digits.length !== 11) return '***.***.***-**';
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
}

/**
 * Formata CNPJ para o padrão 00.000.000/0000-00
 */
export function formatCnpj(cnpjInput: string | null | undefined): string {
  const digits = normalizeDigits(cnpjInput);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

/**
 * Mascara CNPJ para exibição segura na listagem (ex: 12.xxx.xxx/0001-34)
 */
export function maskCnpj(cnpjInput: string | null | undefined): string {
  const digits = normalizeDigits(cnpjInput);
  if (digits.length !== 14) return '**.***.***/****-**';
  return `${digits.slice(0, 2)}.***.***/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

/**
 * Validação de telefone celular ou fixo brasileiro (10 ou 11 dígitos).
 */
export function isValidPhone(phoneInput: string | null | undefined): boolean {
  const digits = normalizeDigits(phoneInput);
  if (digits.length !== 10 && digits.length !== 11) {
    return false;
  }

  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) {
    return false;
  }

  // Telefones celulares com 11 dígitos devem iniciar com 9 no número
  if (digits.length === 11) {
    const ninthDigit = digits.charAt(2);
    if (ninthDigit !== '9') {
      return false;
    }
  }

  return true;
}

/**
 * Formata telefone para o padrão (00) 0000-0000 ou (00) 00000-0000
 */
export function formatPhone(phoneInput: string | null | undefined): string {
  const digits = normalizeDigits(phoneInput);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Validação sintática de e-mail sem bloquear domínios legítimos.
 */
export function isValidEmail(emailInput: string | null | undefined): boolean {
  if (!emailInput) return true; // Opcional se vazio
  const normalized = normalizeEmail(emailInput);
  if (normalized.length === 0) return true;
  if (normalized.length > 254) return false;

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(normalized);
}

/**
 * Validação de CEP (8 dígitos).
 */
export function isValidCep(cepInput: string | null | undefined): boolean {
  if (!cepInput) return true; // Quando opcional
  const digits = normalizeDigits(cepInput);
  if (digits.length === 0) return true;
  return digits.length === 8;
}

/**
 * Formata CEP para 00000-000
 */
export function formatCep(cepInput: string | null | undefined): string {
  const digits = normalizeDigits(cepInput);
  if (!digits) return '';
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
}

/**
 * Validação sintática da Inscrição Estadual (IE).
 */
export function isValidStateRegistration(
  ieInput: string | null | undefined,
  isExempt: boolean
): boolean {
  if (isExempt) {
    return true;
  }
  const clean = normalizeText(ieInput);
  if (!clean || clean.length === 0) {
    return false;
  }
  // Aceita alfanuméricos entre 2 e 16 caracteres
  const ieRegex = /^[A-Z0-9]{2,16}$/i;
  return ieRegex.test(clean.replace(/[\.\-\/]/g, ''));
}

/**
 * Validação de Data de Nascimento (formato YYYY-MM-DD, não futura e ano razoável >= 1900).
 */
export function isValidBirthDate(dateStr: string | null | undefined): boolean {
  if (!dateStr || normalizeText(dateStr).length === 0) {
    return true; // Campo opcional
  }

  const trimmed = normalizeText(dateStr);
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(trimmed)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (year < 1900) {
    return false;
  }

  if (month < 1 || month > 12) {
    return false;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return false;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (parsed.getTime() > today.getTime()) {
    return false;
  }

  return true;
}

/**
 * Validador completo de valores de formulário de clientes (PF ou PJ).
 */
export function validateClientForm(
  values: ClientFormValues
): ClientValidationErrors {
  const errors: ClientValidationErrors = {};

  if (values.personType === 'individual') {
    // 1. Identificação PF
    const name = normalizeText(values.name);
    if (!name || name.length === 0) {
      errors.name = 'Nome completo é obrigatório.';
    } else if (name.length < 3) {
      errors.name = 'Nome deve conter pelo menos 3 caracteres.';
    }

    const cpfDigits = normalizeDigits(values.cpf);
    if (!cpfDigits || cpfDigits.length === 0) {
      errors.cpf = 'CPF é obrigatório.';
    } else if (!isValidCpf(cpfDigits)) {
      errors.cpf = 'CPF inválido. Verifique os dígitos informados.';
    }

    // RG e dependências
    const rg = normalizeText(values.rg);
    const rgIssuer = normalizeText(values.rgIssuer);
    const rgState = normalizeText(values.rgState);
    if ((rgIssuer.length > 0 || rgState.length > 0) && rg.length === 0) {
      errors.rg = 'Informe o número do RG ao preencher órgão expedidor ou UF.';
    }

    // Data de nascimento
    if (values.birthDate && !isValidBirthDate(values.birthDate)) {
      errors.birthDate = 'Data de nascimento inválida ou futura.';
    }

    // Inscrição Estadual
    if (!values.isStateRegistrationExempt) {
      if (!isValidStateRegistration(values.stateRegistration, false)) {
        errors.stateRegistration = 'Inscrição estadual é obrigatória quando não isento.';
      }
    }
  } else {
    // 2. Identificação PJ
    const companyName = normalizeText(values.companyName);
    if (!companyName || companyName.length === 0) {
      errors.companyName = 'Razão social é obrigatória.';
    } else if (companyName.length < 3) {
      errors.companyName = 'Razão social deve conter pelo menos 3 caracteres.';
    }

    const cnpjDigits = normalizeDigits(values.cnpj);
    if (!cnpjDigits || cnpjDigits.length === 0) {
      errors.cnpj = 'CNPJ é obrigatório.';
    } else if (!isValidCnpj(cnpjDigits)) {
      errors.cnpj = 'CNPJ inválido. Verifique os dígitos informados.';
    }

    // Inscrição Estadual
    if (!values.isStateRegistrationExempt) {
      if (!isValidStateRegistration(values.stateRegistration, false)) {
        errors.stateRegistration = 'Inscrição estadual é obrigatória quando não isento.';
      }
    }
  }

  // 3. Contatos
  const primaryPhone = normalizeDigits(values.primaryPhone);
  if (!primaryPhone || primaryPhone.length === 0) {
    errors.primaryPhone = 'Telefone principal é obrigatório.';
  } else if (!isValidPhone(primaryPhone)) {
    errors.primaryPhone = 'Telefone principal inválido. Informe DDD + 8 ou 9 dígitos.';
  }

  if (values.secondaryPhone && normalizeDigits(values.secondaryPhone).length > 0) {
    const secondaryDigits = normalizeDigits(values.secondaryPhone);
    if (!isValidPhone(secondaryDigits)) {
      errors.secondaryPhone = 'Telefone secundário inválido. Informe DDD + 8 ou 9 dígitos.';
    } else if (secondaryDigits === primaryPhone) {
      errors.secondaryPhone = 'Telefone secundário não pode ser igual ao principal.';
    }
  }

  if (values.email && normalizeText(values.email).length > 0) {
    if (!isValidEmail(values.email)) {
      errors.email = 'E-mail informado possui formato inválido.';
    }
  }

  // 4. Endereço
  const city = normalizeText(values.city);
  if (!city || city.length === 0) {
    errors.city = 'Município é obrigatório.';
  }

  const state = normalizeText(values.state);
  if (!state || state.length === 0) {
    errors.state = 'UF é obrigatória.';
  } else if (!BRAZILIAN_STATES.some((s) => s.uf === state)) {
    errors.state = 'UF selecionada é inválida.';
  }

  if (values.addressType === 'urban') {
    // Endereço Urbano
    const zipCode = normalizeDigits(values.zipCode);
    if (!zipCode || zipCode.length === 0) {
      errors.zipCode = 'CEP é obrigatório no endereço urbano.';
    } else if (zipCode.length !== 8) {
      errors.zipCode = 'CEP deve conter exatamente 8 dígitos.';
    }

    const street = normalizeText(values.street);
    if (!street || street.length === 0) {
      errors.street = 'Logradouro é obrigatório no endereço urbano.';
    }

    if (!values.isNoNumber) {
      const number = normalizeText(values.number);
      if (!number || number.length === 0) {
        errors.number = 'Número é obrigatório ou marque "Sem número".';
      }
    }

    const neighborhood = normalizeText(values.neighborhood);
    if (!neighborhood || neighborhood.length === 0) {
      errors.neighborhood = 'Bairro é obrigatório no endereço urbano.';
    }
  } else {
    // Endereço Rural
    const locality = normalizeText(values.locality);
    if (!locality || locality.length === 0) {
      errors.locality = 'Localidade, linha ou comunidade é obrigatória.';
    }

    const accessDescription = normalizeText(values.accessDescription);
    if (!accessDescription || accessDescription.length === 0) {
      errors.accessDescription = 'Descrição de acesso ou ponto de referência é obrigatório.';
    }

    if (values.ruralZipCode && normalizeDigits(values.ruralZipCode).length > 0) {
      const ruralZipDigits = normalizeDigits(values.ruralZipCode);
      if (ruralZipDigits.length !== 8) {
        errors.ruralZipCode = 'CEP rural deve conter 8 dígitos quando informado.';
      }
    }
  }

  return errors;
}

/**
 * Converte os valores do formulário para CreateClientInput
 */
export function formValuesToCreateInput(values: ClientFormValues): CreateClientInput {
  const isIndividual = values.personType === 'individual';
  const isUrban = values.addressType === 'urban';

  const contact = {
    primaryPhone: normalizeDigits(values.primaryPhone),
    hasWhatsapp: values.hasWhatsapp,
    secondaryPhone:
      values.secondaryPhone && normalizeDigits(values.secondaryPhone).length > 0
        ? normalizeDigits(values.secondaryPhone)
        : undefined,
    email:
      values.email && normalizeEmail(values.email).length > 0
        ? normalizeEmail(values.email)
        : undefined,
  };

  const address = isUrban
    ? {
        addressType: 'urban' as const,
        zipCode: normalizeDigits(values.zipCode),
        street: normalizeText(values.street),
        number: values.isNoNumber ? 'S/N' : normalizeText(values.number),
        isNoNumber: values.isNoNumber,
        neighborhood: normalizeText(values.neighborhood),
        city: normalizeText(values.city),
        state: normalizeText(values.state),
        complement:
          values.complement && normalizeText(values.complement).length > 0
            ? normalizeText(values.complement)
            : undefined,
        referencePoint:
          values.referencePoint && normalizeText(values.referencePoint).length > 0
            ? normalizeText(values.referencePoint)
            : undefined,
      }
    : {
        addressType: 'rural' as const,
        locality: normalizeText(values.locality),
        accessDescription: normalizeText(values.accessDescription),
        city: normalizeText(values.city),
        state: normalizeText(values.state),
        zipCode:
          values.ruralZipCode && normalizeDigits(values.ruralZipCode).length > 0
            ? normalizeDigits(values.ruralZipCode)
            : undefined,
        complement:
          values.ruralComplement && normalizeText(values.ruralComplement).length > 0
            ? normalizeText(values.ruralComplement)
            : undefined,
      };

  if (isIndividual) {
    return {
      personType: 'individual',
      name: normalizeText(values.name),
      cpf: normalizeDigits(values.cpf),
      rg: values.rg && normalizeText(values.rg).length > 0 ? normalizeText(values.rg) : undefined,
      rgIssuer:
        values.rgIssuer && normalizeText(values.rgIssuer).length > 0
          ? normalizeText(values.rgIssuer)
          : undefined,
      rgState:
        values.rgState && normalizeText(values.rgState).length > 0
          ? normalizeText(values.rgState)
          : undefined,
      birthDate:
        values.birthDate && normalizeText(values.birthDate).length > 0
          ? normalizeText(values.birthDate)
          : undefined,
      stateRegistration:
        !values.isStateRegistrationExempt && values.stateRegistration
          ? normalizeText(values.stateRegistration)
          : undefined,
      isStateRegistrationExempt: values.isStateRegistrationExempt,
      contact,
      address,
      status: values.status,
    };
  } else {
    return {
      personType: 'legal_entity',
      companyName: normalizeText(values.companyName),
      tradeName:
        values.tradeName && normalizeText(values.tradeName).length > 0
          ? normalizeText(values.tradeName)
          : undefined,
      cnpj: normalizeDigits(values.cnpj),
      stateRegistration:
        !values.isStateRegistrationExempt && values.stateRegistration
          ? normalizeText(values.stateRegistration)
          : undefined,
      isStateRegistrationExempt: values.isStateRegistrationExempt,
      contact,
      address,
      status: values.status,
    };
  }
}

/**
 * Converte os valores do formulário para UpdateClientInput
 */
export function formValuesToUpdateInput(values: ClientFormValues): UpdateClientInput {
  const isIndividual = values.personType === 'individual';
  const isUrban = values.addressType === 'urban';

  const contact = {
    primaryPhone: normalizeDigits(values.primaryPhone),
    hasWhatsapp: values.hasWhatsapp,
    secondaryPhone:
      values.secondaryPhone && normalizeDigits(values.secondaryPhone).length > 0
        ? normalizeDigits(values.secondaryPhone)
        : undefined,
    email:
      values.email && normalizeEmail(values.email).length > 0
        ? normalizeEmail(values.email)
        : undefined,
  };

  const address = isUrban
    ? {
        addressType: 'urban' as const,
        zipCode: normalizeDigits(values.zipCode),
        street: normalizeText(values.street),
        number: values.isNoNumber ? 'S/N' : normalizeText(values.number),
        isNoNumber: values.isNoNumber,
        neighborhood: normalizeText(values.neighborhood),
        city: normalizeText(values.city),
        state: normalizeText(values.state),
        complement:
          values.complement && normalizeText(values.complement).length > 0
            ? normalizeText(values.complement)
            : undefined,
        referencePoint:
          values.referencePoint && normalizeText(values.referencePoint).length > 0
            ? normalizeText(values.referencePoint)
            : undefined,
      }
    : {
        addressType: 'rural' as const,
        locality: normalizeText(values.locality),
        accessDescription: normalizeText(values.accessDescription),
        city: normalizeText(values.city),
        state: normalizeText(values.state),
        zipCode:
          values.ruralZipCode && normalizeDigits(values.ruralZipCode).length > 0
            ? normalizeDigits(values.ruralZipCode)
            : undefined,
        complement:
          values.ruralComplement && normalizeText(values.ruralComplement).length > 0
            ? normalizeText(values.ruralComplement)
            : undefined,
      };

  if (isIndividual) {
    return {
      personType: 'individual',
      name: normalizeText(values.name),
      cpf: normalizeDigits(values.cpf),
      rg: values.rg && normalizeText(values.rg).length > 0 ? normalizeText(values.rg) : undefined,
      rgIssuer:
        values.rgIssuer && normalizeText(values.rgIssuer).length > 0
          ? normalizeText(values.rgIssuer)
          : undefined,
      rgState:
        values.rgState && normalizeText(values.rgState).length > 0
          ? normalizeText(values.rgState)
          : undefined,
      birthDate:
        values.birthDate && normalizeText(values.birthDate).length > 0
          ? normalizeText(values.birthDate)
          : undefined,
      stateRegistration:
        !values.isStateRegistrationExempt && values.stateRegistration
          ? normalizeText(values.stateRegistration)
          : undefined,
      isStateRegistrationExempt: values.isStateRegistrationExempt,
      contact,
      address,
      status: values.status,
    };
  } else {
    return {
      personType: 'legal_entity',
      companyName: normalizeText(values.companyName),
      tradeName:
        values.tradeName && normalizeText(values.tradeName).length > 0
          ? normalizeText(values.tradeName)
          : undefined,
      cnpj: normalizeDigits(values.cnpj),
      stateRegistration:
        !values.isStateRegistrationExempt && values.stateRegistration
          ? normalizeText(values.stateRegistration)
          : undefined,
      isStateRegistrationExempt: values.isStateRegistrationExempt,
      contact,
      address,
      status: values.status,
    };
  }
}
