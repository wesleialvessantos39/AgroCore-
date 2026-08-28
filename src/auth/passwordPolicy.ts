/**
 * Política centralizada de validação de senha do AgroCore.
 * Regras tipadas e desacopladas para uso na interface e futura integração com o provedor de identidade oficial.
 */

export interface PasswordCriterion {
  id: 'length' | 'uppercase' | 'lowercase' | 'number' | 'special';
  label: string;
  met: boolean;
}

export interface PasswordValidationResult {
  isValid: boolean;
  criteria: PasswordCriterion[];
  passwordsMatch: boolean;
  errorMessages: string[];
}

export const PASSWORD_RULES = {
  MIN_LENGTH: 8,
  SPECIAL_CHARS_REGEX: /[^A-Za-z0-9]/,
  UPPERCASE_REGEX: /[A-Z]/,
  LOWERCASE_REGEX: /[a-z]/,
  NUMBER_REGEX: /[0-9]/,
} as const;

export function evaluatePasswordPolicy(password: string, confirmPassword = ''): PasswordValidationResult {
  const isLengthMet = password.length >= PASSWORD_RULES.MIN_LENGTH;
  const isUppercaseMet = PASSWORD_RULES.UPPERCASE_REGEX.test(password);
  const isLowercaseMet = PASSWORD_RULES.LOWERCASE_REGEX.test(password);
  const isNumberMet = PASSWORD_RULES.NUMBER_REGEX.test(password);
  const isSpecialMet = PASSWORD_RULES.SPECIAL_CHARS_REGEX.test(password);

  const criteria: PasswordCriterion[] = [
    {
      id: 'length',
      label: `Mínimo de ${PASSWORD_RULES.MIN_LENGTH} caracteres`,
      met: isLengthMet,
    },
    {
      id: 'uppercase',
      label: 'Pelo menos uma letra maiúscula',
      met: isUppercaseMet,
    },
    {
      id: 'lowercase',
      label: 'Pelo menos uma letra minúscula',
      met: isLowercaseMet,
    },
    {
      id: 'number',
      label: 'Pelo menos um número',
      met: isNumberMet,
    },
    {
      id: 'special',
      label: 'Pelo menos um caractere especial (ex: @, #, $, !)',
      met: isSpecialMet,
    },
  ];

  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  const errorMessages: string[] = [];
  criteria.forEach((criterion) => {
    if (!criterion.met) {
      errorMessages.push(criterion.label);
    }
  });

  if (confirmPassword.length > 0 && !passwordsMatch) {
    errorMessages.push('As senhas digitadas não coincidem');
  }

  const allCriteriaMet = criteria.every((c) => c.met);
  const isValid = allCriteriaMet && passwordsMatch;

  return {
    isValid,
    criteria,
    passwordsMatch,
    errorMessages,
  };
}
