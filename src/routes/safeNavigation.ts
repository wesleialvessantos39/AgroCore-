import { ROUTES } from './paths';

/**
 * Lista de prefixos e rotas internas seguras e permitidas para redirecionamento pós-autenticação.
 */
const SAFE_INTERNAL_PREFIXES = [
  ROUTES.SYSTEM,
  ROUTES.CLIENTS,
  ROUTES.PROPERTIES,
  ROUTES.APPRAISALS,
  ROUTES.APPRAISAL_REQUESTS,
  ROUTES.PROPOSALS,
  ROUTES.DOCUMENTS,
  ROUTES.MY_ACCOUNT,
  ROUTES.CONFIG_ORGANIZATION,
  ROUTES.SELECT_ORGANIZATION,
  ROUTES.PENDING_ACCESS,
  ROUTES.PRESENTATION,
  ROUTES.ACCESS_DENIED,
];

/**
 * getSafeRedirectUrl
 *
 * Sanitiza rigorosamente qualquer URL ou caminho de redirecionamento recebido via query params,
 * state de navegação ou inputs externos, prevenindo vulnerabilidades de Open Redirect.
 *
 * REGRAS DE SEGURANÇA:
 * 1. Deve ser do tipo string e não vazio.
 * 2. Deve iniciar estritamente com '/' e NÃO com '//' (que o navegador interpreta como protocolo agnóstico).
 * 3. Não pode conter caracteres de controle, quebras de linha ou caracteres de bypass como '\'.
 * 4. Não pode conter esquemas como 'http:', 'https:', 'javascript:', 'data:', 'vbscript:'.
 * 5. Deve corresponder a uma rota interna válida ou iniciar com um prefixo interno seguro.
 * 6. Se qualquer condição for violada, retorna o destino padrão seguro (`fallback`, default: `/sistema`).
 */
export function getSafeRedirectUrl(
  candidate: unknown,
  fallback: string = ROUTES.SYSTEM
): string {
  if (typeof candidate !== 'string') {
    return fallback;
  }

  const trimmed = candidate.trim();

  // 1. Deve ter comprimento mínimo e máximo razoável
  if (trimmed.length === 0 || trimmed.length > 512) {
    return fallback;
  }

  // 2. Não pode conter caracteres perigosos de injeção ou bypass
  if (/[\r\n\t\0\\]/.test(trimmed)) {
    return fallback;
  }

  // 3. Deve iniciar com '/' e NÃO com '//'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }

  // 4. Bloqueia esquemas explícitos
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  // 5. Normaliza e extrai apenas o pathname sem query/hash para verificação de rota
  const pathOnly = trimmed.split('?')[0].split('#')[0];

  // 6. Raiz '/' mapeia para a área do sistema
  if (pathOnly === '/' || pathOnly === '') {
    return ROUTES.SYSTEM;
  }

  // 7. Não permite redirecionar de volta para a tela de login ou recuperação se já estiver autenticando
  if (
    pathOnly === ROUTES.SIGN_IN ||
    pathOnly === ROUTES.RECOVER_ACCESS ||
    pathOnly === ROUTES.RESET_PASSWORD
  ) {
    return ROUTES.SYSTEM;
  }

  // 8. Deve coincidir com uma rota segura ou iniciar com um prefixo conhecido
  const isSafe = SAFE_INTERNAL_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)
  );

  return isSafe ? trimmed : fallback;
}
