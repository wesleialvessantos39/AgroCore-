import { PropertyGateway } from '../types/property';
import { UnavailablePropertyGateway } from './unavailableGateway';
import { PreviewPropertyGateway } from './preview/previewPropertyGateway';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { SupabasePropertyGateway } from './supabasePropertyGateway';

let activeGatewayInstance: PropertyGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

/**
 * Retorna a instância ativa do Gateway de Imóveis de acordo com o ambiente de execução.
 * Em produção, garante retorno estrito do UnavailablePropertyGateway.
 */
export function getPropertyGateway(): PropertyGateway {
  if (activeGatewayInstance) {
    return activeGatewayInstance;
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    activeGatewayInstance = new SupabasePropertyGateway(supabase);
    return activeGatewayInstance;
  }

  if (import.meta.env.DEV) {
    const previewInstance = new PreviewPropertyGateway();
    if (unregisterCleanup) {
      unregisterCleanup();
      unregisterCleanup = null;
    }
    unregisterCleanup = registerDomainCleanup(() => {
      previewInstance.clearAllSessionData();
    });
    activeGatewayInstance = previewInstance;
    return activeGatewayInstance;
  }

  activeGatewayInstance = new UnavailablePropertyGateway();
  return activeGatewayInstance;
}

/**
 * Permite redefinir a instância ativa do gateway para testes ou simulações isoladas.
 */
export function setPropertyGatewayForTesting(gateway: PropertyGateway | null): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGatewayInstance = gateway;
}
