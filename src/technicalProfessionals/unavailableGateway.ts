/**
 * UnavailableTechnicalProfessionalGateway
 *
 * Implementação segura para ambiente sem persistência real de perfis profissionais técnicos.
 */

import {
  TechnicalProfessionalFilterParams,
  TechnicalProfessionalProfile,
  TechnicalProfessionalProfileId,
} from '../types/technicalProfessional';
import {
  CreateTechnicalProfileInput,
  TechnicalProfessionalGateway,
  UpdateTechnicalProfileInput,
  VerifyTechnicalProfileInput,
} from './gateway';

export class UnavailableTechnicalProfessionalGateway implements TechnicalProfessionalGateway {
  async getProfileByUserId(
    _organizationId: string,
    _userId: string,
    _signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile | null> {
    throw new Error('O serviço de perfis profissionais técnicos não está disponível neste ambiente.');
  }

  async getProfileById(
    _organizationId: string,
    _profileId: TechnicalProfessionalProfileId,
    _signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile | null> {
    throw new Error('O serviço de perfis profissionais técnicos não está disponível neste ambiente.');
  }

  async listProfiles(
    _params: TechnicalProfessionalFilterParams,
    _signal?: AbortSignal
  ): Promise<readonly TechnicalProfessionalProfile[]> {
    throw new Error('O serviço de perfis profissionais técnicos não está disponível neste ambiente.');
  }

  async createProfile(
    _input: CreateTechnicalProfileInput,
    _signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile> {
    throw new Error('O serviço de perfis profissionais técnicos não está disponível neste ambiente.');
  }

  async updateProfile(
    _input: UpdateTechnicalProfileInput,
    _signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile> {
    throw new Error('O serviço de perfis profissionais técnicos não está disponível neste ambiente.');
  }

  async verifyProfile(
    _input: VerifyTechnicalProfileInput,
    _signal?: AbortSignal
  ): Promise<TechnicalProfessionalProfile> {
    throw new Error('O serviço de perfis profissionais técnicos não está disponível neste ambiente.');
  }

  clearAllSessionData(): void {
    // Sem operação em ambiente indisponível
  }
}
