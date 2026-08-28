/**
 * Helpers para Apresentação e Tipagem Segura de Clientes
 * AgroCore — Módulo 002 & Módulo 004
 */

import { Client } from '../types/client';
import { maskCpf, maskCnpj } from './validators';

export function getClientDisplayName(client: Client | null | undefined): string {
  if (!client) return '';
  return client.personType === 'individual' ? client.name : client.companyName;
}

export function getClientDocumentFormatted(client: Client | null | undefined): string {
  if (!client) return '';
  return client.personType === 'individual' ? maskCpf(client.cpf) : maskCnpj(client.cnpj);
}
