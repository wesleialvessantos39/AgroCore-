/**
 * Contexto de Perfil Profissional Técnico
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Princípios Arquiteturais:
 * 1. Isolamento estrito multitenant por organização ativa
 * 2. RBAC granular (view_self vs update_self vs verify)
 * 3. Avaliação pura de elegibilidade técnica sem dados mock
 * 4. Tipagem estrita e normalização de erros sem uso de "any"
 */

import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import { useAuthorization } from '../authorization/useAuthorization';
import {
  TechnicalProfessionalProfile,
  TechnicalEligibilityEvaluation,
  ProfessionalCouncil,
  ProfessionalDiscipline,
} from '../types/technicalProfessional';
import { getTechnicalProfessionalGateway } from './gatewayFactory';
import { evaluateTechnicalEligibility } from '../appraisals/technicalEligibilityEvaluator';

export interface TechnicalProfessionalContextValue {
  readonly profile: TechnicalProfessionalProfile | null;
  readonly eligibility: TechnicalEligibilityEvaluation | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshProfile: () => Promise<void>;
  readonly createOrUpdateProfile: (data: {
    council: ProfessionalCouncil;
    registrationNumber: string;
    registrationUf: string;
    declaredTitle: string;
    discipline: ProfessionalDiscipline;
    registeredSpecialty?: string;
    validUntil?: string;
  }) => Promise<TechnicalProfessionalProfile>;
}

export const TechnicalProfessionalContext = createContext<TechnicalProfessionalContextValue | null>(null);

export function TechnicalProfessionalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = useAuth();
  const { activeOrganization } = useOrganization();
  const { can, activePermissions } = useAuthorization();

  const [profile, setProfile] = useState<TechnicalProfessionalProfile | null>(null);
  const [eligibility, setEligibility] = useState<TechnicalEligibilityEvaluation | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Limpeza imediata ao trocar organização ou deslogar
  useEffect(() => {
    if (!activeOrganization?.id || !session?.user?.id) {
      setProfile(null);
      setEligibility(null);
      setError(null);
      setIsLoading(false);
    }
  }, [activeOrganization?.id, session?.user?.id]);

  const canViewSelf = can('technical_professionals:view_self') || can('technical_professionals:verify');
  const canUpdateSelf = can('technical_professionals:update_self');

  const fetchProfile = useCallback(async () => {
    if (!session?.user?.id || !activeOrganization?.id) {
      setProfile(null);
      setEligibility(null);
      return;
    }

    if (!canViewSelf) {
      setProfile(null);
      setEligibility(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsLoading(true);
    setError(null);

    try {
      const gateway = getTechnicalProfessionalGateway();
      const currentProfile = await gateway.getProfileByUserId(
        activeOrganization.id,
        session.user.id,
        signal
      );

      setProfile(currentProfile);

      const evaluation = evaluateTechnicalEligibility({
        userPermissions: Array.from(activePermissions),
        activeOrganizationId: activeOrganization.id,
        targetOrganizationId: activeOrganization.id,
        profile: currentProfile,
      });

      setEligibility(evaluation);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Erro ao carregar perfil profissional técnico.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id, activeOrganization?.id, activePermissions, canViewSelf]);

  useEffect(() => {
    fetchProfile();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  const createOrUpdateProfile = useCallback(
    async (data: {
      council: ProfessionalCouncil;
      registrationNumber: string;
      registrationUf: string;
      declaredTitle: string;
      discipline: ProfessionalDiscipline;
      registeredSpecialty?: string;
      validUntil?: string;
    }): Promise<TechnicalProfessionalProfile> => {
      if (!session?.user?.id || !activeOrganization?.id) {
        throw new Error('Usuário sem sessão ativa ou organização selecionada.');
      }

      if (!canUpdateSelf) {
        throw new Error('Acesso negado: você não possui permissão para declarar ou alterar dados do perfil profissional técnico.');
      }

      setIsLoading(true);
      setError(null);

      try {
        const gateway = getTechnicalProfessionalGateway();
        let saved: TechnicalProfessionalProfile;

        if (profile) {
          saved = await gateway.updateProfile({
            organizationId: activeOrganization.id,
            profileId: profile.id,
            council: data.council,
            registrationNumber: data.registrationNumber,
            registrationUf: data.registrationUf,
            declaredTitle: data.declaredTitle,
            discipline: data.discipline,
            registeredSpecialty: data.registeredSpecialty,
            validUntil: data.validUntil,
          });
        } else {
          saved = await gateway.createProfile({
            organizationId: activeOrganization.id,
            userId: session.user.id,
            council: data.council,
            registrationNumber: data.registrationNumber,
            registrationUf: data.registrationUf,
            declaredTitle: data.declaredTitle,
            discipline: data.discipline,
            registeredSpecialty: data.registeredSpecialty,
            validUntil: data.validUntil,
          });
        }

        setProfile(saved);

        const evaluation = evaluateTechnicalEligibility({
          userPermissions: Array.from(activePermissions),
          activeOrganizationId: activeOrganization.id,
          targetOrganizationId: activeOrganization.id,
          profile: saved,
        });

        setEligibility(evaluation);
        return saved;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao salvar perfil profissional técnico.';
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [session?.user?.id, activeOrganization?.id, activePermissions, canUpdateSelf, profile]
  );

  const value = useMemo(
    () => ({
      profile,
      eligibility,
      isLoading,
      error,
      refreshProfile,
      createOrUpdateProfile,
    }),
    [profile, eligibility, isLoading, error, refreshProfile, createOrUpdateProfile]
  );

  return (
    <TechnicalProfessionalContext.Provider value={value}>
      {children}
    </TechnicalProfessionalContext.Provider>
  );
}
