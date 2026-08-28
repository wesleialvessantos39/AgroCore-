/**
 * Hook para consumo do Contexto de Laudos e Solicitações de Avaliação
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import { useContext } from 'react';
import { AppraisalsContext, AppraisalsContextValue } from './AppraisalsContext';

export function useAppraisals(): AppraisalsContextValue {
  const context = useContext(AppraisalsContext);
  if (!context) {
    throw new Error('useAppraisals deve ser utilizado dentro de um AppraisalsProvider.');
  }
  return context;
}
