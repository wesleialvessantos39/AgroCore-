/**
 * PreviewTechnicalProfessionalGateway
 *
 * Implementação em memória para ambiente de preview.
 * Isolado por organizationId, suporte a AbortSignal, sem dados falsos iniciais.
 */

import {
  TechnicalProfessionalFilterParams,
  TechnicalProfessionalProfile,
  TechnicalProfessionalProfileId,
} from '../../types/technicalProfessional';
import {
  CreateTechnicalProfileInput,
  TechnicalProfessionalGateway,
  UpdateTechnicalProfileInput,
  VerifyTechnicalProfileInput,
} from '../gateway';

export class PreviewTechnicalProfessionalGateway implements TechnicalProfessionalGateway {
  // Mapa em memória por organizationId -> Array de TechnicalProfessionalProfile
  private store: Map<string, TechnicalProfessionalProfile[]> = new Map();

  /**
   * Limpa integralmente a memória volátil (utilizado no logout ou reinício de sessão).
   * Implementa o contrato canônico clearAllSessionData().
   */
  clearAllSessionData(): void {
    this.store.clear();
  }

  /**
   * Alias de compatibilidade para clearAllSessionData.
   */
  clearTemporaryData(): void {
    this.clearAllSessionData();
  }

  async getProfileByUserId(
    organizationId: string,
    userId: string,
    signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile | null> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const orgProfiles = this.store.get(organizationId) || [];
    const found = orgProfiles.find((p) => p.userId === userId);
    return found ? { ...found } : null;
  }

  async getProfileById(
    organizationId: string,
    profileId: TechnicalProfessionalProfileId,
    signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile | null> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const orgProfiles = this.store.get(organizationId) || [];
    const found = orgProfiles.find((p) => p.id === profileId);
    return found ? { ...found } : null;
  }

  async listProfiles(
    params: TechnicalProfessionalFilterParams,
    signal?: AbortSignal
  ): Promise<readonly TechnicalProfessionalProfile[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const orgProfiles = this.store.get(params.organizationId) || [];

    return orgProfiles.filter((p) => {
      if (params.status && p.status !== params.status) return false;
      if (params.discipline && p.discipline !== params.discipline) return false;
      if (params.council && p.council !== params.council) return false;
      if (params.search && params.search.trim()) {
        const query = params.search.toLowerCase().trim();
        const matchesName = p.declaredTitle.toLowerCase().includes(query);
        const matchesReg = p.registrationNumber.toLowerCase().includes(query);
        if (!matchesName && !matchesReg) return false;
      }
      return true;
    }).map((p) => ({ ...p }));
  }

  async createProfile(
    input: CreateTechnicalProfileInput,
    signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const now = new Date().toISOString();
    const newId: TechnicalProfessionalProfileId = `prof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newProfile: TechnicalProfessionalProfile = {
      id: newId,
      organizationId: input.organizationId,
      userId: input.userId,
      council: input.council,
      registrationNumber: input.registrationNumber,
      registrationUf: input.registrationUf,
      declaredTitle: input.declaredTitle,
      registeredSpecialty: input.registeredSpecialty,
      discipline: input.discipline,
      responsibilityDocumentType: input.responsibilityDocumentType,
      status: 'pending_review',
      capabilities: input.capabilities ? [...input.capabilities] : [],
      validUntil: input.validUntil,
      createdAt: now,
      updatedAt: now,
    };

    const currentList = this.store.get(input.organizationId) || [];
    const existingIndex = currentList.findIndex((p) => p.userId === input.userId);
    if (existingIndex >= 0) {
      currentList[existingIndex] = newProfile;
    } else {
      currentList.push(newProfile);
    }
    this.store.set(input.organizationId, [...currentList]);

    return { ...newProfile };
  }

  async updateProfile(
    input: UpdateTechnicalProfileInput,
    signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const current = await this.getProfileById(input.organizationId, input.profileId, signal);
    if (!current) {
      throw new Error('Perfil profissional técnico não encontrado.');
    }

    const now = new Date().toISOString();
    const updated: TechnicalProfessionalProfile = {
      ...current,
      council: input.council || current.council,
      registrationNumber: input.registrationNumber || current.registrationNumber,
      registrationUf: input.registrationUf || current.registrationUf,
      declaredTitle: input.declaredTitle || current.declaredTitle,
      registeredSpecialty: input.registeredSpecialty !== undefined ? input.registeredSpecialty : current.registeredSpecialty,
      discipline: input.discipline || current.discipline,
      responsibilityDocumentType: input.responsibilityDocumentType || current.responsibilityDocumentType,
      capabilities: input.capabilities !== undefined ? [...input.capabilities] : current.capabilities,
      validUntil: input.validUntil !== undefined ? input.validUntil : current.validUntil,
      updatedAt: now,
    };

    const orgProfiles = this.store.get(input.organizationId) || [];
    const index = orgProfiles.findIndex((p) => p.id === input.profileId);
    if (index >= 0) {
      orgProfiles[index] = updated;
      this.store.set(input.organizationId, [...orgProfiles]);
    }

    return { ...updated };
  }

  async verifyProfile(
    input: VerifyTechnicalProfileInput,
    signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }

    const current = await this.getProfileById(input.organizationId, input.profileId, signal);
    if (!current) {
      throw new Error('Perfil profissional técnico não encontrado.');
    }

    const now = new Date().toISOString();
    const updated: TechnicalProfessionalProfile = {
      ...current,
      status: input.status,
      verifiedByUserId: input.verifiedByUserId,
      verificationSource: input.verificationSource,
      verifiedAt: now,
      impediments: input.impediments ? [...input.impediments] : [],
      capabilities: input.capabilities ? [...input.capabilities] : current.capabilities,
      updatedAt: now,
    };

    const orgProfiles = this.store.get(input.organizationId) || [];
    const index = orgProfiles.findIndex((p) => p.id === input.profileId);
    if (index >= 0) {
      orgProfiles[index] = updated;
      this.store.set(input.organizationId, [...orgProfiles]);
    }

    return { ...updated };
  }
}
