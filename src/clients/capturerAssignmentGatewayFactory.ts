/**
 * Factory do Gateway de Vínculos Cliente-Captador
 * Módulos 002, 004 e OE-007.004 — AgroCore
 */

import type { ClientCapturerAssignmentGateway } from '../types/clientCapturerAssignment';
import { registerDomainCleanup } from '../auth/domainCleanupRegistry';
import { getSupabaseClient } from '../infrastructure/supabaseClient';
import { SupabaseClientCapturerAssignmentGateway } from './supabaseCapturerAssignmentGateway';
import { UnavailableClientCapturerAssignmentGateway } from './unavailableCapturerAssignmentGateway';

class LazyDevelopmentCapturerAssignmentGateway
  implements ClientCapturerAssignmentGateway
{
  private instancePromise: Promise<ClientCapturerAssignmentGateway> | null = null;

  private load(): Promise<ClientCapturerAssignmentGateway> {
    if (!this.instancePromise) {
      this.instancePromise = import('./preview/previewCapturerAssignmentGateway').then(
        (module) => new module.PreviewClientCapturerAssignmentGateway()
      );
    }
    return this.instancePromise;
  }

  async listAssignmentsByClient(
    ...args: Parameters<ClientCapturerAssignmentGateway['listAssignmentsByClient']>
  ) {
    return (await this.load()).listAssignmentsByClient(...args);
  }

  async getActiveAssignment(
    ...args: Parameters<ClientCapturerAssignmentGateway['getActiveAssignment']>
  ) {
    return (await this.load()).getActiveAssignment(...args);
  }

  async listClientsByCapturer(
    ...args: Parameters<ClientCapturerAssignmentGateway['listClientsByCapturer']>
  ) {
    return (await this.load()).listClientsByCapturer(...args);
  }

  async assignCapturer(
    ...args: Parameters<ClientCapturerAssignmentGateway['assignCapturer']>
  ) {
    return (await this.load()).assignCapturer(...args);
  }

  async transferCapturer(
    ...args: Parameters<ClientCapturerAssignmentGateway['transferCapturer']>
  ) {
    return (await this.load()).transferCapturer(...args);
  }

  async terminateAssignment(
    ...args: Parameters<ClientCapturerAssignmentGateway['terminateAssignment']>
  ) {
    return (await this.load()).terminateAssignment(...args);
  }

  clearAllSessionData(): void {
    if (this.instancePromise) {
      void this.instancePromise.then((gateway) => {
        const cleanup = gateway as ClientCapturerAssignmentGateway & {
          clearAllSessionData?: () => void;
        };
        cleanup.clearAllSessionData?.();
      });
    }
    this.instancePromise = null;
  }
}

let activeGatewayInstance: ClientCapturerAssignmentGateway | null = null;
let unregisterCleanup: (() => void) | null = null;

export function getClientCapturerAssignmentGateway(): ClientCapturerAssignmentGateway {
  if (activeGatewayInstance) return activeGatewayInstance;

  const supabase = getSupabaseClient();
  if (supabase) {
    activeGatewayInstance = new SupabaseClientCapturerAssignmentGateway(supabase);
    return activeGatewayInstance;
  }

  if (import.meta.env.DEV) {
    const preview = new LazyDevelopmentCapturerAssignmentGateway();
    if (unregisterCleanup) unregisterCleanup();
    unregisterCleanup = registerDomainCleanup(() => preview.clearAllSessionData());
    activeGatewayInstance = preview;
    return activeGatewayInstance;
  }

  activeGatewayInstance = new UnavailableClientCapturerAssignmentGateway();
  return activeGatewayInstance;
}

export function setClientCapturerAssignmentGatewayForTesting(
  gateway: ClientCapturerAssignmentGateway | null
): void {
  if (unregisterCleanup) {
    unregisterCleanup();
    unregisterCleanup = null;
  }
  activeGatewayInstance = gateway;
}
