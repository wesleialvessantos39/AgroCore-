import { ClientGateway } from '../types/client';
import { UnavailableClientGateway } from './unavailableGateway';
import { PreviewClientGateway } from './preview/previewClientGateway';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { SupabaseClientGateway } from './supabaseClientGateway';

let activeGatewayInstance: ClientGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

/**
 * Retorna a instância ativa do Gateway de Clientes de acordo com o ambiente de execução.
 * Em produção, garante retorno estrito do UnavailableClientGateway.
 */
export function getClientGateway(): ClientGateway {
  if (activeGatewayInstance) {
    return activeGatewayInstance;
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    activeGatewayInstance = new SupabaseClientGateway(supabase);
    return activeGatewayInstance;
  }

  if (import.meta.env.DEV) {
    const previewInstance = new PreviewClientGateway();
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

  activeGatewayInstance = new UnavailableClientGateway();
  return activeGatewayInstance;
}

/**
 * Permite redefinir a instância ativa do gateway para testes ou simulações isoladas.
 */
export function setClientGatewayForTesting(gateway: ClientGateway | null): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGatewayInstance = gateway;
}
