/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Gateway Indisponível de Georreferenciamento Interno (PROD sem persistência)
 */

import {
  PropertyGeometryGateway,
  PropertyGeometry,
  PropertyGeometrySummary,
  SavePropertyGeometryInput,
  PropertyGeometryMutationResult,
} from '../../types/propertyGeometry';

export class UnavailablePropertyGeometryGateway implements PropertyGeometryGateway {
  async getPropertyGeometry(
    _propertyId: string,
    _organizationId: string
  ): Promise<PropertyGeometry | null> {
    throw new Error('Serviço de georreferenciamento indisponível neste ambiente.');
  }

  async savePropertyGeometry(
    _input: SavePropertyGeometryInput
  ): Promise<PropertyGeometryMutationResult> {
    throw new Error('Serviço de georreferenciamento indisponível neste ambiente.');
  }

  async getPropertyGeometrySummary(
    _propertyId: string,
    _organizationId: string
  ): Promise<PropertyGeometrySummary> {
    throw new Error('Serviço de georreferenciamento indisponível neste ambiente.');
  }

  async clearPropertyGeometry(
    _propertyId: string,
    _organizationId: string
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error('Serviço de georreferenciamento indisponível neste ambiente.');
  }

  async clearAllSessionData(): Promise<void> {
    // No-op
  }
}
