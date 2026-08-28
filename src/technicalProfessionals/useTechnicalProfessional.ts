/**
 * Hook para consumo do Contexto de Perfis Profissionais Técnicos
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { useContext } from 'react';
import {
  TechnicalProfessionalContext,
  TechnicalProfessionalContextValue,
} from './TechnicalProfessionalContext';

export function useTechnicalProfessional(): TechnicalProfessionalContextValue {
  const context = useContext(TechnicalProfessionalContext);
  if (!context) {
    throw new Error('useTechnicalProfessional deve ser utilizado dentro de um TechnicalProfessionalProvider.');
  }
  return context;
}
