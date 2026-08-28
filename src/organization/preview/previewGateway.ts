import {
  OrganizationGateway,
  OrganizationContextData,
  OrganizationMembership,
  Organization,
} from '../../types/organization';
import { PREVIEW_STORAGE_KEYS } from '../../auth/preview/previewKeys';
import { PREVIEW_ACCOUNTS } from '../../auth/preview/previewAccounts';

const DEFAULT_ORG_ID = 'preview-org-default';
const DEFAULT_ORG_NAME = 'Organização de acompanhamento';
const CUSTOM_ORG_ID = 'preview-org-custom';

interface StoredOrgContext {
  id: string;
  name: string;
  userId: string;
  createdAt: number;
}

/**
 * PreviewOrganizationGateway
 * Gateway de contexto organizacional exclusivo para o ambiente de desenvolvimento (DEV).
 * Restrito exclusivamente aos 7 perfis de acompanhamento.
 */
export class PreviewOrganizationGateway implements OrganizationGateway {
  private getStoredContext(): StoredOrgContext | null {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
      const raw = sessionStorage.getItem(PREVIEW_STORAGE_KEYS.ORG_CONTEXT);
      if (!raw) return null;
      return JSON.parse(raw) as StoredOrgContext;
    } catch {
      return null;
    }
  }

  private getStoredPreference(): string | null {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
      return sessionStorage.getItem(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE);
    } catch {
      return null;
    }
  }

  async loadContext(userId: string): Promise<OrganizationContextData> {
    const account = PREVIEW_ACCOUNTS.find((acc) => acc.id === userId || acc.email === userId);

    // 1. Caso Superadministrador da plataforma (escopo global/plataforma)
    if (account && account.scopeType === 'platform') {
      return {
        status: 'active',
        activeOrganization: null,
        activeMembership: null,
        availableMemberships: [],
      };
    }

    // 2. Se o usuário não for encontrado entre os perfis de acompanhamento
    if (!account) {
      return {
        status: 'unavailable',
        activeOrganization: null,
        activeMembership: null,
        availableMemberships: [],
      };
    }

    // 3. Verifica se o usuário configurou uma organização localmente
    const storedContext = this.getStoredContext();
    const availableMemberships: OrganizationMembership[] = [];

    let primaryOrg: Organization;
    let primaryMembership: OrganizationMembership;

    if (storedContext && storedContext.userId === account.id) {
      primaryOrg = {
        id: storedContext.id,
        name: storedContext.name,
        status: 'active',
      };
      primaryMembership = {
        organizationId: storedContext.id,
        userId: account.id,
        organizationRole: 'owner',
        status: 'active',
        organizationName: storedContext.name,
      };
    } else {
      primaryOrg = {
        id: DEFAULT_ORG_ID,
        name: DEFAULT_ORG_NAME,
        status: 'active',
      };
      primaryMembership = {
        organizationId: DEFAULT_ORG_ID,
        userId: account.id,
        organizationRole: account.organizationRole,
        status: 'active',
        organizationName: DEFAULT_ORG_NAME,
      };
    }

    availableMemberships.push(primaryMembership);

    // 4. Revalida a preferência de organização se houver
    const storedPreference = this.getStoredPreference();
    let selectedOrg = primaryOrg;
    let selectedMembership = primaryMembership;

    if (storedPreference) {
      const match = availableMemberships.find((m) => m.organizationId === storedPreference);
      if (match) {
        selectedMembership = match;
        selectedOrg = {
          id: match.organizationId,
          name: match.organizationName || primaryOrg.name,
          status: 'active',
        };
      } else {
        // Ignora preferência manipulada ou inválida
        try {
          sessionStorage.removeItem(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE);
        } catch {
          // No-op
        }
      }
    }

    return {
      status: 'active',
      activeOrganization: selectedOrg,
      activeMembership: selectedMembership,
      availableMemberships,
    };
  }

  async listMemberships(userId: string): Promise<OrganizationMembership[]> {
    const data = await this.loadContext(userId);
    return data.availableMemberships;
  }

  async selectOrganization(orgId: string): Promise<boolean> {
    if (!orgId || typeof orgId !== 'string') return false;

    if (typeof window === 'undefined' || !window.sessionStorage) return false;

    // Apenas IDs conhecidos no acompanhamento
    if (orgId !== DEFAULT_ORG_ID && orgId !== CUSTOM_ORG_ID) {
      return false;
    }

    try {
      sessionStorage.setItem(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE, orgId);
      return true;
    } catch {
      return false;
    }
  }

  async configureInitialOrganization(name: string, userId: string): Promise<boolean> {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 100) {
      return false;
    }

    if (typeof window === 'undefined' || !window.sessionStorage) return false;

    const payload: StoredOrgContext = {
      id: CUSTOM_ORG_ID,
      name: trimmed,
      userId,
      createdAt: Date.now(),
    };

    try {
      sessionStorage.setItem(PREVIEW_STORAGE_KEYS.ORG_CONTEXT, JSON.stringify(payload));
      sessionStorage.setItem(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE, CUSTOM_ORG_ID);
      return true;
    } catch {
      return false;
    }
  }

  async clearPreference(): Promise<void> {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      sessionStorage.removeItem(PREVIEW_STORAGE_KEYS.ORG_PREFERENCE);
      sessionStorage.removeItem(PREVIEW_STORAGE_KEYS.ORG_CONTEXT);
    } catch {
      // No-op
    }
  }
}
