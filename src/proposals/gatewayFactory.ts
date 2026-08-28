import { ProposalGateway } from './gateway';
import { UnavailableProposalGateway } from './unavailableGateway';
import { PreviewProposalGateway } from './preview/previewProposalGateway';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';

let activeGatewayInstance: ProposalGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

/**
 * Retorna a instância ativa do Gateway de Propostas de acordo com o ambiente de execução.
 * Em produção, garante retorno estrito do UnavailableProposalGateway.
 */
export function getProposalGateway(): ProposalGateway {
  if (activeGatewayInstance) {
    return activeGatewayInstance;
  }

  if (import.meta.env.DEV) {
    const previewInstance = new PreviewProposalGateway();
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

  activeGatewayInstance = new UnavailableProposalGateway();
  return activeGatewayInstance;
}

/**
 * Permite redefinir a instância ativa do gateway para testes ou simulações isoladas.
 */
export function setProposalGatewayForTesting(gateway: ProposalGateway | null): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGatewayInstance = gateway;
}
